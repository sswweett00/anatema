import { enemies, gameState, getPlayer, spawnBurst, type Entity } from '../ecs/world'
import { abilities, hasSynergy, synLevel } from './abilities'
import { events } from './events'
import { nextRandom, randomInt, randomRange } from './rng'
import { onSimulationTick } from './simulation_clock'

/**
 * ANATEMA RUN EVENT DIRECTOR V3
 * Dynamic encounters that make a run react to player performance without
 * replacing the wave director. Every event is deterministic for a seed.
 */

type Stop = () => void
type RunEventKind = 'blood-moon' | 'elite-hunt' | 'soul-storm' | 'treasure-surge' | 'frozen-hour' | 'void-collapse' | 'last-stand'
type EventPhase = 'idle' | 'telegraph' | 'active' | 'cooldown'

interface RunEvent {
  kind: RunEventKind
  phase: EventPhase
  remaining: number
  duration: number
  intensity: number
  reward: number
  killsAtStart: number
  startedAt: number
  completed: boolean
}

interface EventStats {
  started: number
  completed: number
  failed: number
  totalReward: number
  eliteSpawned: number
  hazardsTriggered: number
}

const EVENT_POOL: readonly RunEventKind[] = [
  'blood-moon',
  'elite-hunt',
  'soul-storm',
  'treasure-surge',
  'frozen-hour',
  'void-collapse',
  'last-stand',
]

const event: RunEvent = {
  kind: 'blood-moon',
  phase: 'idle',
  remaining: 0,
  duration: 0,
  intensity: 0,
  reward: 0,
  killsAtStart: 0,
  startedAt: 0,
  completed: false,
}

const stats: EventStats = {
  started: 0,
  completed: 0,
  failed: 0,
  totalReward: 0,
  eliteSpawned: 0,
  hazardsTriggered: 0,
}

let running = false
let unsubscribeTick: Stop | undefined
let nextEventAt = 18
let telegraphRemaining = 0
let completionGrace = 0
let noHitTime = 0
let waveSerial = 0
let deterministicCursor = 0

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function currentPlayer(): Entity | undefined {
  return getPlayer()
}

function eventName(kind: RunEventKind): string {
  switch (kind) {
    case 'blood-moon': return 'KANLI AY'
    case 'elite-hunt': return 'ELİT AVCI'
    case 'soul-storm': return 'RUH FIRTINASI'
    case 'treasure-surge': return 'HAZİNE AKINI'
    case 'frozen-hour': return 'DON SAATİ'
    case 'void-collapse': return 'HİÇLİK ÇÖKÜŞÜ'
    case 'last-stand': return 'SON DİRENİŞ'
  }
}

function eventDuration(kind: RunEventKind, intensity: number): number {
  const base = {
    'blood-moon': 15,
    'elite-hunt': 12,
    'soul-storm': 14,
    'treasure-surge': 11,
    'frozen-hour': 10,
    'void-collapse': 13,
    'last-stand': 9,
  }[kind]
  return base + intensity * 1.8
}

function eventIntensity(kind: RunEventKind): number {
  const pressure = clamp(gameState.wave * 0.025 + gameState.kills * 0.0006, 0, 1.4)
  const biome = kind === 'void-collapse' || kind === 'soul-storm' ? 0.2 : 0
  return clamp(0.55 + pressure + biome + nextRandom() * 0.35, 0.55, 2.2)
}

function chooseNextEvent(): RunEventKind {
  const pool = [...EVENT_POOL]
  const player = currentPlayer()
  if (player && player.health / Math.max(1, player.maxHealth) < 0.28) {
    return 'last-stand'
  }
  if (hasSynergy('bloodlord') && abilities.vamp > 0 && nextRandom() < 0.3) return 'blood-moon'
  if (hasSynergy('voidgravity') && abilities.voidrift > 0 && nextRandom() < 0.4) return 'void-collapse'
  const index = (randomInt(0, pool.length) + deterministicCursor++) % pool.length
  return pool[index]
}

