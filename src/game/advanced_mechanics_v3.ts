import * as THREE from 'three'
import { enemies, gameState, getPlayer, spawnBurst, type Entity } from '../ecs/world'
import { abilities, hasSynergy, synLevel } from './abilities'
import { events, type DamageElement } from './events'
import { nextRandom, randomInt, randomRange } from './rng'
import { onSimulationTick } from './simulation_clock'

/**
 * ANATEMA ADVANCED MECHANICS V3
 *
 * This module intentionally owns only transient run mechanics. Permanent meta
 * progression stays elsewhere; ECS entities remain the source of truth for
 * combat state; events are the integration boundary for UI/VFX/audio.
 */

type Stop = () => void
type AffixKind = 'berserker' | 'vampiric' | 'frostbound' | 'volatile' | 'shielded' | 'phantom' | 'venomous' | 'juggernaut' | 'reckless' | 'echo'
type ReactionKind = 'ignite' | 'shatter' | 'overload' | 'detonate' | 'rupture' | 'voidburst' | 'execution'
type HazardKind = 'ashfall' | 'bloodpool' | 'frostline' | 'voidrift' | 'thunder'

interface EliteState {
  affixes: AffixKind[]
  shield: number
  shieldMax: number
  rage: number
  lastHitAt: number
  contactCooldown: number
  phaseSeed: number
  volatileReady: boolean
  echoTimer: number
}

interface MarkState {
  stacks: number
  expiresAt: number
  lastSource: string
}

interface ComboState {
  tier: number
  multiplier: number
  lastKillAt: number
  killChain: number
  peakTier: number
  momentum: number
}

interface HazardState {
  kind: HazardKind
  position: THREE.Vector3
  radius: number
  life: number
  tick: number
  intensity: number
}

interface TelemetryState {
  hits: number
  crits: number
  executions: number
  reactions: number
  perfectDodges: number
  eliteKills: number
  bossDamage: number
  damageDealt: number
}

const eliteStates = new WeakMap<Entity, EliteState>()
const marks = new WeakMap<Entity, MarkState>()
const combo: ComboState = {
  tier: 0,
  multiplier: 1,
  lastKillAt: -Infinity,
  killChain: 0,
  peakTier: 0,
  momentum: 0,
}

const telemetry: TelemetryState = {
  hits: 0,
  crits: 0,
  executions: 0,
  reactions: 0,
  perfectDodges: 0,
  eliteKills: 0,
  bossDamage: 0,
  damageDealt: 0,
}

const hazards: HazardState[] = []
const nearbyScratch: Entity[] = []
const nearestScratch: Entity[] = []
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
let running = false
let unsubscribeTick: Stop | undefined
let unsubscribeHit: Stop | undefined
let unsubscribeKill: Stop | undefined
let unsubscribeStatus: Stop | undefined
let unsubscribeDamage: Stop | undefined
let unsubscribeDodge: Stop | undefined
let unsubscribeBiome: Stop | undefined
let lastDifficultyWave = -1
let hazardTimer = 0
let eliteTimer = 5
let reactionTimer = 0
let pulseTimer = 0
let dynamicPressure = 0
let playerDamageCooldown = 0
let currentBiome = 'ashes'

const AFFIX_POOL: readonly AffixKind[] = [
  'berserker', 'vampiric', 'frostbound', 'volatile', 'shielded',
  'phantom', 'venomous', 'juggernaut', 'reckless', 'echo',
]

const HAZARD_POOL: readonly HazardKind[] = [
  'ashfall', 'bloodpool', 'frostline', 'voidrift', 'thunder',
]

const BIOME_HAZARD_WEIGHT: Record<string, readonly HazardKind[]> = {
  ashes: ['ashfall', 'bloodpool'],
  frost: ['frostline', 'thunder'],
  void: ['voidrift', 'thunder'],
  blood: ['bloodpool', 'ashfall'],
  ruins: ['thunder', 'voidrift'],
}

const BIOME_PRESSURE: Record<string, number> = {
  ashes: 1,
  frost: 1.08,
  void: 1.2,
  blood: 1.15,
  ruins: 1.1,
}

