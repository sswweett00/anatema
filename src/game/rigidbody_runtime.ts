import * as THREE from 'three'
import { enemies, getPlayer, type Entity } from '../ecs/world'
import { SpatialHash } from './spatial'

export interface RigidBodyConfig {
  playerMass: number
  enemyMass: number
  restitution: number
  friction: number
  positionCorrection: number
  penetrationSlop: number
  playerEnemyRadiusScale: number
  enemyEnemyRadiusScale: number
}

export const RIGID_BODY_CONFIG: RigidBodyConfig = {
  playerMass: 8,
  enemyMass: 1.5,
  restitution: 0.08,
  friction: 0.2,
  positionCorrection: 0.82,
  penetrationSlop: 0.008,
  playerEnemyRadiusScale: 0.98,
  enemyEnemyRadiusScale: 0.94,
}

const normal = new THREE.Vector3()
const enemyHash = new SpatialHash(1.6)

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function massOf(entity: Entity): number {
  return entity.isPlayer ? RIGID_BODY_CONFIG.playerMass : RIGID_BODY_CONFIG.enemyMass
}

function solvePair(a: Entity, b: Entity, radiusScale: number): void {
  if (a.dead || b.dead) return
  const dx = a.position.x - b.position.x
  const dz = a.position.z - b.position.z
  const distanceSq = dx * dx + dz * dz
  const minDistance = Math.max(0.05, (a.radius + b.radius) * radiusScale)
  if (distanceSq >= minDistance * minDistance) return

  const distance = Math.sqrt(Math.max(distanceSq, 1e-8))
  if (distance < 1e-4) {
    const phase = ((a.phase ?? 0) + (b.phase ?? 0) + a.position.x + b.position.z) * 12.9898
    normal.set(Math.cos(phase), 0, Math.sin(phase)).normalize()
  } else {
    normal.set(dx / distance, 0, dz / distance)
  }

  const penetration = minDistance - distance
  const invMassA = 1 / massOf(a)
  const invMassB = 1 / massOf(b)
  const invMassSum = invMassA + invMassB
  const correction = Math.max(0, penetration - RIGID_BODY_CONFIG.penetrationSlop)
    * RIGID_BODY_CONFIG.positionCorrection / invMassSum

  a.position.x += normal.x * correction * invMassA
  a.position.z += normal.z * correction * invMassA
  b.position.x -= normal.x * correction * invMassB
  b.position.z -= normal.z * correction * invMassB

  const relativeVelocity =
    (a.velocity.x - b.velocity.x) * normal.x +
    (a.velocity.z - b.velocity.z) * normal.z
  if (relativeVelocity >= 0) return

  const impulse = -(1 + RIGID_BODY_CONFIG.restitution) * relativeVelocity / invMassSum
  a.velocity.x += normal.x * impulse * invMassA
  a.velocity.z += normal.z * impulse * invMassA
  b.velocity.x -= normal.x * impulse * invMassB
  b.velocity.z -= normal.z * impulse * invMassB

  const tangentX = -normal.z
  const tangentZ = normal.x
  const tangentVelocity =
    (a.velocity.x - b.velocity.x) * tangentX +
    (a.velocity.z - b.velocity.z) * tangentZ
  const frictionImpulse = Math.max(
    -Math.abs(impulse) * RIGID_BODY_CONFIG.friction,
    Math.min(Math.abs(impulse) * RIGID_BODY_CONFIG.friction, -tangentVelocity / invMassSum),
  )

  a.velocity.x += tangentX * frictionImpulse * invMassA
  a.velocity.z += tangentZ * frictionImpulse * invMassA
  b.velocity.x -= tangentX * frictionImpulse * invMassB
  b.velocity.z -= tangentZ * frictionImpulse * invMassB
}

export function solvePlayerContacts(): void {
  const player = getPlayer()
  if (!player) return

  enemyHash.build(enemies.entities)
  enemyHash.forEachNearbyIndex(player.position, 4.5, enemies.entities, (_, enemy) => {
    solvePair(player, enemy, RIGID_BODY_CONFIG.playerEnemyRadiusScale)
  })
}

export function solveEnemyContacts(): void {
  const list = enemies.entities
  if (list.length < 2) return

  enemyHash.build(list)
  const contactRadius = 1.55

  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (a.dead) continue
    enemyHash.forEachNearbyIndex(a.position, contactRadius, list, (j, b) => {
      if (j <= i || b.dead || b === a) return
      solvePair(a, b, RIGID_BODY_CONFIG.enemyEnemyRadiusScale)
    })
  }
}

function sanitize(entity: Entity): void {
  entity.position.x = finite(entity.position.x)
  entity.position.y = finite(entity.position.y)
  entity.position.z = finite(entity.position.z)
  entity.velocity.x = finite(entity.velocity.x)
  entity.velocity.y = finite(entity.velocity.y)
  entity.velocity.z = finite(entity.velocity.z)
}

export function sanitizeRigidBodies(): void {
  const player = getPlayer()
  if (player) sanitize(player)
  for (const enemy of enemies.entities) sanitize(enemy)
}

export function stepRigidBodyContacts(_dt: number): void {
  solveEnemyContacts()
  solvePlayerContacts()
  sanitizeRigidBodies()
}