function startTelegraph(kind: RunEventKind): void {
  const intensity = eventIntensity(kind)
  event.kind = kind
  event.phase = 'telegraph'
  event.intensity = intensity
  event.duration = eventDuration(kind, intensity)
  event.remaining = event.duration
  event.reward = Math.floor(4 + gameState.wave * 0.75 + intensity * 6)
  event.killsAtStart = gameState.kills
  event.startedAt = gameState.time
  event.completed = false
  telegraphRemaining = 2.2
  completionGrace = 0
  stats.started += 1
  gameState.announceText = `${eventName(kind)} — HAZIRLAN`
  gameState.announceUntil = gameState.time + 2.1
  const p = currentPlayer()
  if (p) spawnBurst(p.position, eventColor(kind), 20, 4.5, 0.8)
}

function eventColor(kind: RunEventKind): number {
  switch (kind) {
    case 'blood-moon': return 0xb52d45
    case 'elite-hunt': return 0xffc05a
    case 'soul-storm': return 0x95a8ff
    case 'treasure-surge': return 0xffd98a
    case 'frozen-hour': return 0x8cdfff
    case 'void-collapse': return 0x8459d6
    case 'last-stand': return 0xff756e
  }
}

function activateEvent(): void {
  event.phase = 'active'
  event.remaining = event.duration
  gameState.announceText = `${eventName(event.kind)} — BAŞLADI`
  gameState.announceUntil = gameState.time + 1.5
  events.emit('run:mutator', { mutator: event.kind, level: Math.ceil(event.intensity), active: true })
  spawnEventEntities()
}

function spawnEventEntities(): void {
  const player = currentPlayer()
  if (!player) return
  const intensity = event.intensity
  if (event.kind === 'elite-hunt' || event.kind === 'blood-moon') {
    const count = Math.min(4, 1 + Math.floor(intensity + gameState.wave / 15))
    for (let i = 0; i < count; i++) {
      const target = nearestSpawnCandidate()
      if (!target) break
      forceElite(target)
      stats.eliteSpawned += 1
    }
  }
  if (event.kind === 'soul-storm' || event.kind === 'void-collapse') {
    for (let i = 0; i < 3; i++) {
      const x = player.position.x + randomRange(-8, 8)
      const z = player.position.z + randomRange(-8, 8)
      spawnBurst(new THREE.Vector3(x, 0, z), eventColor(event.kind), 18, 5, 0.7)
      stats.hazardsTriggered += 1
    }
  }
}

function nearestSpawnCandidate(): Entity | undefined {
  let best: Entity | undefined
  let bestScore = -Infinity
  for (const entity of enemies.entities) {
    if (!isAlive(entity)) continue
    const healthRatio = entity.health / Math.max(1, entity.maxHealth)
    const score = (1 - healthRatio) + ((entity.scale ?? 1) - 1) * 0.25
    if (score > bestScore) {
      bestScore = score
      best = entity
    }
  }
  return best
}

function isAlive(entity: Entity): boolean {
  return !entity.dead && finite(entity.health) > 0
}

function forceElite(entity: Entity): void {
  entity.maxHealth *= 1.65 + event.intensity * 0.2
  entity.health = entity.maxHealth
  entity.damage = finite(entity.damage, 1) * (1.25 + event.intensity * 0.1)
  entity.speed = clamp(finite(entity.speed, 1) * 1.06, 0.35, 12)
  entity.scale = finite(entity.scale, 1) * (1.08 + event.intensity * 0.03)
  entity.hitFlash = 1
}

