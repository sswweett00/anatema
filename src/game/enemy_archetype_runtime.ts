import { enemies, gameState, getPlayer, spawnEnemy, spawnBurst, type Entity } from '../ecs/world'
import { nextRandom } from './rng'
import { onSimulationTick } from './simulation_clock'

const SPECIAL_KINDS = [
  { kind: 3, name: 'wraith', minWave: 5, chance: 0.08, hp: 1.9, speed: 1.22, damage: 1.45, armor: 0, scale: 1.08, color: 0x9f7cff },
  { kind: 4, name: 'juggernaut', minWave: 8, chance: 0.035, hp: 7.5, speed: 0.55, damage: 2.4, armor: 10, scale: 1.85, color: 0xc8a78a },
] as const

let accumulator = 0
let unsubscribe: (() => void) | undefined

function transformLastEnemy(player: Entity, profile: (typeof SPECIAL_KINDS)[number]): void {
  const enemy = enemies.entities[enemies.entities.length - 1]
  if (!enemy || enemy.dead) return
  enemy.enemyKind = profile.kind
  enemy.health *= profile.hp
  enemy.maxHealth = enemy.health
  enemy.speed *= profile.speed
  enemy.damage = (enemy.damage ?? 4) * profile.damage
  enemy.armor = Math.max(enemy.armor, profile.armor)
  enemy.scale = (enemy.scale ?? 1) * profile.scale
  enemy.radius *= profile.scale
  enemy.velocity.set(player.position.x - enemy.position.x, 0, player.position.z - enemy.position.z).normalize().multiplyScalar(0.8)
  spawnBurst(enemy.position, profile.color, profile.kind === 4 ? 16 : 9, 3.8, 0.65)
}

function tick(dt: number): void {
  if (gameState.phase !== 'playing' || enemies.entities.length >= 1390) return
  accumulator += dt
  if (accumulator < 0.5) return
  accumulator = 0
  const player = getPlayer()
  if (!player) return

  for (const profile of SPECIAL_KINDS) {
    if (gameState.wave < profile.minWave || nextRandom() >= profile.chance) continue
    const before = enemies.entities.length
    spawnEnemy(player.position)
    if (enemies.entities.length > before) transformLastEnemy(player, profile)
  }
}

export function startEnemyArchetypeRuntime(): () => void {
  if (unsubscribe) return stopEnemyArchetypeRuntime
  unsubscribe = onSimulationTick(tick)
  return stopEnemyArchetypeRuntime
}

export function stopEnemyArchetypeRuntime(): void {
  unsubscribe?.()
  unsubscribe = undefined
}

export function resetEnemyArchetypeRuntime(): void {
  stopEnemyArchetypeRuntime()
  accumulator = 0
}
