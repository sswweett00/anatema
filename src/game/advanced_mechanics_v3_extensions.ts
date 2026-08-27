import * as THREE from 'three'
import { abilities, applyAbility, hasSynergy, synLevel } from './abilities'
import { events } from './events'
import { nextRandom, randomInt, randomRange } from './rng'
import { onSimulationTick } from './simulation_clock'
import {
  announce,
  enemies,
  gameState,
  getPlayer,
  particles,
  spawnBurst,
  spawnEnemy,
  type Entity,
} from '../ecs/world'

/**
 * ANATEMA — V3 RUN MECHANICS EXTENSIONS
 *
 * Canonical home for mechanics previously living in mega_systems_v2.ts.
 * This module deliberately contains only the V2 mechanics which were not
 * already owned by advanced_mechanics_v3.ts: Shrine Gambit, Relic Resonance,
 * Momentum Banking, Magnet Surge, Arena Pulse, Ascension and Elemental
 * Overdrive. It uses the shared simulation clock and seeded RNG.
 */

type Stop = () => void
type Element = 'pyro' | 'cryo' | 'storm' | 'venom' | 'void' | 'iron' | 'blood'
type MarkerKind = 'shrine' | 'relic'

interface Marker {
  position: THREE.Vector3
  kind: MarkerKind
  life: number
  claimed: boolean
}

interface ExtensionState {
  running: boolean
  unsubscribe?: Stop
  elapsedSinceHit: number
  adaptive: number
  lastWave: number
  streakTier: number
  relicTimer: number
  shrineTimer: number
  relicTier: number
  arenaPulseTimer: number
  magnetCooldown: number
  momentumBank: number
  momentumCooldown: number
  ascension: number
  ascensionPulse: number
  elementCooldown: number
  lastHitHp: number
  mutatorLevel: number
  lastLevel: number
  riskHeat: number
}

const markers: Marker[] = []
const state: ExtensionState = {
  running: false,
  elapsedSinceHit: 0,
  adaptive: 1,
  lastWave: 0,
  streakTier: 0,
  relicTimer: 0,
  shrineTimer: 35,
  relicTier: 0,
  arenaPulseTimer: 36,
  magnetCooldown: 0,
  momentumBank: 0,
  momentumCooldown: 0,
  ascension: 0,
  ascensionPulse: 0,
  elementCooldown: 0,
  lastHitHp: 100,
  mutatorLevel: 0,
  lastLevel: 1,
  riskHeat: 0,
}

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

function finite(value: number | undefined | null, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function alive(entity: Entity): boolean {
  return Boolean(entity.isEnemy && !entity.dead && finite(entity.health, 0) > 0)
}

function livingNear(center: THREE.Vector3, radius: number, limit = Infinity): Entity[] {
  const result: Entity[] = []
  const radius2 = radius * radius
  for (const entity of enemies.entities) {
    if (!alive(entity)) continue
    if (entity.position.distanceToSquared(center) <= radius2) {
      result.push(entity)
      if (result.length >= limit) break
    }
  }
  return result
}

function dominantElement(): Element | null {
  const values: Array<[Element, number]> = [
    ['pyro', abilities.pyre + abilities.nova * 0.8],
    ['cryo', abilities.frost + abilities.orbit * 0.6],
    ['storm', abilities.storm + abilities.chain * 0.6],
    ['venom', abilities.venom + abilities.harvest * 0.35],
    ['void', abilities.vortex + abilities.phantom * 0.6 + abilities.ghoststep * 0.25],
    ['iron', abilities.armor + abilities.stone * 0.8 + abilities.bulwark * 0.5],
    ['blood', abilities.rage + abilities.vamp * 0.8 + abilities.ferocity * 0.5],
  ]
  let best: Element | null = null
  let score = 0
  for (const [element, value] of values) {
    if (value > score) {
      score = value
      best = element
    }
  }
  return best
}

function riskHeat(player: Entity): number {
  const hpRisk = 1 - clamp(player.health / Math.max(1, player.maxHealth), 0, 1)
  const comboRisk = clamp(gameState.combo / 120, 0, 1)
  return clamp(hpRisk * 0.7 + comboRisk * 0.3, 0, 1)
}

function spawnMarker(kind: MarkerKind, player: Entity): void {
  if (markers.filter((marker) => !marker.claimed && marker.kind === kind).length >= 2) return
  const angle = nextRandom() * Math.PI * 2
  const distance = randomRange(5, 11)
  markers.push({
    position: new THREE.Vector3(
      player.position.x + Math.cos(angle) * distance,
      0.05,
      player.position.z + Math.sin(angle) * distance,
    ),
    kind,
    life: 30,
    claimed: false,
  })
  const color = kind === 'shrine' ? 0xe4c97d : 0xffc36a
  spawnBurst(markers[markers.length - 1].position, color, 16, 3.2, 0.55)
  events.emit('loot:drop', {
    kind,
    rarity: kind === 'shrine' ? 'ritual' : 'relic',
    x: markers[markers.length - 1].position.x,
    z: markers[markers.length - 1].position.z,
  })
}

function shrineGambit(player: Entity): void {
  const heat = state.riskHeat
  if (heat >= 0.65) {
    player.health = Math.min(player.maxHealth, player.health + player.maxHealth * 0.35)
    player.poise = player.maxPoise
    abilities.ferocity += 2
    player.invuln = Math.max(player.invuln ?? 0, 2)
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 1)
    gameState.xp += 5 + gameState.wave
    announce('SHRINE GAMBIT — RİSK ÖDÜLE DÖNÜŞTÜ', 2.1)
    events.emit('shrine:activate', { shrineId: 'gambit', reward: 'risk-burst' })
  } else {
    player.health = Math.min(player.maxHealth, player.health + 18)
    player.poise = player.maxPoise
    abilities.swift += 1
    gameState.xp += 2 + Math.floor(gameState.wave * 0.25)
    announce('SHRINE — KORUNMA LÜTFU', 1.6)
    events.emit('shrine:activate', { shrineId: 'sanctuary', reward: 'guard' })
  }
  spawnBurst(player.position, 0xe4c97d, 24, 5.5, 0.7)
}

