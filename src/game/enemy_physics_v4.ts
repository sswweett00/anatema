import * as THREE from 'three'
import { enemies, gameState, getPlayer, type Entity } from '../ecs/world'
import { onSimulationTick } from './simulation_clock'
import { SpatialHash } from './spatial'

/**
 * ANATEMA Enemy Physics V4
 * ------------------------
 * Deterministic, fixed-step enemy motion layer. It intentionally owns only
 * enemy movement/impulses. Damage and ability logic remain elsewhere.
 *
 * Goals:
 * - stable steering at high enemy counts
 * - reusable scratch vectors / zero per-frame transient arrays
 * - deterministic orbit/separation choices
 * - soft collision response instead of hard teleporting
 * - knockback momentum, damping, braking and recovery
 * - per-archetype locomotion profiles
 * - elite/boss mass and resistance differences
 * - near-player crowd control without freezing the whole swarm
 * - world-boundary recovery
 * - aggressive NaN/Infinity hardening
 */

type Stop = () => void

type PhysicsState = {
  orbit: number
  targetDistance: number
  desiredSpeed: number
  acceleration: number
  braking: number
  knockbackResistance: number
  collisionResistance: number
  airControl: number
  velocityLimit: number
  impulseX: number
  impulseZ: number
  recovery: number
  invulnerability: number
  lastDistance: number
  lastHealth: number
  phase: number
  crowdSlot: number
}

export interface EnemyPhysicsConfig {
  hz: number
  maxCatchUpSteps: number
  gravity: number
  drag: number
  stopDrag: number
  restitution: number
  friction: number
  softCollisionRadius: number
  playerRepulsionRadius: number
  playerRepulsionStrength: number
  arenaLimit: number
  arenaSoftBand: number
  teleportRecoveryLimit: number
  maxImpulse: number
}

export const ENEMY_PHYSICS_V4_CONFIG: EnemyPhysicsConfig = {
  hz: 60,
  maxCatchUpSteps: 4,
  gravity: 28,
  drag: 5.5,
  stopDrag: 9.5,
  restitution: 0.12,
  friction: 0.28,
  softCollisionRadius: 1.45,
  playerRepulsionRadius: 1.8,
  playerRepulsionStrength: 7.5,
  arenaLimit: 250,
  arenaSoftBand: 18,
  teleportRecoveryLimit: 310,
  maxImpulse: 18,
}

const hash = new SpatialHash(1.8)
const radial = new THREE.Vector3()
const desired = new THREE.Vector3()
const separation = new THREE.Vector3()
const tangent = new THREE.Vector3()
const scratch = new THREE.Vector3()
const scratch2 = new THREE.Vector3()

const states = new WeakMap<Entity, PhysicsState>()

let running = false
let unsubscribe: Stop | undefined
let accumulator = 0
let simulationTime = 0

