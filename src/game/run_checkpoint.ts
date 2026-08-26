import * as THREE from 'three'
import { enemies, bullets, gameState, getPlayer, lootEntities, particles, players, world, type Entity } from '../ecs/world'
import { abilities } from './abilities'
import { getRunSeed, setRunSeed } from './rng'

export type EntityCheckpoint = {
  archetype: 'player' | 'enemy' | 'bullet' | 'particle' | 'loot'
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  health: number
  maxHealth: number
  age: number
  life: number
  kind: number
}

export type RunCheckpoint = {
  version: 1
  seed: number
  phase: string
  time: number
  kills: number
  level: number
  xp: number
  xpNext: number
  wave: number
  combo: number
  maxCombo: number
  abilities: Record<string, number>
  entities: EntityCheckpoint[]
}

const MAX_CHECKPOINT_ENTITIES = 2200
const MAX_CHECKPOINT_JSON = 2_000_000

let running = false
let lastChecksum = ''

function classify(entity: Entity): EntityCheckpoint['archetype'] {
  if (entity.isPlayer) return 'player'
  if (entity.isEnemy) return 'enemy'
  if (entity.isBullet) return 'bullet'
  if (entity.isParticle) return 'particle'
  return 'loot'
}

function serializeEntity(entity: Entity): EntityCheckpoint {
  return {
    archetype: classify(entity),
    x: Number(entity.position.x.toFixed(5)),
    y: Number(entity.position.y.toFixed(5)),
    z: Number(entity.position.z.toFixed(5)),
    vx: Number(entity.velocity.x.toFixed(5)),
    vy: Number(entity.velocity.y.toFixed(5)),
    vz: Number(entity.velocity.z.toFixed(5)),
    health: Number(entity.health.toFixed(4)),
    maxHealth: Number(entity.maxHealth.toFixed(4)),
    age: Number((entity.age ?? 0).toFixed(4)),
    life: Number((entity.life ?? 0).toFixed(4)),
    kind: entity.enemyKind ?? 0,
  }
}

export function captureRunCheckpoint(): RunCheckpoint {
  const entityList = [...players.entities, ...enemies.entities, ...bullets.entities, ...particles.entities, ...lootEntities.entities]
  const ordered = entityList
    .map(serializeEntity)
    .sort((a, b) => a.archetype.localeCompare(b.archetype) || a.kind - b.kind || a.x - b.x || a.z - b.z)

  return {
    version: 1,
    seed: getRunSeed(),
    phase: gameState.phase,
    time: Number(gameState.time.toFixed(4)),
    kills: gameState.kills,
    level: gameState.level,
    xp: Number(gameState.xp.toFixed(4)),
    xpNext: Number(gameState.xpNext.toFixed(4)),
    wave: gameState.wave,
    combo: gameState.combo,
    maxCombo: gameState.maxCombo,
    abilities: Object.fromEntries(Object.entries(abilities).sort(([a], [b]) => a.localeCompare(b))),
    entities: ordered,
  }
}