function relicResonance(player: Entity): void {
  state.relicTier += 1
  const tier = state.relicTier
  player.maxHealth = finite(player.maxHealth, 100) + 8 + tier * 2
  player.health = Math.min(player.maxHealth, player.health + 10 + tier * 2)
  if (tier % 3 === 0) player.armor = finite(player.armor) + 1
  if (tier % 2 === 0) abilities.crit += 1
  if (tier >= 5) abilities.magnet += 1
  gameState.xp += 4 + tier
  announce(`RELIC REZONANSI ${tier}`, 1.7)
  events.emit('relic:acquire', { relicId: `resonance-${tier}` })
  spawnBurst(player.position, 0xffc36a, 22, 4.5, 0.65)
}

function processMarkers(player: Entity, dt: number): void {
  for (const marker of markers) {
    if (marker.claimed) continue
    marker.life -= dt
    if (marker.position.distanceToSquared(player.position) > 1.75 * 1.75) continue
    marker.claimed = true
    if (marker.kind === 'shrine') shrineGambit(player)
    else relicResonance(player)
    const x = marker.position.x
    const z = marker.position.z
    events.emit('loot:pickup', { kind: marker.kind, rarity: marker.kind === 'shrine' ? 'ritual' : 'relic' })
    events.emit('loot:drop', { kind: 'consumed-marker', rarity: marker.kind, x, z })
  }
  for (let i = markers.length - 1; i >= 0; i--) {
    if (markers[i].life <= 0 || markers[i].claimed) markers.splice(i, 1)
  }
}

function updateDynamicDifficulty(player: Entity, dt: number): void {
  const target = 1 + Math.min(0.7, gameState.combo * 0.0035) + Math.min(0.4, gameState.time / 700)
  state.adaptive += (target - state.adaptive) * Math.min(1, dt * 0.5)
  state.adaptive = clamp(state.adaptive, 0.8, 2.1)
  if (state.adaptive <= 1.12 || gameState.time <= 30 || gameState.wave < 2) return
  const chance = dt * (0.08 + (state.adaptive - 1.12) * 0.12)
  if (nextRandom() >= chance) return
  if (enemies.entities.length < 1400) spawnEnemy(player.position)
  if (state.adaptive > 1.35 && nextRandom() < 0.3 && enemies.entities.length < 1399) spawnEnemy(player.position)
}