function finite(value: number | undefined | null, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clamp01(value: number): number {
  return clamp(finite(value), 0, 1)
}

function smoothstep01(value: number): number {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
}

function dampingFactor(rate: number, dt: number): number {
  return Math.exp(-Math.max(0, rate) * Math.max(0, dt))
}

function deterministicSign(entity: Entity): number {
  const p = finite(entity.phase)
  const x = finite(entity.position.x)
  const z = finite(entity.position.z)
  const value = Math.sin(p * 12.9898 + x * 78.233 + z * 37.719)
  return value >= 0 ? 1 : -1
}

function isBoss(entity: Entity): boolean {
  return (entity.maxHealth ?? 0) >= 1200 || (entity.scale ?? 1) >= 2.3
}

function isElite(entity: Entity): boolean {
  return isBoss(entity) || (entity.scale ?? 1) >= 1.18
}

function makeState(entity: Entity): PhysicsState {
  const boss = isBoss(entity)
  const elite = isElite(entity)
  const kind = entity.enemyKind ?? 0
  const baseMass = boss ? 5.5 : elite ? 2.8 : 1.4
  return {
    orbit: deterministicSign(entity),
    targetDistance: kind === 0 ? 1.15 : kind === 1 ? 1.35 : kind === 2 ? 1.7 : boss ? 5.8 : 1.5,
    desiredSpeed: entity.speed * (boss ? 0.82 : elite ? 0.95 : 1),
    acceleration: (boss ? 6.5 : elite ? 9 : 12) / Math.max(0.7, baseMass * 0.65),
    braking: boss ? 3.8 : elite ? 5.2 : 6.8,
    knockbackResistance: clamp(baseMass / 6, 0.12, 0.92),
    collisionResistance: clamp(baseMass / 5.5, 0.16, 0.96),
    airControl: boss ? 0.5 : elite ? 0.72 : 0.92,
    velocityLimit: boss ? 7 : elite ? 8.5 : 10.5,
    impulseX: 0,
    impulseZ: 0,
    recovery: 0,
    invulnerability: 0,
    lastDistance: 0,
    lastHealth: finite(entity.health),
    phase: finite(entity.phase),
    crowdSlot: Math.abs(Math.floor(finite(entity.phase) * 31)) % 8,
  }
}

function stateFor(entity: Entity): PhysicsState {
  let state = states.get(entity)
  if (!state) {
    state = makeState(entity)
    states.set(entity, state)
  }
  return state
}

function sanitizeEntity(entity: Entity): void {
  entity.position.x = finite(entity.position.x)
  entity.position.y = finite(entity.position.y)
  entity.position.z = finite(entity.position.z)
  entity.velocity.x = finite(entity.velocity.x)
  entity.velocity.y = finite(entity.velocity.y)
  entity.velocity.z = finite(entity.velocity.z)
  entity.speed = Math.max(0, finite(entity.speed, 0))
  entity.radius = clamp(finite(entity.radius, 0.35), 0.05, 4)
  entity.health = finite(entity.health, entity.maxHealth)
  entity.maxHealth = Math.max(1, finite(entity.maxHealth, 1))
  entity.attackCooldown = finite(entity.attackCooldown ?? 0)
  entity.hitFlash = finite(entity.hitFlash ?? 0)
  entity.slow = Math.max(0, finite(entity.slow ?? 0))
  entity.stagger = Math.max(0, finite(entity.stagger ?? 0))
}

function profile(entity: Entity): { desiredDistance: number; speedMul: number; steering: number; turnRate: number; strafe: number } {
  switch (entity.enemyKind ?? 0) {
    case 0:
      return { desiredDistance: 1.3, speedMul: 1.08, steering: 13, turnRate: 9, strafe: 0.65 }
    case 1:
      return { desiredDistance: 1.65, speedMul: 0.9, steering: 10, turnRate: 7, strafe: 0.85 }
    case 2:
      return { desiredDistance: 2.2, speedMul: 0.68, steering: 7.5, turnRate: 5.5, strafe: 0.38 }
    default:
      return { desiredDistance: 2.8, speedMul: 0.9, steering: 8, turnRate: 5, strafe: 0.55 }
  }
}

function desiredOrbit(entity: Entity, state: PhysicsState, distance: number): number {
  const p = profile(entity)
  const healthRatio = clamp01(entity.health / Math.max(1, entity.maxHealth))
  const lowHealthBias = healthRatio < 0.22 && !isBoss(entity) ? 0.75 : 0
  const proximity = smoothstep01((p.desiredDistance + 2.5 - distance) / 2.5)
  const bossBias = isBoss(entity) ? 0.45 : 1
  return state.orbit * (p.strafe + proximity * 0.85 + lowHealthBias) * bossBias
}

function applySteering(entity: Entity, player: Entity, state: PhysicsState, dt: number): void {
  radial.subVectors(player.position, entity.position)
  radial.y = 0
  const distance = radial.length()
  if (distance < 0.0001) return
  radial.multiplyScalar(1 / distance)
  tangent.set(-radial.z, 0, radial.x)

  const p = profile(entity)
  const targetDistance = p.desiredDistance
  const error = distance - targetDistance
  const approach = clamp(error * 1.25, -3.5, 4.5)
  const orbitSpeed = desiredOrbit(entity, state, distance)
  const speedMul = state.desiredSpeed / Math.max(0.1, entity.speed || state.desiredSpeed || 1)

  desired.copy(radial).multiplyScalar(approach * speedMul)
  desired.addScaledVector(tangent, orbitSpeed)

  if (distance > 9) {
    desired.addScaledVector(radial, Math.min(4, (distance - 9) * 0.5))
  }

  if (distance < targetDistance * 0.65) {
    desired.addScaledVector(radial, -Math.min(4, (targetDistance - distance) * 2.4))
  }

  if ((entity.slow ?? 0) > 0) {
    desired.multiplyScalar(clamp(0.42 + (entity.slow ?? 0) * 0.05, 0.35, 0.7))
  }

  if ((entity.stagger ?? 0) > 0) {
    desired.multiplyScalar(0.25)
  }

  const desiredMagnitude = desired.length()
  const maxDesired = Math.max(0.5, state.desiredSpeed * p.speedMul)
  if (desiredMagnitude > maxDesired) desired.multiplyScalar(maxDesired / desiredMagnitude)

  const acceleration = p.steering * state.airControl
  entity.velocity.x += (desired.x - entity.velocity.x) * clamp(acceleration * dt, 0, 1)
  entity.velocity.z += (desired.z - entity.velocity.z) * clamp(acceleration * dt, 0, 1)

  const currentSpeed = Math.hypot(entity.velocity.x, entity.velocity.z)
  if (currentSpeed > state.velocityLimit) {
    const excess = currentSpeed - state.velocityLimit
    const factor = 1 - clamp(excess / Math.max(0.1, currentSpeed), 0, 0.35)
    entity.velocity.x *= factor
    entity.velocity.z *= factor
  }
}

function applyBraking(entity: Entity, state: PhysicsState, dt: number): void {
  const speed = Math.hypot(entity.velocity.x, entity.velocity.z)
  const desiredSpeed = state.desiredSpeed
  if (speed <= desiredSpeed) return
  const factor = dampingFactor(state.braking, dt)
  entity.velocity.x *= factor
  entity.velocity.z *= factor
}

function applyImpulses(entity: Entity, state: PhysicsState, dt: number): void {
  if (Math.abs(state.impulseX) < 0.0001 && Math.abs(state.impulseZ) < 0.0001) return
  const resistance = 1 - clamp(state.knockbackResistance, 0, 0.94)
  entity.velocity.x += state.impulseX * resistance * dt
  entity.velocity.z += state.impulseZ * resistance * dt
  const decay = dampingFactor(10 + state.knockbackResistance * 8, dt)
  state.impulseX *= decay
  state.impulseZ *= decay
  if (Math.abs(state.impulseX) < 0.0001) state.impulseX = 0
  if (Math.abs(state.impulseZ) < 0.0001) state.impulseZ = 0
}

function applyPlayerRepulsion(entity: Entity, player: Entity, state: PhysicsState, dt: number): void {
  radial.subVectors(entity.position, player.position)
  radial.y = 0
  const distance = radial.length()
  if (distance < 0.0001 || distance >= ENEMY_PHYSICS_V4_CONFIG.playerRepulsionRadius) return
  radial.multiplyScalar(1 / distance)
  const penetration = ENEMY_PHYSICS_V4_CONFIG.playerRepulsionRadius - distance
  const strength = penetration * ENEMY_PHYSICS_V4_CONFIG.playerRepulsionStrength * (1 - state.collisionResistance)
  entity.velocity.x += radial.x * strength * dt
  entity.velocity.z += radial.z * strength * dt
}

function applyArenaBoundary(entity: Entity, state: PhysicsState, dt: number): void {
  const limit = ENEMY_PHYSICS_V4_CONFIG.arenaLimit
  const soft = ENEMY_PHYSICS_V4_CONFIG.arenaSoftBand
  const radius = Math.hypot(entity.position.x, entity.position.z)

  if (radius > ENEMY_PHYSICS_V4_CONFIG.teleportRecoveryLimit) {
    const targetRadius = limit - 4
    const inv = radius > 0.001 ? 1 / radius : 0
    entity.position.x *= targetRadius * inv
    entity.position.z *= targetRadius * inv
    entity.velocity.multiplyScalar(0.15)
    state.recovery = 1
    return
  }

  if (radius <= limit - soft) return
  const normalized = clamp01((radius - (limit - soft)) / soft)
  const force = smoothstep01(normalized) * 20
  const inv = radius > 0.001 ? 1 / radius : 0
  entity.velocity.x -= entity.position.x * inv * force * dt
  entity.velocity.z -= entity.position.z * inv * force * dt
}

function integrate(entity: Entity, state: PhysicsState, dt: number): void {
  applyImpulses(entity, state, dt)
  applyBraking(entity, state, dt)

  const drag = (entity.stagger ?? 0) > 0 ? ENEMY_PHYSICS_V4_CONFIG.stopDrag : ENEMY_PHYSICS_V4_CONFIG.drag
  const damping = dampingFactor(drag, dt)
  entity.velocity.x *= damping
  entity.velocity.z *= damping

  const speed = Math.hypot(entity.velocity.x, entity.velocity.z)
  if (speed > state.velocityLimit) {
    const factor = state.velocityLimit / speed
    entity.velocity.x *= factor
    entity.velocity.z *= factor
  }

  entity.position.x += entity.velocity.x * dt
  entity.position.z += entity.velocity.z * dt
  entity.position.y = 0

  state.recovery = Math.max(0, state.recovery - dt * 1.7)
  state.invulnerability = Math.max(0, state.invulnerability - dt)
}

function solvePair(a: Entity, b: Entity, dt: number): void {
  if (a.dead || b.dead) return
  const dx = a.position.x - b.position.x
  const dz = a.position.z - b.position.z
  const distanceSq = dx * dx + dz * dz
  const radius = Math.max(0.05, a.radius + b.radius)
  const radiusSq = radius * radius
  if (distanceSq >= radiusSq) return

  const distance = Math.sqrt(Math.max(distanceSq, 1e-8))
  const nx = distance > 1e-4 ? dx / distance : deterministicSign(a) * 0.7071
  const nz = distance > 1e-4 ? dz / distance : deterministicSign(b) * 0.7071
  const penetration = radius - distance

  const aState = stateFor(a)
  const bState = stateFor(b)
  const aWeight = 1 - aState.collisionResistance
  const bWeight = 1 - bState.collisionResistance
  const weightSum = Math.max(0.1, aWeight + bWeight)
  const correction = clamp(penetration * 0.62, 0, 0.34)
  const aMove = correction * (aWeight / weightSum)
  const bMove = correction * (bWeight / weightSum)

  a.position.x += nx * aMove
  a.position.z += nz * aMove
  b.position.x -= nx * bMove
  b.position.z -= nz * bMove

  const relative = (a.velocity.x - b.velocity.x) * nx + (a.velocity.z - b.velocity.z) * nz
  if (relative >= 0) return

  const restitution = ENEMY_PHYSICS_V4_CONFIG.restitution
  const impulse = -(1 + restitution) * relative / Math.max(0.25, 1 + aState.collisionResistance + bState.collisionResistance)
  const impulseScale = clamp(impulse, 0, 6)

  a.velocity.x += nx * impulseScale * (1 - aState.collisionResistance) * dt * 14
  a.velocity.z += nz * impulseScale * (1 - aState.collisionResistance) * dt * 14
  b.velocity.x -= nx * impulseScale * (1 - bState.collisionResistance) * dt * 14
  b.velocity.z -= nz * impulseScale * (1 - bState.collisionResistance) * dt * 14

  const tx = -nz
  const tz = nx
  const tangentVelocity = (a.velocity.x - b.velocity.x) * tx + (a.velocity.z - b.velocity.z) * tz
  const friction = clamp(ENEMY_PHYSICS_V4_CONFIG.friction * Math.abs(impulseScale), 0, 1.5)
  const frictionCorrection = clamp(-tangentVelocity * friction * dt, -1, 1)
  a.velocity.x += tx * frictionCorrection
  a.velocity.z += tz * frictionCorrection
  b.velocity.x -= tx * frictionCorrection
  b.velocity.z -= tz * frictionCorrection
}

function solveCrowd(dt: number): void {
  const list = enemies.entities
  if (list.length < 2) return
  hash.build(list)
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (a.dead) continue
    hash.forEachNearby(a.position, ENEMY_PHYSICS_V4_CONFIG.softCollisionRadius, list, (b) => {
      if (b === a) return
      if (b.position.x < a.position.x || (b.position.x === a.position.x && b.position.z <= a.position.z)) return
      solvePair(a, b, dt)
    })
  }
}