export function checksumCheckpoint(checkpoint: RunCheckpoint): string {
  const json = JSON.stringify(checkpoint)
  let hash = 2166136261
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getRunCheckpointChecksum(): string {
  return checksumCheckpoint(captureRunCheckpoint())
}

export function getLastRunCheckpointChecksum(): string {
  return lastChecksum
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidEntity(entity: unknown): entity is EntityCheckpoint {
  if (!entity || typeof entity !== 'object') return false
  const candidate = entity as Record<string, unknown>
  if (!['player', 'enemy', 'bullet', 'particle', 'loot'].includes(String(candidate.archetype))) return false
  const numeric = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'health', 'maxHealth', 'age', 'life', 'kind']
  return numeric.every((key) => finite(candidate[key]))
}

export function validateRunCheckpoint(input: unknown): input is RunCheckpoint {
  if (!input || typeof input !== 'object') return false
  const c = input as Partial<RunCheckpoint>
  if (c.version !== 1 || !finite(c.seed) || !Number.isInteger(c.seed)) return false
  if (typeof c.phase !== 'string' || !finite(c.time) || !finite(c.kills) || !finite(c.level) || !finite(c.xp) || !finite(c.xpNext) || !finite(c.wave) || !finite(c.combo) || !finite(c.maxCombo)) return false
  if (!c.abilities || typeof c.abilities !== 'object' || !Array.isArray(c.entities)) return false
  if (c.entities.length > MAX_CHECKPOINT_ENTITIES) return false
  for (const entity of c.entities) {
    if (!isValidEntity(entity)) return false
  }
  return true
}

function clearWorld(): void {
  for (const entity of [...world.entities]) world.remove(entity)
}

function createEntity(snapshot: EntityCheckpoint): Entity {
  const base: Entity = {
    position: new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z),
    velocity: new THREE.Vector3(snapshot.vx, snapshot.vy, snapshot.vz),
    health: Math.max(0, snapshot.health),
    maxHealth: Math.max(0.001, snapshot.maxHealth),
    armor: 0,
    poise: 0,
    maxPoise: 1,
    speed: 0,
    radius: 0.3,
    age: Math.max(0, snapshot.age),
    life: Math.max(0, snapshot.life),
    maxLife: Math.max(0.001, snapshot.life),
  }
  switch (snapshot.archetype) {
    case 'player':
      base.isPlayer = true
      base.armor = 3
      base.poise = 100
      base.maxPoise = 100
      base.speed = 5.4
      base.radius = 0.5
      base.dashZ = 1
      base.facingZ = 1
      break
    case 'enemy':
      base.isEnemy = true
      base.enemyKind = Math.max(0, Math.trunc(snapshot.kind))
      base.dead = base.health <= 0
      base.radius = 0.42
      break
    case 'bullet':
      base.isBullet = true
      base.radius = 0.22
      base.speed = base.velocity.length()
      base.damage = Math.max(0, base.health)
      base.pierce = Math.max(0, Math.trunc(snapshot.kind))
      break
    case 'particle':
      base.isParticle = true
      base.radius = 0.08
      base.colorHex = Math.max(0, Math.min(0xffffff, Math.trunc(snapshot.kind)))
      break
    case 'loot':
      base.isLoot = true
      base.radius = 0.25
      base.value = Math.max(0, snapshot.kind)
      break
  }
  return base
}

export function restoreRunCheckpoint(input: unknown): { ok: boolean; reason?: string } {
  if (typeof input === 'string' && input.length > MAX_CHECKPOINT_JSON) return { ok: false, reason: 'checkpoint-too-large' }
  const checkpoint = typeof input === 'string' ? (() => {
    try { return JSON.parse(input) as unknown } catch { return null }
  })() : input

  if (!validateRunCheckpoint(checkpoint)) return { ok: false, reason: 'invalid-checkpoint' }

  clearWorld()
  setRunSeed(checkpoint.seed)
  gameState.phase = checkpoint.phase as typeof gameState.phase
  gameState.time = checkpoint.time
  gameState.kills = Math.trunc(checkpoint.kills)
  gameState.level = Math.trunc(checkpoint.level)
  gameState.xp = checkpoint.xp
  gameState.xpNext = Math.max(1, checkpoint.xpNext)
  gameState.wave = Math.trunc(checkpoint.wave)
  gameState.combo = Math.trunc(checkpoint.combo)
  gameState.maxCombo = Math.max(gameState.combo, Math.trunc(checkpoint.maxCombo))

  for (const key of Object.keys(abilities)) {
    const value = checkpoint.abilities[key]
    if (typeof value === 'number' && Number.isFinite(value)) abilities[key] = Math.max(0, Math.trunc(value))
  }

  for (const snapshot of checkpoint.entities) world.add(createEntity(snapshot))

  if (!getPlayer()) world.add(createEntity({
    archetype: 'player', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    health: 100, maxHealth: 100, age: 0, life: 0, kind: 0,
  }))

  lastChecksum = checksumCheckpoint(captureRunCheckpoint())
  return { ok: true }
}

export function startRunCheckpoint(): () => void {
  if (running || typeof window === 'undefined') return stopRunCheckpoint
  running = true
  const report = () => {
    if (!running) return
    lastChecksum = getRunCheckpointChecksum()
    window.dispatchEvent(new CustomEvent('anatema:checkpoint', {
      detail: {
        checksum: lastChecksum,
        seed: getRunSeed(),
        entities: world.entities.length,
        player: Boolean(getPlayer()),
      },
    }))
  }
  report()
  const id = window.setInterval(report, 2000)
  return () => {
    window.clearInterval(id)
    stopRunCheckpoint()
  }
}

export function stopRunCheckpoint(): void {
  running = false
}

export function resetRunCheckpoint(): void {
  stopRunCheckpoint()
  lastChecksum = ''
}