function swarmFormation(player: Entity): void {
  if (gameState.wave <= state.lastWave) return
  state.lastWave = gameState.wave
  const flankCount = gameState.wave % 4 === 0 ? 8 : 4
  const selected = livingNear(player.position, 30, flankCount)
  for (const entity of selected) {
    tmp.subVectors(entity.position, player.position).setY(0)
    if (tmp.lengthSq() <= 0.01) continue
    tmp.normalize()
    tmp2.set(-tmp.z, 0, tmp.x)
    entity.velocity.addScaledVector(tmp2, gameState.wave % 4 === 0 ? 2.5 : 1.5)
  }
  if (gameState.wave % 4 === 0) {
    announce('SÜRÜ FORMASYONU — FLANK', 1.5)
    spawnBurst(player.position, 0xffb15c, 14, 4.5, 0.42)
  }
}

function applyMutatorEscalation(): void {
  const level = Math.floor(gameState.wave / 3)
  if (level === state.mutatorLevel) return
  state.mutatorLevel = level
  const speedBonus = Math.min(0.6, level * 0.025)
  for (const entity of enemies.entities) {
    if (!alive(entity)) continue
    entity.speed = clamp(entity.speed * (1 + speedBonus), 0.35, 11)
    entity.damage = clamp((entity.damage ?? 1) * (1 + level * 0.07), 1, 160)
    entity.armor = clamp(entity.armor + level * 0.65, 0, 80)
  }
  if (level > 0) {
    events.emit('run:mutator', { mutator: 'v3-escalation', level, active: true })
    announce(`MUTATOR KADEMESİ ${level}`, 1.1)
  }
}

function momentum(player: Entity, dt: number): void {
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  if (speed > 4) {
    state.momentumBank = Math.min(100, state.momentumBank + dt * (speed - 3) * (1 + abilities.momentum * 0.12))
  } else {
    state.momentumBank = Math.max(0, state.momentumBank - dt * 0.8)
  }
  state.momentumCooldown -= dt
  if (state.momentumBank < 35 || state.momentumCooldown > 0) return
  state.momentumCooldown = 2.2
  const power = Math.max(4, state.momentumBank * 0.15)
  state.momentumBank *= 0.4
  for (const entity of livingNear(player.position, 4.8, 20)) {
    entity.health = finite(entity.health) - power
    tmp.subVectors(entity.position, player.position).setY(0)
    if (tmp.lengthSq() > 0.01) entity.velocity.addScaledVector(tmp.normalize(), 4 + power * 0.15)
    entity.hitFlash = 1
    if (entity.health <= 0) entity.dead = true
  }
  gameState.shake = Math.min(1, gameState.shake + 0.18)
  gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.18)
  gameState.xp += 1
  spawnBurst(player.position, 0xf2b871, 12, 5, 0.4)
}

function magnetSurge(player: Entity, dt: number): void {
  if (abilities.magnet <= 0 || gameState.combo < 10) return
  state.magnetCooldown -= dt
  const pull = 2 + Math.min(6, gameState.combo * 0.08) + abilities.magnet * 0.2
  for (const particle of particles.entities) {
    if (!particle.wisp || finite(particle.life) <= 0) continue
    const distance2 = particle.position.distanceToSquared(player.position)
    if (distance2 > 16 * 16) continue
    tmp.subVectors(player.position, particle.position)
    const distance = Math.sqrt(distance2) || 1
    particle.velocity.lerp(tmp.divideScalar(distance).multiplyScalar(pull), 0.5)
    if (distance < 0.6) {
      particle.life = 0
      if (state.magnetCooldown <= 0) {
        state.magnetCooldown = 0.15
        gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.1)
        gameState.xp += 0.25 + abilities.magnet * 0.15
      }
    }
  }
}

function arenaPulse(player: Entity, dt: number): void {
  state.arenaPulseTimer -= dt
  if (state.arenaPulseTimer > 0) return
  state.arenaPulseTimer = Math.max(22, 36 - gameState.wave * 0.3)
  const radius = 8 + Math.min(5, gameState.wave * 0.04)
  for (const entity of livingNear(player.position, radius, 80)) {
    entity.health = finite(entity.health) - 2 - gameState.wave * 0.25
    tmp.subVectors(entity.position, player.position).setY(0)
    if (tmp.lengthSq() > 0.01) entity.velocity.addScaledVector(tmp.normalize(), 1.8)
    entity.stagger = Math.max(entity.stagger ?? 0, 0.15)
    if (entity.health <= 0) entity.dead = true
  }
  player.poise = player.maxPoise
  player.invuln = Math.max(player.invuln ?? 0, 0.35)
  gameState.shake = Math.min(1, gameState.shake + 0.35)
  gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.45)
  events.emit('combat:reaction', { reaction: 'arena-pulse', targetId: 'arena', power: radius })
  spawnBurst(player.position, 0xffb15c, 28, 6, 0.6)
  announce('ARENA PULSE — ALAN YENİLENDİ', 1.5)
}