function integrateEnemy(entity: Entity, player: Entity, dt: number): void {
  if (entity.dead) return
  sanitizeEntity(entity)
  const state = stateFor(entity)
  state.phase += dt

  radial.subVectors(player.position, entity.position)
  radial.y = 0
  state.lastDistance = radial.length()

  applySteering(entity, player, state, dt)
  applyPlayerRepulsion(entity, player, state, dt)
  applyArenaBoundary(entity, state, dt)
  integrate(entity, state, dt)

  const health = finite(entity.health)
  if (health < state.lastHealth - 0.0001) {
    const ratio = clamp01((state.lastHealth - health) / Math.max(1, entity.maxHealth))
    state.recovery = Math.min(1, state.recovery + ratio * 0.65)
  }
  state.lastHealth = health
}

function step(dt: number): void {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return
  sanitizeEntity(player)

  const list = enemies.entities
  if (list.length === 0) return

  simulationTime += dt
  for (let i = 0; i < list.length; i++) {
    integrateEnemy(list[i], player, dt)
  }
  solveCrowd(dt)

  for (let i = 0; i < list.length; i++) {
    const entity = list[i]
    if (entity.dead) continue
    stateFor(entity).lastDistance = entity.position.distanceTo(player.position)
  }
}

function onTick(dt: number): void {
  const safeDt = clamp(finite(dt), 0, 0.1)
  accumulator += safeDt
  const stepDt = 1 / ENEMY_PHYSICS_V4_CONFIG.hz
  const maxAccumulated = stepDt * ENEMY_PHYSICS_V4_CONFIG.maxCatchUpSteps
  accumulator = Math.min(accumulator, maxAccumulated)

  let steps = 0
  while (accumulator >= stepDt && steps < ENEMY_PHYSICS_V4_CONFIG.maxCatchUpSteps) {
    step(stepDt)
    accumulator -= stepDt
    steps++
  }
}

