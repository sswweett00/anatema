import * as THREE from 'three'
import { enemies, gameState, getPlayer, type Entity } from '../ecs/world'
import { onSimulationTick } from './simulation_clock'

const radial = new THREE.Vector3()
const tangent = new THREE.Vector3()
let accumulator = 0
let unsubscribe: (() => void) | undefined

const STEP = 1 / 15

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function stableOrbitSign(entity: Entity): number {
  const x = finite(entity.position.x)
  const z = finite(entity.position.z)
  const seed = Math.sin(x * 12.9898 + z * 78.233 + (entity.enemyKind ?? 0) * 37.719)
  return seed >= 0 ? 1 : -1
}

function isBoss(entity: Entity): boolean {
  return (entity.scale ?? 1) >= 2.3 || (entity.maxHealth ?? 0) >= 1200
}

function steer(enemy: Entity, player: Entity, dt: number): void {
  if (enemy.dead) return
  radial.subVectors(player.position, enemy.position)
  radial.y = 0
  const distance = radial.length()
  if (!Number.isFinite(distance) || distance < 1e-4) return
  radial.multiplyScalar(1 / distance)
  tangent.set(-radial.z, 0, radial.x).multiplyScalar(stableOrbitSign(enemy))

  const healthRatio = Math.max(0, Math.min(1, enemy.health / Math.max(1, enemy.maxHealth)))
  const boss = isBoss(enemy)

  if (distance < 2.4 && !boss) {
    const push = Math.min(3.4, (2.4 - distance) * 3.2)
    enemy.velocity.x -= radial.x * push * dt
    enemy.velocity.z -= radial.z * push * dt
    enemy.velocity.x += tangent.x * 0.8 * dt
    enemy.velocity.z += tangent.z * 0.8 * dt
    return
  }

  if (distance < (boss ? 8.5 : 6.5)) {
    const desiredTangent = boss ? 0.55 : 1.25
    const desiredRadial = boss ? 0.22 : 0.42
    enemy.velocity.x += (tangent.x * desiredTangent + radial.x * desiredRadial) * dt
    enemy.velocity.z += (tangent.z * desiredTangent + radial.z * desiredRadial) * dt

    if (!boss && healthRatio < 0.22 && distance < 5.2) {
      const escape = 0.8 + (0.22 - healthRatio) * 2.2
      enemy.velocity.x -= radial.x * escape * dt
      enemy.velocity.z -= radial.z * escape * dt
    }
    return
  }

  const chase = boss ? 0.75 : 1.1
  enemy.velocity.x += radial.x * chase * dt
  enemy.velocity.z += radial.z * chase * dt
}

function step(dt: number): void {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return
  const list = enemies.entities
  if (list.length === 0) return
  const stride = list.length > 1000 ? 2 : 1
  for (let i = 0; i < list.length; i += stride) steer(list[i], player, dt)
}

function onTick(dt: number): void {
  accumulator += dt
  if (accumulator > STEP * 3) accumulator = STEP * 3
  while (accumulator >= STEP) {
    step(STEP)
    accumulator -= STEP
  }
}

export function startEnemyBehaviorRuntime(): () => void {
  if (unsubscribe) return stopEnemyBehaviorRuntime
  accumulator = 0
  unsubscribe = onSimulationTick(onTick)
  return stopEnemyBehaviorRuntime
}

export function stopEnemyBehaviorRuntime(): void {
  unsubscribe?.()
  unsubscribe = undefined
  accumulator = 0
}

export function resetEnemyBehaviorRuntime(): void {
  stopEnemyBehaviorRuntime()
}