function ascension(player: Entity, dt: number): void {
  if (state.ascension <= 0 && gameState.time >= 420) {
    state.ascension = 20
    state.ascensionPulse = 0
    announce('ASCENSION — TÜM SİSTEMLER GÜÇLENDİ', 2.8)
    events.emit('run:ascend', { tier: 1 })
    spawnBurst(player.position, 0xffe2a2, 48, 9, 1)
  }
  if (state.ascension <= 0) return
  state.ascension -= dt
  state.ascensionPulse -= dt
  if (state.ascensionPulse > 0) return
  state.ascensionPulse = 1.4
  for (const entity of livingNear(player.position, 8, 24)) {
    entity.health = finite(entity.health) - 4 - abilities.ferocity
    entity.velocity.multiplyScalar(1.12)
    if (entity.health <= 0) entity.dead = true
  }
  player.poise = player.maxPoise
  player.invuln = Math.max(player.invuln ?? 0, 0.12)
  gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.3)
  spawnBurst(player.position, 0xffe2a2, 12, 4, 0.35)
}

function elementOverdrive(player: Entity, dt: number): void {
  state.elementCooldown -= dt
  if (state.elementCooldown > 0) return
  const element = dominantElement()
  if (!element) return
  const level = Math.max(1, Math.floor({
    pyro: abilities.pyre,
    cryo: abilities.frost,
    storm: abilities.storm,
    venom: abilities.venom,
    void: abilities.vortex,
    iron: abilities.armor,
    blood: abilities.rage,
  }[element]))
  if (level < 4) return
  state.elementCooldown = Math.max(0.8, 2.8 - level * 0.08)
  const radius = 4.5 + Math.min(5, level * 0.25)
  const power = 2 + level * 0.45 + (state.ascension > 0 ? 4 : 0)
  for (const entity of livingNear(player.position, radius, 40)) {
    switch (element) {
      case 'pyro': entity.health -= power; break
      case 'cryo': entity.health -= power * 0.75; entity.slow = Math.max(entity.slow ?? 0, 1.2); break
      case 'storm': entity.health -= power * 0.8; entity.stagger = Math.max(entity.stagger ?? 0, 0.18); break
      case 'venom': entity.health -= power * 1.15; break
      case 'void':
        entity.health -= power * 0.9
        tmp.subVectors(player.position, entity.position).setY(0)
        if (tmp.lengthSq() > 0.01) entity.velocity.addScaledVector(tmp.normalize(), 2.2 + level * 0.1)
        break
      case 'iron': entity.armor = Math.max(0, entity.armor - 1); break
      case 'blood': entity.health -= power * 0.9; player.health = Math.min(player.maxHealth, player.health + power * 0.08); break
    }
    if (entity.health <= 0) entity.dead = true
  }
  events.emit('combat:reaction', { reaction: `overdrive:${element}`, targetId: 'arena', power })
  const color = element === 'pyro' ? 0xff632f : element === 'cryo' ? 0x8fd8ff : element === 'storm' ? 0xcfeeff : element === 'venom' ? 0x6fd889 : element === 'void' ? 0xa995ff : element === 'iron' ? 0xd0b991 : 0xd52e38
  spawnBurst(player.position, color, 6 + Math.min(10, level), 3.5, 0.32)
}

function streakRewards(player: Entity): void {
  const streak = Math.floor(gameState.kills / 25)
  if (streak <= state.streakTier) return
  state.streakTier = streak
  player.health = Math.min(player.maxHealth, player.health + 5 + streak * 2)
  player.poise = Math.min(player.maxPoise, player.poise + 8 + streak)
  gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.45)
  gameState.xp += 5 + streak * 2
  if (streak % 2 === 0) abilities.ferocity += 1
  announce(`${streak * 25} KESİM — SAVAŞ ÖDÜLÜ`, 1.2)
  spawnBurst(player.position, 0xffd15e, 8 + Math.min(18, streak * 2), 3.2, 0.32)
}

function levelResonance(player: Entity): void {
  if (gameState.level <= state.lastLevel) return
  const gained = gameState.level - state.lastLevel
  state.lastLevel = gameState.level
  if (gained <= 0) return
  player.maxHealth += gained * 2
  player.health = Math.min(player.maxHealth, player.health + gained * 2)
  if (gameState.level % 5 === 0) {
    abilities.crit += 1
    announce('LEVEL REZONANSI — YENİ GÜÇ', 1.2)
    spawnBurst(player.position, 0xffe2a2, 14, 3.8, 0.4)
  }
}

