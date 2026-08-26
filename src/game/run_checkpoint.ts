import { enemies, bullets, gameState, getPlayer, lootEntities, particles, players, world, type Entity } from '../ecs/world'
import { abilities } from './abilities'
import { getRunSeed } from './rng'

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