function finite(value: number | undefined | null, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isAlive(entity: Entity): boolean {
  return !entity.dead && finite(entity.health, 0) > 0
}

function distanceSquared(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.distanceToSquared(b)
}

function nearby(origin: THREE.Vector3, radius: number, output = nearbyScratch): Entity[] {
  output.length = 0
  const r2 = radius * radius
  for (const entity of enemies.entities) {
    if (!isAlive(entity)) continue
    if (distanceSquared(entity.position, origin) <= r2) output.push(entity)
  }
  return output
}

function closest(origin: THREE.Vector3, radius: number): Entity | undefined {
  nearestScratch.length = 0
  const r2 = radius * radius
  let result: Entity | undefined
  let best = r2
  for (const entity of enemies.entities) {
    if (!isAlive(entity)) continue
    const d2 = distanceSquared(entity.position, origin)
    if (d2 <= best) {
      best = d2
      result = entity
    }
  }
  return result
}

function emitReaction(reaction: ReactionKind, target: Entity, power: number): void {
  telemetry.reactions += 1
  events.emit('combat:reaction', {
    reaction,
    targetId: String(target.enemyKind ?? 0),
    power: clamp(finite(power), 0, 100000),
  })
}

function applyDamage(target: Entity, raw: number, element: DamageElement, source = 'advanced-v3'): number {
  if (!isAlive(target)) return 0
  const resistance = getElementResistance(target, element)
  const mitigation = clamp(finite(target.armor) * 0.02, 0, 0.65)
  const amount = Math.max(1, finite(raw) * (1 - resistance) * (1 - mitigation))
  target.health = finite(target.health, 0) - amount
  target.lastDmg = amount
  target.hitFlash = 1
  telemetry.damageDealt += amount
  events.emit('combat:hit', {
    damage: amount,
    element,
    critical: false,
    targetId: source,
  })
  if (target.health <= 0) {
    const overkill = Math.max(0, -target.health)
    target.dead = true
    events.emit('combat:kill', {
      damage: amount,
      element,
      overkill,
      targetId: source,
      elite: eliteStates.has(target),
      boss: (target.enemyKind ?? 0) >= 3 && (target.scale ?? 1) >= 1.8,
    })
  }
  return amount
}

function getElementResistance(entity: Entity, element: DamageElement): number {
  const kind = entity.enemyKind ?? 0
  let resistance = kind === 2 ? 0.08 : 0
  if (element === 'ice' && currentBiome === 'frost') resistance += 0.32
  if (element === 'fire' && currentBiome === 'ashes') resistance += 0.12
  if (element === 'void' && currentBiome === 'void') resistance -= 0.08
  const state = eliteStates.get(entity)
  if (state?.affixes.includes('frostbound') && element === 'ice') resistance += 0.28
  return clamp(resistance, 0, 0.9)
}

function buildEliteState(entity: Entity): EliteState {
  const level = Math.max(1, gameState.wave)
  const count = gameState.wave >= 14 ? 3 : gameState.wave >= 9 ? 2 : 1
  const affixes: AffixKind[] = []
  const pool = [...AFFIX_POOL]
  while (affixes.length < count && pool.length > 0) {
    const index = randomInt(0, pool.length)
    const [picked] = pool.splice(index, 1)
    affixes.push(picked)
  }
  const shieldMax = affixes.includes('shielded') ? entity.maxHealth * (0.2 + level * 0.008) : 0
  const state: EliteState = {
    affixes,
    shield: shieldMax,
    shieldMax,
    rage: 0,
    lastHitAt: gameState.time,
    contactCooldown: 0,
    phaseSeed: nextRandom(),
    volatileReady: affixes.includes('volatile'),
    echoTimer: 0,
  }
  eliteStates.set(entity, state)
  entity.scale = (entity.scale ?? 1) * (1.08 + affixes.length * 0.035)
  entity.maxHealth *= 1.45 + level * 0.012
  entity.health = entity.maxHealth
  entity.damage = (entity.damage ?? 1) * (1.18 + affixes.length * 0.12)
  entity.speed *= affixes.includes('juggernaut') ? 0.9 : 1.04
  return state
}

function upgradeElite(entity: Entity): void {
  if (!isAlive(entity) || eliteStates.has(entity)) return
  if (gameState.wave < 3) return
  const chance = clamp(0.012 + gameState.wave * 0.0018, 0, 0.16)
  if (nextRandom() > chance) return
  buildEliteState(entity)
  const state = eliteStates.get(entity)
  if (!state) return
  spawnBurst(entity.position, 0xf4b56a, 22 + state.affixes.length * 6, 5.5, 0.9)
  gameState.shake = Math.min(1, gameState.shake + 0.08)
}

function applyAffixes(dt: number): void {
  for (const entity of enemies.entities) {
    const state = eliteStates.get(entity)
    if (!state || !isAlive(entity)) continue
    state.lastHitAt += 0
    state.contactCooldown = Math.max(0, state.contactCooldown - dt)
    state.echoTimer = Math.max(0, state.echoTimer - dt)
    if (state.affixes.includes('berserker')) {
      const ratio = clamp(1 - entity.health / Math.max(1, entity.maxHealth), 0, 1)
      state.rage = clamp(ratio, 0, 1)
      entity.speed = Math.max(0.4, entity.speed * (1 + state.rage * 0.0008))
      entity.damage = Math.max(1, (entity.damage ?? 1) * (1 + state.rage * 0.0006))
    }
    if (state.affixes.includes('vampiric') && state.contactCooldown <= 0) {
      const player = getPlayer()
      if (player && distanceSquared(entity.position, player.position) < 2.2 * 2.2) {
        const stolen = Math.min(4 + gameState.wave * 0.15, entity.maxHealth * 0.004)
        entity.health = Math.min(entity.maxHealth, entity.health + stolen)
        player.damageFlash = 0
        state.contactCooldown = 0.9
        spawnBurst(entity.position, 0xc52b4b, 6, 2.2, 0.24)
      }
    }
    if (state.affixes.includes('venomous') && state.contactCooldown <= 0) {
      const player = getPlayer()
      if (player && distanceSquared(entity.position, player.position) < 2.4 * 2.4) {
        player.velocity.multiplyScalar(0.96)
        gameState.damageFlash = Math.max(gameState.damageFlash, 0.08)
        state.contactCooldown = 1.15
        events.emit('combat:status', { status: 'venom', targetId: 'player', duration: 1.4, stacks: 1 })
      }
    }
    if (state.affixes.includes('echo') && state.echoTimer <= 0 && gameState.time - state.lastHitAt > 3) {
      const target = getPlayer()
      if (target && distanceSquared(entity.position, target.position) < 9 * 9) {
        state.echoTimer = 4.5
        const dir = tmp.copy(target.position).sub(entity.position).normalize()
        entity.velocity.addScaledVector(dir, 2.5)
      }
    }
    if (state.affixes.includes('phantom') && Math.sin(gameState.time * 2 + state.phaseSeed * 5) > 0.92) {
      entity.hitFlash = Math.min(1, entity.hitFlash ?? 0)
      entity.velocity.multiplyScalar(1.01)
    }
  }
}

function handleEliteHit(target: Entity, amount: number, element: DamageElement, critical: boolean): void {
  const state = eliteStates.get(target)
  if (!state || !isAlive(target)) return
  state.lastHitAt = gameState.time
  if (state.shield > 0) {
    const absorbed = Math.min(state.shield, amount)
    state.shield -= absorbed
    target.health = Math.min(target.maxHealth, target.health + absorbed * 0.35)
    spawnBurst(target.position, 0x9ddcff, 4 + Math.floor(absorbed * 0.05), 2.2, 0.3)
    if (state.shield <= 0 && state.shieldMax > 0) {
      emitReaction('shatter', target, state.shieldMax)
      events.emit('combat:reaction', { reaction: 'shatter', targetId: String(target.enemyKind ?? 0), power: state.shieldMax })
      target.stagger = Math.max(target.stagger ?? 0, 0.8)
    }
  }
  if (state.affixes.includes('volatile') && critical && state.volatileReady) {
    state.volatileReady = false
    const radius = 2.8 + synLevel('cataclysm') * 0.2
    for (const other of nearby(target.position, radius)) {
      if (other !== target) applyDamage(other, amount * 0.45, 'fire', 'volatile')
    }
    emitReaction('detonate', target, amount * 0.45)
    spawnBurst(target.position, 0xff7c39, 30, 5.8, 0.6)
  }
  if (state.affixes.includes('reckless')) {
    target.damage = Math.max(1, (target.damage ?? 1) * (1 + Math.min(0.012, amount / Math.max(1, target.maxHealth))))
  }
}

function handleKill(entity: Entity): void {
  const state = eliteStates.get(entity)
  const now = gameState.time
  const chainWindow = Math.max(0.7, 2.4 - gameState.wave * 0.012)
  if (now - combo.lastKillAt <= chainWindow) {
    combo.killChain += 1
  } else {
    combo.killChain = 1
  }
  combo.lastKillAt = now
  combo.momentum = clamp(combo.momentum + 0.08 + (state ? 0.06 : 0), 0, 1)
  combo.tier = Math.min(12, Math.floor(combo.killChain / 4) + Math.floor(combo.momentum * 2))
  combo.multiplier = 1 + combo.tier * 0.025
  combo.peakTier = Math.max(combo.peakTier, combo.tier)
  gameState.combo = Math.min(999, Math.max(gameState.combo, combo.killChain))
  gameState.maxCombo = Math.max(gameState.maxCombo, combo.peakTier)
  if (state) telemetry.eliteKills += 1
  const reward = 1 + combo.tier * 0.05 + (state ? 0.15 : 0)
  gameState.xp += Math.max(0, reward)
  if (combo.killChain % 10 === 0) {
    gameState.announceText = `ZİNCİR ${combo.killChain} — x${combo.multiplier.toFixed(2)}`
    gameState.announceUntil = gameState.time + 1.4
    gameState.shake = Math.min(1, gameState.shake + 0.12)
    spawnBurst(entity.position, 0xffd27c, 18, 5, 0.6)
  }
  if (state?.affixes.includes('volatile')) {
    for (const other of nearby(entity.position, 2.8)) applyDamage(other, 15 + gameState.wave * 1.5, 'fire', 'volatile-death')
  }
}

function decayCombo(dt: number): void {
  if (gameState.phase !== 'playing') return
  if (gameState.time - combo.lastKillAt > 2.8) {
    combo.momentum = Math.max(0, combo.momentum - dt * 0.18)
    combo.killChain = Math.max(0, combo.killChain - dt * 0.7)
    combo.tier = Math.max(0, Math.floor(combo.killChain / 4))
    combo.multiplier = 1 + combo.tier * 0.025
  }
  gameState.comboTimer = Math.max(0, combo.lastKillAt + 2.8 - gameState.time)
}

function applyComboPressure(): void {
  if (gameState.phase !== 'playing') return
  const player = getPlayer()
  if (!player) return
  const bonus = combo.multiplier * (hasSynergy('frenzy') ? 1 + synLevel('frenzy') * 0.02 : 1)
  player.speed = finite(player.speed, 5.4) * (1 + (bonus - 1) * 0.16)
  if (combo.tier >= 4) {
    player.damage = finite(player.damage, 0) + combo.tier * 0.2
  }
}

function createHazard(kind: HazardKind): void {
  if (hazards.length >= 8) return
  const player = getPlayer()
  if (!player) return
  const angle = nextRandom() * Math.PI * 2
  const radius = randomRange(4, 11)
  const position = new THREE.Vector3(
    player.position.x + Math.cos(angle) * radius,
    0,
    player.position.z + Math.sin(angle) * radius,
  )
  const intensity = clamp(0.55 + gameState.wave * 0.015 + dynamicPressure * 0.2, 0.55, 1.6)
  hazards.push({
    kind,
    position,
    radius: randomRange(1.5, 3.1),
    life: randomRange(5, 10),
    tick: 0,
    intensity,
  })
  spawnBurst(position, hazardColor(kind), 14, 3.2, 0.5)
}

function hazardColor(kind: HazardKind): number {
  switch (kind) {
    case 'ashfall': return 0xa68f7a
    case 'bloodpool': return 0xb92848
    case 'frostline': return 0x8edaff
    case 'voidrift': return 0x6f42b8
    case 'thunder': return 0xffe9a7
  }
}

function tickHazards(dt: number): void {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return
  for (let i = hazards.length - 1; i >= 0; i--) {
    const hazard = hazards[i]
    hazard.life -= dt
    hazard.tick -= dt
    if (hazard.life <= 0) {
      hazards.splice(i, 1)
      continue
    }
    const inside = distanceSquared(player.position, hazard.position) <= hazard.radius * hazard.radius
    if (!inside || hazard.tick > 0) continue
    hazard.tick = hazard.kind === 'thunder' ? 1.25 : 0.55
    const intensity = hazard.intensity * (1 + gameState.wave * 0.01)
    switch (hazard.kind) {
      case 'ashfall':
        player.velocity.multiplyScalar(0.92)
        gameState.damageFlash = Math.max(gameState.damageFlash, 0.04)
        break
      case 'bloodpool':
        player.velocity.multiplyScalar(0.88)
        player.health = Math.max(1, player.health - 2.2 * intensity)
        break
      case 'frostline':
        player.velocity.multiplyScalar(0.84)
        events.emit('combat:status', { status: 'frost', targetId: 'player', duration: 0.8, stacks: 1 })
        break
      case 'voidrift':
        player.health = Math.max(1, player.health - 3.6 * intensity)
        player.invuln = Math.max(player.invuln ?? 0, 0)
        break
      case 'thunder':
        gameState.damageFlash = Math.max(gameState.damageFlash, 0.11)
        gameState.shake = Math.min(1, gameState.shake + 0.08)
        player.health = Math.max(1, player.health - 5.5 * intensity)
        spawnBurst(player.position, 0xffefb3, 14, 5, 0.38)
        break
    }
  }
}

function updateDynamicPressure(dt: number): void {
  const player = getPlayer()
  if (!player) return
  const enemyCount = enemies.entities.length
  const healthRatio = clamp(player.health / Math.max(1, player.maxHealth), 0, 1)
  const density = clamp(enemyCount / 180, 0, 2)
  const threat = density * 0.45 + (1 - healthRatio) * 0.4 + Math.min(0.5, gameState.wave * 0.01)
  dynamicPressure += (threat - dynamicPressure) * Math.min(1, dt * 0.8)
  dynamicPressure = clamp(dynamicPressure, 0, 1.8)
  events.emit('performance:pressure', {
    pressure: dynamicPressure,
    fps: 60,
  })
}

function adaptDifficulty(): void {
  if (gameState.wave === lastDifficultyWave) return
  lastDifficultyWave = gameState.wave
  const biomeScale = BIOME_PRESSURE[currentBiome] ?? 1
  const waveScale = 1 + Math.min(0.8, gameState.wave * 0.015)
  const pressure = biomeScale * waveScale * (1 + dynamicPressure * 0.22)
  for (const entity of enemies.entities) {
    if (!isAlive(entity)) continue
    entity.speed = clamp(entity.speed * pressure, 0.35, 11)
    entity.damage = clamp((entity.damage ?? 1) * pressure, 1, 160)
  }
}

function spawnHazardCycle(dt: number): void {
  hazardTimer -= dt
  if (hazardTimer > 0) return
  const base = Math.max(2.2, 6.5 - gameState.wave * 0.035 - dynamicPressure * 1.5)
  hazardTimer = base
  const candidates = BIOME_HAZARD_WEIGHT[currentBiome] ?? HAZARD_POOL
  const kind = candidates[randomInt(0, candidates.length)]
  createHazard(kind)
}

function spawnEliteCycle(dt: number): void {
  eliteTimer -= dt
  if (eliteTimer > 0) return
  eliteTimer = clamp(9.5 - gameState.wave * 0.18 - dynamicPressure * 2.2, 2.8, 9.5)
  if (gameState.wave < 3) return
  let created = 0
  for (const entity of enemies.entities) {
    if (created >= 1) break
    if (!isAlive(entity) || eliteStates.has(entity)) continue
    if (nextRandom() < 0.75) {
      buildEliteState(entity)
      created++
    }
  }
}

function reactionFromStatus(status: string, targetId?: string): void {
  const target = enemies.entities.find((entity) => String(entity.enemyKind ?? 0) === targetId && isAlive(entity))
  if (!target) return
  const state = marks.get(target) ?? { stacks: 0, expiresAt: 0, lastSource: status }
  state.stacks = clamp(state.stacks + 1, 0, 12)
  state.expiresAt = gameState.time + 3
  state.lastSource = status
  marks.set(target, state)
  if (status === 'burn' && state.lastSource === 'ice') {
    emitReaction('shatter', target, 20 + state.stacks * 4)
  }
  if (status === 'shock' && state.stacks >= 3) {
    emitReaction('overload', target, 25 + state.stacks * 7)
    for (const other of nearby(target.position, 2.4)) {
      if (other !== target) applyDamage(other, 12 + state.stacks * 2, 'shock', 'overload')
    }
    state.stacks = 0
  }
  if (status === 'poison' && state.stacks >= 4) {
    emitReaction('rupture', target, 18 + state.stacks * 5)
    applyDamage(target, 18 + state.stacks * 5, 'poison', 'rupture')
    state.stacks = 0
  }
  marks.set(target, state)
}

function expireMarks(): void {
  for (const entity of enemies.entities) {
    const mark = marks.get(entity)
    if (mark && mark.expiresAt <= gameState.time) marks.delete(entity)
  }
}

function tryExecute(entity: Entity, damage: number): void {
  if (!isAlive(entity)) return
  const threshold = 0.1 + abilities.executioner * 0.008 + (hasSynergy('executionmark') ? 0.025 : 0)
  if (entity.health / Math.max(1, entity.maxHealth) > threshold) return
  if ((entity.enemyKind ?? 0) >= 4 && gameState.wave < 10) return
  entity.health = 0
  entity.dead = true
  telemetry.executions += 1
  events.emit('combat:execute', {
    targetId: String(entity.enemyKind ?? 0),
    damage: Math.max(damage, entity.maxHealth * threshold),
  })
  emitReaction('execution', entity, entity.maxHealth * threshold)
  spawnBurst(entity.position, 0xf3e0b0, 24, 6, 0.65)
}

function processMarkedTargets(): void {
  for (const entity of enemies.entities) {
    if (!isAlive(entity)) continue
    const mark = marks.get(entity)
    if (!mark || mark.expiresAt <= gameState.time) continue
    if (abilities.deathsmark > 0) {
      entity.armor = Math.max(0, entity.armor - abilities.deathsmark * 0.04 * mark.stacks)
    }
    if (abilities.executioner > 0 && entity.health / Math.max(1, entity.maxHealth) < 0.14) {
      tryExecute(entity, 4 + abilities.executioner * 2)
    }
  }
}

function tickReactions(dt: number): void {
  reactionTimer -= dt
  if (reactionTimer > 0) return
  reactionTimer = 0.35
  processMarkedTargets()
  if (hasSynergy('bloodfrost')) {
    for (const entity of nearby(getPlayer()?.position ?? tmp.set(0, 0, 0), 4.5)) {
      const mark = marks.get(entity)
      if (mark && mark.lastSource === 'ice' && mark.stacks >= 2) {
        applyDamage(entity, 10 + synLevel('bloodfrost') * 6, 'bleed', 'bloodfrost')
        emitReaction('rupture', entity, 10 + synLevel('bloodfrost') * 6)
      }
    }
  }
}

function tickPulse(dt: number): void {
  pulseTimer -= dt
  if (pulseTimer > 0) return
  pulseTimer = 1
  const player = getPlayer()
  if (!player) return
  const radius = 3.5 + gameState.wave * 0.01
  for (const entity of nearby(player.position, radius)) {
    if (combo.tier >= 3) {
      entity.stagger = Math.max(entity.stagger ?? 0, 0.06 * combo.tier)
    }
    if (hasSynergy('soulconduit') && abilities.soulharvest > 0) {
      events.emit('combat:status', {
        status: 'soul-conduit',
        targetId: String(entity.enemyKind ?? 0),
        duration: 0.7,
        stacks: synLevel('soulconduit'),
      })
    }
  }
}

function handleIncomingPlayerDamage(amount: number): void {
  playerDamageCooldown = 0.25
  combo.momentum = Math.max(0, combo.momentum - 0.22)
  combo.killChain = Math.max(0, combo.killChain - 2)
  gameState.combo = Math.min(gameState.combo, Math.max(0, combo.killChain))
  if (abilities.resilience > 0 && amount > 0) {
    events.emit('combat:status', {
      status: 'resilience',
      targetId: 'player',
      duration: 1,
      stacks: Math.min(10, abilities.resilience),
    })
  }
}

function handlePerfectDodge(perfect: boolean): void {
  if (!perfect) return
  telemetry.perfectDodges += 1
  combo.momentum = clamp(combo.momentum + 0.12, 0, 1)
  gameState.shake = Math.max(0, gameState.shake - 0.05)
  const player = getPlayer()
  if (!player) return
  const target = closest(player.position, 4.6)
  if (target) {
    target.stagger = Math.max(target.stagger ?? 0, 0.45)
    if (abilities.evasion > 0) applyDamage(target, 8 + abilities.evasion * 4, 'void', 'perfect-dodge')
  }
}

function handleCombatHit(payload: { damage: number; element: DamageElement; critical: boolean; targetId?: string }): void {
  telemetry.hits += 1
  if (payload.critical) telemetry.crits += 1
  const target = enemies.entities.find((entity) => String(entity.enemyKind ?? 0) === payload.targetId)
  if (target) {
    if (payload.critical) {
      const state = eliteStates.get(target)
      if (state) handleEliteHit(target, payload.damage, payload.element, true)
    }
    const mark = marks.get(target)
    if (mark && gameState.time < mark.expiresAt) {
      if (payload.element === 'fire' && mark.lastSource === 'ice') emitReaction('ignite', target, payload.damage * 0.45)
      if (payload.element === 'ice' && mark.lastSource === 'fire') emitReaction('shatter', target, payload.damage * 0.55)
      mark.stacks = clamp(mark.stacks + 1, 0, 12)
      mark.lastSource = payload.element
      marks.set(target, mark)
    } else {
      marks.set(target, { stacks: 1, expiresAt: gameState.time + 2.6, lastSource: payload.element })
    }
  }
}

function startListeners(): void {
  unsubscribeHit = events.on('combat:hit', handleCombatHit)
  unsubscribeKill = events.on('combat:kill', (payload) => {
    const target = enemies.entities.find((entity) => String(entity.enemyKind ?? 0) === payload.targetId)
    if (target) handleKill(target)
  })
  unsubscribeStatus = events.on('combat:status', (payload) => reactionFromStatus(payload.status, payload.targetId))
  unsubscribeDamage = events.on('player:damage', (payload) => handleIncomingPlayerDamage(payload.amount))
  unsubscribeDodge = events.on('player:dodge', (payload) => handlePerfectDodge(payload.perfect))
  unsubscribeBiome = events.on('arena:biome', (payload) => {
    currentBiome = payload.biome.toLowerCase()
    hazardTimer = Math.min(hazardTimer, 1.2)
  })
}

function stopListeners(): void {
  unsubscribeHit?.()
  unsubscribeKill?.()
  unsubscribeStatus?.()
  unsubscribeDamage?.()
  unsubscribeDodge?.()
  unsubscribeBiome?.()
  unsubscribeHit = undefined
  unsubscribeKill = undefined
  unsubscribeStatus = undefined
  unsubscribeDamage = undefined
  unsubscribeDodge = undefined
  unsubscribeBiome = undefined
}

function tick(dt: number): void {
  if (gameState.phase !== 'playing') return
  dynamicPressure = finite(dynamicPressure)
  updateDynamicPressure(dt)
  decayCombo(dt)
  applyComboPressure()
  spawnEliteCycle(dt)
  spawnHazardCycle(dt)
  tickHazards(dt)
  tickReactions(dt)
  tickPulse(dt)
  applyAffixes(dt)
  adaptDifficulty()
  expireMarks()
  playerDamageCooldown = Math.max(0, playerDamageCooldown - dt)
  if (telemetry.damageDealt > 1_000_000_000) telemetry.damageDealt = 0
}

export function startAdvancedMechanicsV3(): Stop {
  if (running || typeof window === 'undefined') return stopAdvancedMechanicsV3
  running = true
  dynamicPressure = 0
  hazardTimer = 3
  eliteTimer = 5
  reactionTimer = 0
  pulseTimer = 0
  startListeners()
  unsubscribeTick = onSimulationTick(tick)
  return stopAdvancedMechanicsV3
}

export function stopAdvancedMechanicsV3(): void {
  if (!running) return
  running = false
  unsubscribeTick?.()
  unsubscribeTick = undefined
  stopListeners()
}

export function resetAdvancedMechanicsV3(): void {
  const wasRunning = running
  stopAdvancedMechanicsV3()
  combo.tier = 0
  combo.multiplier = 1
  combo.lastKillAt = -Infinity
  combo.killChain = 0
  combo.peakTier = 0
  combo.momentum = 0
  telemetry.hits = 0
  telemetry.crits = 0
  telemetry.executions = 0
  telemetry.reactions = 0
  telemetry.perfectDodges = 0
  telemetry.eliteKills = 0
  telemetry.bossDamage = 0
  telemetry.damageDealt = 0
  hazards.length = 0
  lastDifficultyWave = -1
  hazardTimer = 3
  eliteTimer = 5
  reactionTimer = 0
  pulseTimer = 0
  dynamicPressure = 0
  playerDamageCooldown = 0
  for (const entity of enemies.entities) {
    eliteStates.delete(entity)
    marks.delete(entity)
  }
  if (wasRunning) startAdvancedMechanicsV3()
}

export function getAdvancedMechanicsV3Snapshot() {
  return {
    comboTier: combo.tier,
    comboMultiplier: combo.multiplier,
    killChain: combo.killChain,
    peakTier: combo.peakTier,
    momentum: combo.momentum,
    dynamicPressure,
    currentBiome,
    hazards: hazards.map((hazard) => ({
      kind: hazard.kind,
      x: hazard.position.x,
      z: hazard.position.z,
      radius: hazard.radius,
      life: hazard.life,
      intensity: hazard.intensity,
    })),
    telemetry: { ...telemetry },
  }
}

export function getEliteAffixes(entity: Entity): readonly AffixKind[] {
  return eliteStates.get(entity)?.affixes ?? []
}

export function getEliteShield(entity: Entity): { current: number; max: number } {
  const state = eliteStates.get(entity)
  return state ? { current: state.shield, max: state.shieldMax } : { current: 0, max: 0 }
}

export function isElite(entity: Entity): boolean {
  return eliteStates.has(entity)
}

export function getComboMultiplier(): number {
  return combo.multiplier
}

export function getDynamicPressure(): number {
  return dynamicPressure
}

export function forceSpawnHazard(kind: HazardKind): void {
  if (HAZARD_POOL.includes(kind)) createHazard(kind)
}

export function forceElite(entity: Entity): void {
  if (!eliteStates.has(entity)) buildEliteState(entity)
}

export function applyReaction(target: Entity, reaction: ReactionKind, power: number): void {
  if (!isAlive(target)) return
  const scaled = Math.max(1, finite(power))
  switch (reaction) {
    case 'ignite': applyDamage(target, scaled, 'fire', 'reaction-ignite'); break
    case 'shatter':
      target.stagger = Math.max(target.stagger ?? 0, 0.5)
      applyDamage(target, scaled, 'ice', 'reaction-shatter')
      break
    case 'overload':
      applyDamage(target, scaled, 'shock', 'reaction-overload')
      target.velocity.multiplyScalar(0.8)
      break
    case 'detonate':
      for (const other of nearby(target.position, 2.5)) applyDamage(other, scaled * 0.5, 'fire', 'reaction-detonate')
      break
    case 'rupture': applyDamage(target, scaled, 'bleed', 'reaction-rupture'); break
    case 'voidburst': applyDamage(target, scaled, 'void', 'reaction-void'); break
    case 'execution': tryExecute(target, scaled); break
  }
}

export function rewardPerfectDefense(): void {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return
  combo.momentum = clamp(combo.momentum + 0.1, 0, 1)
  player.poise = Math.min(player.maxPoise, player.poise + 5)
  player.health = Math.min(player.maxHealth, player.health + 1)
  gameState.xp += 2 + combo.tier * 0.5
  spawnBurst(player.position, 0xa6e7ff, 8, 2.5, 0.25)
}

export function markTarget(target: Entity, stacks = 1, duration = 3, source = 'advanced-v3'): void {
  if (!isAlive(target)) return
  const existing = marks.get(target)
  const next: MarkState = {
    stacks: clamp((existing?.stacks ?? 0) + stacks, 1, 12),
    expiresAt: Math.max(existing?.expiresAt ?? 0, gameState.time + duration),
    lastSource: source,
  }
  marks.set(target, next)
}

export function consumeMark(target: Entity, bonus = 1): number {
  const mark = marks.get(target)
  if (!mark || mark.expiresAt <= gameState.time) return 0
  const power = mark.stacks * bonus
  marks.delete(target)
  return power
}

export function getMarkState(target: Entity): MarkState | null {
  const mark = marks.get(target)
  if (!mark || mark.expiresAt <= gameState.time) return null
  return { ...mark }
}

export function getMechanicsPressureScale(): number {
  return clamp((BIOME_PRESSURE[currentBiome] ?? 1) * (1 + dynamicPressure * 0.25), 0.8, 2.5)
}

export function getHazards(): readonly HazardState[] {
  return hazards
}

export function getMechanicsTelemetry(): Readonly<TelemetryState> {
  return telemetry
}

export function primeBiomeMechanics(biome: string): void {
  currentBiome = biome.toLowerCase()
  hazardTimer = 0.6
}

export function primeWaveMechanics(wave: number): void {
  lastDifficultyWave = Math.max(-1, wave - 1)
  eliteTimer = Math.min(eliteTimer, 2)
}

export function sanitizeMechanicsState(): void {
  combo.tier = clamp(finite(combo.tier), 0, 12)
  combo.multiplier = clamp(finite(combo.multiplier, 1), 1, 3)
  combo.killChain = clamp(finite(combo.killChain), 0, 999)
  combo.peakTier = clamp(finite(combo.peakTier), 0, 12)
  combo.momentum = clamp(finite(combo.momentum), 0, 1)
  dynamicPressure = clamp(finite(dynamicPressure), 0, 1.8)
  for (const hazard of hazards) {
    hazard.life = clamp(finite(hazard.life), 0, 30)
    hazard.tick = clamp(finite(hazard.tick), 0, 5)
    hazard.radius = clamp(finite(hazard.radius, 1), 0.5, 8)
    hazard.intensity = clamp(finite(hazard.intensity, 1), 0.1, 3)
  }
}

export const ADVANCED_MECHANICS_V3_VERSION = 3