function applyEventTick(dt: number): void {
  const p = currentPlayer()
  if (!p) return
  const intensity = event.intensity
  switch (event.kind) {
    case 'blood-moon':
      for (const entity of enemies.entities) {
        if (!isAlive(entity)) continue
        entity.damage = Math.max(1, finite(entity.damage, 1) * (1 + dt * 0.006 * intensity))
        if (distanceSquared(entity.position, p.position) < 4.2 * 4.2) {
          p.health = Math.max(1, p.health - dt * (0.7 + intensity * 0.25))
        }
      }
      break
    case 'elite-hunt':
      if (gameState.kills - event.killsAtStart > 0) {
        event.reward += 0.15
      }
      for (const entity of enemies.entities) {
        if (!isAlive(entity)) continue
        entity.speed = clamp(finite(entity.speed, 1) * (1 + dt * 0.008), 0.35, 12)
      }
      break
    case 'soul-storm':
      p.velocity.multiplyScalar(Math.max(0.82, 1 - dt * 0.18 * intensity))
      gameState.damageFlash = Math.max(gameState.damageFlash, 0.025)
      if (Math.sin(gameState.time * 4.5) > 0.985) {
        p.health = Math.max(1, p.health - 2.5 * intensity)
        p.shake = undefined
        stats.hazardsTriggered += 1
      }
      break
    case 'treasure-surge':
      p.velocity.multiplyScalar(1 + dt * 0.03)
      if (gameState.kills > event.killsAtStart && (gameState.kills - event.killsAtStart) % 8 === 0) {
        gameState.xp += 1 + abilities.greed * 0.2
      }
      break
    case 'frozen-hour':
      for (const entity of enemies.entities) {
        if (!isAlive(entity)) continue
        entity.speed = Math.max(0.35, finite(entity.speed, 1) * Math.max(0.82, 1 - dt * 0.11 * intensity))
        entity.slow = Math.max(finite(entity.slow), 0.2 + intensity * 0.08)
      }
      break
    case 'void-collapse':
      if (distanceSquared(p.position, nearestEnemyPoint()) < 9) {
        p.health = Math.max(1, p.health - dt * (1 + intensity * 0.6))
      }
      break
    case 'last-stand':
      const healthRatio = p.health / Math.max(1, p.maxHealth)
      if (healthRatio < 0.35) {
        p.invuln = Math.max(p.invuln ?? 0, 0.04)
        p.speed = Math.max(p.speed, 6 + abilities.adrenaline * 0.35)
        gameState.xp += dt * (2 + synLevel('phoenix'))
      }
      break
  }
}

function nearestEnemyPoint(): THREE.Vector3 {
  const p = currentPlayer()
  if (!p) return tmp
  const enemy = enemies.entities[0]
  if (enemy) return enemy.position
  return p.position
}

const tmp = new THREE.Vector3()

function handleEventSuccess(): void {
  if (event.completed) return
  event.completed = true
  stats.completed += 1
  const bonus = 1 + (gameState.kills - event.killsAtStart) * 0.015 + tempoBonus()
  const reward = Math.max(1, Math.floor(event.reward * bonus))
  stats.totalReward += reward
  gameState.xp += reward
  gameState.announceText = `${eventName(event.kind)} — TAMAMLANDI +${reward} XP`
  gameState.announceUntil = gameState.time + 2.2
  gameState.shake = Math.min(1, gameState.shake + 0.15)
  spawnBurst(currentPlayer()?.position ?? tmp, eventColor(event.kind), 36, 6, 0.9)
  events.emit('run:mutator', { mutator: event.kind, level: Math.ceil(event.intensity), active: false })
}

function tempoBonus(): number {
  return clamp((gameState.combo / 100) + (abilities.celerity * 0.003), 0, 0.35)
}

function failEvent(): void {
  if (event.completed) return
  stats.failed += 1
  event.completed = true
  gameState.announceText = `${eventName(event.kind)} — BAŞARISIZ`
  gameState.announceUntil = gameState.time + 1.5
  events.emit('run:mutator', { mutator: event.kind, level: Math.ceil(event.intensity), active: false })
}