export function addEnemyImpulse(entity: Entity, x: number, z: number): void {
  if (entity.dead) return
  const state = stateFor(entity)
  const scale = 1 - state.knockbackResistance
  state.impulseX = clamp(state.impulseX + finite(x) * scale, -ENEMY_PHYSICS_V4_CONFIG.maxImpulse, ENEMY_PHYSICS_V4_CONFIG.maxImpulse)
  state.impulseZ = clamp(state.impulseZ + finite(z) * scale, -ENEMY_PHYSICS_V4_CONFIG.maxImpulse, ENEMY_PHYSICS_V4_CONFIG.maxImpulse)
}

export function addEnemyRadialImpulse(entity: Entity, origin: THREE.Vector3, strength: number): void {
  if (entity.dead) return
  radial.subVectors(entity.position, origin)
  radial.y = 0
  const distance = radial.length()
  if (distance < 0.0001) {
    radial.set(deterministicSign(entity), 0, 0)
  } else {
    radial.multiplyScalar(1 / distance)
  }
  const falloff = clamp01(1 - distance / 8)
  const force = finite(strength) * falloff
  addEnemyImpulse(entity, radial.x * force, radial.z * force)
}

export function setEnemyKnockback(entity: Entity, direction: THREE.Vector3, force: number): void {
  const magnitude = Math.hypot(direction.x, direction.z)
  if (magnitude < 0.0001) return
  addEnemyImpulse(entity, (direction.x / magnitude) * force, (direction.z / magnitude) * force)
}