function tick(dt: number): void {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return
  state.riskHeat = riskHeat(player)
  state.elapsedSinceHit += dt
  if (player.health < state.lastHitHp - 0.1) {
    state.elapsedSinceHit = 0
  }
  state.lastHitHp = player.health

  updateDynamicDifficulty(player, dt)
  swarmFormation(player)
  applyMutatorEscalation()
  momentum(player, dt)
  magnetSurge(player, dt)
  arenaPulse(player, dt)
  ascension(player, dt)
  elementOverdrive(player, dt)
  streakRewards(player)
  levelResonance(player)

  state.shrineTimer -= dt
  state.relicTimer -= dt
  if (state.shrineTimer <= 0) {
    state.shrineTimer = Math.max(32, 55 - gameState.wave * 0.2)
    spawnMarker('shrine', player)
    announce('UZAKTA BİR SHRINE ORTAYA ÇIKTI', 1.5)
  }
  if (state.relicTimer <= 0 && gameState.level >= 5) {
    state.relicTimer = Math.max(28, 42 - gameState.wave * 0.15)
    spawnMarker('relic', player)
  }
  processMarkers(player, dt)

  if (state.elapsedSinceHit >= 26 && player.lastStandUsed) {
    player.lastStandUsed = false
    announce('SON DİRENİŞ YENİDEN HAZIR', 1.5)
  }

  if (state.ascension > 0) {
    const hp = player.health / Math.max(1, player.maxHealth)
    const haste = clamp(1 + (0.28 - hp) * 0.8 + gameState.combo * 0.002, 1, 1.5)
    player.velocity.multiplyScalar(Math.min(1.15, 1 + (haste - 1) * dt * 4))
  }
}

export function startAdvancedMechanicsV3Extensions(): Stop {
  if (state.running || typeof window === 'undefined') return stopAdvancedMechanicsV3Extensions
  state.running = true
  state.elapsedSinceHit = 0
  state.adaptive = 1
  state.lastWave = gameState.wave
  state.streakTier = Math.floor(gameState.kills / 25)
  state.relicTimer = 0
  state.shrineTimer = 35
  state.relicTier = 0
  state.arenaPulseTimer = 36
  state.magnetCooldown = 0
  state.momentumBank = 0
  state.momentumCooldown = 0
  state.ascension = 0
  state.ascensionPulse = 0
  state.elementCooldown = 0
  state.lastHitHp = finite(getPlayer()?.health, 100)
  state.mutatorLevel = Math.floor(gameState.wave / 3)
  state.lastLevel = gameState.level
  state.riskHeat = 0
  state.unsubscribe = onSimulationTick((step) => {
    try {
      tick(step)
    } catch (error) {
      events.emit('runtime:error', { system: 'advanced-mechanics-v3-extensions', message: String(error) })
    }
  })
  return stopAdvancedMechanicsV3Extensions
}

export function stopAdvancedMechanicsV3Extensions(): void {
  if (!state.running) return
  state.running = false
  state.unsubscribe?.()
  state.unsubscribe = undefined
}

export function resetAdvancedMechanicsV3Extensions(): void {
  const wasRunning = state.running
  stopAdvancedMechanicsV3Extensions()
  markers.length = 0
  state.elapsedSinceHit = 0
  state.adaptive = 1
  state.lastWave = 0
  state.streakTier = 0
  state.relicTimer = 0
  state.shrineTimer = 35
  state.relicTier = 0
  state.arenaPulseTimer = 36
  state.magnetCooldown = 0
  state.momentumBank = 0
  state.momentumCooldown = 0
  state.ascension = 0
  state.ascensionPulse = 0
  state.elementCooldown = 0
  state.lastHitHp = 100
  state.mutatorLevel = 0
  state.lastLevel = 1
  state.riskHeat = 0
  if (wasRunning) startAdvancedMechanicsV3Extensions()
}

export function getAdvancedMechanicsV3ExtensionSnapshot() {
  return {
    riskHeat: state.riskHeat,
    adaptive: state.adaptive,
    momentumBank: state.momentumBank,
    relicTier: state.relicTier,
    ascension: state.ascension,
    markers: markers.map((marker) => ({ kind: marker.kind, x: marker.position.x, z: marker.position.z, life: marker.life })),
    mutatorLevel: state.mutatorLevel,
  }
}
