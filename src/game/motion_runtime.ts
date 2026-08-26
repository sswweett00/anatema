import * as THREE from 'three'
import { enemies, gameState, getPlayer, world, type Entity } from '../ecs/world'

export interface MotionConfig {
  acceleration: number
  deceleration: number
  airControl: number
  maxSpeed: number
  dashSpeed: number
  dashDuration: number
  dashDrag: number
  knockbackDrag: number
  separationRadius: number
  separationStrength: number
}

export const MOTION_CONFIG: MotionConfig = {
  acceleration: 28,
  deceleration: 34,
  airControl: 1,
  maxSpeed: 8,
  dashSpeed: 24,
  dashDuration: 0.16,
  dashDrag: 7,
  knockbackDrag: 10,
  separationRadius: 0.78,
  separationStrength: 3.2,
}

const tmp = new THREE.Vector3()
const offset = new THREE.Vector3()

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function dampScalar(current: number, target: number, sharpness: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, sharpness, dt)
}

export function integratePlayerMotion(player: Entity, desired: THREE.Vector3, dt: number): void {
  const safeDt = Math.min(0.05, Math.max(0.001, dt))
  const dashTime = Math.max(0, finite(player.dashTime ?? 0))

  if (dashTime > 0) {
    player.dashTime = Math.max(0, dashTime - safeDt)
    player.velocity.x = dampScalar(player.velocity.x, finite(player.dashX) * MOTION_CONFIG.dashSpeed, 24, safeDt)
    player.velocity.z = dampScalar(player.velocity.z, finite(player.dashZ) * MOTION_CONFIG.dashSpeed, 24, safeDt)
  } else {
    const desiredSpeed = Math.min(MOTION_CONFIG.maxSpeed, desired.length())
    if (desiredSpeed > 0.001) desired.normalize().multiplyScalar(desiredSpeed)

    const sharpness = desiredSpeed > 0.001 ? MOTION_CONFIG.acceleration : MOTION_CONFIG.deceleration
    player.velocity.x = dampScalar(player.velocity.x, desired.x, sharpness, safeDt)
    player.velocity.z = dampScalar(player.velocity.z, desired.z, sharpness, safeDt)
  }

  player.velocity.x *= Math.max(0, 1 - (MOTION_CONFIG.knockbackDrag + MOTION_CONFIG.dashDrag * (dashTime > 0 ? 0.1 : 1)) * safeDt * 0.08)
  player.velocity.z *= Math.max(0, 1 - (MOTION_CONFIG.knockbackDrag + MOTION_CONFIG.dashDrag * (dashTime > 0 ? 0.1 : 1)) * safeDt * 0.08)

  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  if (speed > MOTION_CONFIG.maxSpeed * 1.35) {
    const scale = (MOTION_CONFIG.maxSpeed * 1.35) / speed
    player.velocity.x *= scale
    player.velocity.z *= scale
  }

  player.position.x += player.velocity.x * safeDt
  player.position.z += player.velocity.z * safeDt
}

export function applyKnockback(entity: Entity, direction: THREE.Vector3, strength: number): void {
  const safeStrength = Math.max(0, Math.min(30, finite(strength)))
  if (safeStrength <= 0) return
  tmp.copy(direction)
  tmp.y = 0
  if (tmp.lengthSq() < 1e-8) return
  tmp.normalize().multiplyScalar(safeStrength)
  entity.velocity.x += tmp.x
  entity.velocity.z += tmp.z
}

export function resolveEnemySeparation(): void {
  const list = enemies.entities
  if (list.length < 2) return

  const radius = MOTION_CONFIG.separationRadius
  const radiusSq = radius * radius
  const maxNeighbors = list.length > 800 ? 4 : 8

  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (a.dead) continue

    let neighbors = 0
    for (let j = Math.max(0, i - 12); j < Math.min(list.length, i + 13) && neighbors < maxNeighbors; j++) {
      if (i === j) continue
      const b = list[j]
      if (b.dead) continue

      offset.subVectors(a.position, b.position)
      offset.y = 0
      const d2 = offset.lengthSq()
      if (d2 <= 1e-6 || d2 > radiusSq) continue

      const d = Math.sqrt(d2)
      const push = (radius - d) / radius
      offset.multiplyScalar((push * MOTION_CONFIG.separationStrength) / d)
      a.velocity.x += offset.x
      a.velocity.z += offset.z
      neighbors++
    }

    const speed = Math.hypot(a.velocity.x, a.velocity.z)
    const cap = Math.max(2, finite(a.speed, 2) * 1.4)
    if (speed > cap) {
      const scale = cap / speed
      a.velocity.x *= scale
      a.velocity.z *= scale
    }
  }
}

export function resetMotionState(): void {
  const player = getPlayer()
  if (player) {
    player.velocity.set(0, 0, 0)
    player.dashTime = 0
    player.dashCooldown = 0
  }

  for (const entity of world.entities) {
    if (!entity.velocity) entity.velocity = new THREE.Vector3()
    entity.velocity.set(
      finite(entity.velocity.x),
      finite(entity.velocity.y),
      finite(entity.velocity.z),
    )
  }

  gameState.shake = 0
}