export function setEnemyStagger(entity: Entity, duration: number): void {
  entity.stagger = Math.max(entity.stagger ?? 0, clamp(finite(duration), 0, 3))
  const state = stateFor(entity)
  state.recovery = Math.min(1, state.recovery + 0.25)
}

export function getEnemyPhysicsState(entity: Entity): Readonly<PhysicsState> {
  return stateFor(entity)
}

export function getEnemyPhysicsRecovery(entity: Entity): number {
  return clamp01(stateFor(entity).recovery)
}

export function enemyPhysicsDistance(entity: Entity): number {
  return Math.max(0, finite(stateFor(entity).lastDistance))
}

export function startEnemyPhysicsV4(): Stop {
  if (running || typeof window === 'undefined') return stopEnemyPhysicsV4
  running = true
  accumulator = 0
  simulationTime = 0
  unsubscribe = onSimulationTick(onTick)
  return stopEnemyPhysicsV4
}

export function stopEnemyPhysicsV4(): void {
  if (!running) return
  running = false
  unsubscribe?.()
  unsubscribe = undefined
  accumulator = 0
}

export function resetEnemyPhysicsV4(): void {
  const wasRunning = running
  stopEnemyPhysicsV4()
  accumulator = 0
  simulationTime = 0
  if (wasRunning) startEnemyPhysicsV4()
}