function tick(dt: number): void {
  if (gameState.phase !== 'playing') return
  if (gameState.wave !== waveSerial) {
    waveSerial = gameState.wave
    nextEventAt = Math.max(nextEventAt, gameState.time + 8)
  }
  const p = currentPlayer()
  if (!p) return

  if (p.health >= p.maxHealth * 0.98) noHitTime += dt
  else noHitTime = 0
  noHitTime = clamp(noHitTime, 0, 60)

  if (event.phase === 'idle') {
    if (gameState.time >= nextEventAt && gameState.wave >= 2) {
      startTelegraph(chooseNextEvent())
    }
    return
  }

  if (event.phase === 'telegraph') {
    telegraphRemaining -= dt
    if (telegraphRemaining <= 0) activateEvent()
    return
  }

  if (event.phase === 'active') {
    event.remaining -= dt
    applyEventTick(dt)
    completionGrace += dt
    const requiredKills = event.kind === 'elite-hunt' ? 3 + Math.floor(event.intensity) : 0
    const gained = gameState.kills - event.killsAtStart
    const minimumTime = event.duration * 0.35
    if (event.kind === 'elite-hunt' && gained >= requiredKills && completionGrace > minimumTime) {
      handleEventSuccess()
      event.phase = 'cooldown'
      event.remaining = 3
    } else if (event.kind === 'last-stand' && p.health > p.maxHealth * 0.45 && completionGrace > minimumTime) {
      handleEventSuccess()
      event.phase = 'cooldown'
      event.remaining = 3
    } else if (event.remaining <= 0) {
      const bonusCondition = event.kind === 'treasure-surge'
        ? gained >= 2
        : event.kind === 'blood-moon'
          ? gained >= 4
          : event.kind === 'soul-storm'
            ? noHitTime >= 3
            : true
      if (bonusCondition) handleEventSuccess()
      else failEvent()
      event.phase = 'cooldown'
      event.remaining = 3
    }
    return
  }

  if (event.phase === 'cooldown') {
    event.remaining -= dt
    if (event.remaining <= 0) {
      event.phase = 'idle'
      nextEventAt = gameState.time + Math.max(10, 24 - gameState.wave * 0.25) + nextRandom() * 6
    }
  }

  if (completionGrace > 1) completionGrace = 0
}

export function startRunEventDirectorV3(): Stop {
  if (running || typeof window === 'undefined') return stopRunEventDirectorV3
  running = true
  waveSerial = gameState.wave
  nextEventAt = Math.max(18, gameState.time + 18)
  start()
  return stopRunEventDirectorV3
}

let startListenersDone = false
function start(): void {
  if (startListenersDone) return
  startListenersDone = true
}

export function stopRunEventDirectorV3(): void {
  if (!running) return
  running = false
  unsubscribeTick?.()
  unsubscribeTick = undefined
  startListenersDone = false
}

export function resetRunEventDirectorV3(): void {
  const wasRunning = running
  stopRunEventDirectorV3()
  event.kind = 'blood-moon'
  event.phase = 'idle'
  event.remaining = 0
  event.duration = 0
  event.intensity = 0
  event.reward = 0
  event.killsAtStart = 0
  event.startedAt = 0
  event.completed = false
  stats.started = 0
  stats.completed = 0
  stats.failed = 0
  stats.totalReward = 0
  stats.eliteSpawned = 0
  stats.hazardsTriggered = 0
  nextEventAt = 18
  telegraphRemaining = 0
  completionGrace = 0
  noHitTime = 0
  waveSerial = 0
  deterministicCursor = 0
  if (wasRunning) startRunEventDirectorV3()
}

export function getRunEventSnapshot() {
  return {
    event: { ...event },
    stats: { ...stats },
    nextEventAt,
    noHitTime,
  }
}

export function getRunEventKind(): RunEventKind | null {
  return event.phase === 'idle' ? null : event.kind
}

export function isRunEventActive(): boolean {
  return event.phase === 'active'
}

export function getRunEventIntensity(): number {
  return finite(event.intensity)
}

export function forceRunEvent(kind: RunEventKind): boolean {
  if (gameState.phase !== 'playing' || event.phase !== 'idle') return false
  startTelegraph(kind)
  return true
}

export function cancelRunEvent(): void {
  if (event.phase === 'active' || event.phase === 'telegraph') failEvent()
  event.phase = 'cooldown'
  event.remaining = 2
}

export function grantRunEventReward(multiplier: number): number {
  if (event.phase !== 'active') return 0
  const value = Math.max(0, Math.floor(event.reward * clamp(multiplier, 0, 5)))
  gameState.xp += value
  stats.totalReward += value
  return value
}

export function adjustEventIntensity(delta: number): void {
  event.intensity = clamp(event.intensity + finite(delta), 0.1, 3)
}

export const RUN_EVENT_DIRECTOR_V3_VERSION = 3
