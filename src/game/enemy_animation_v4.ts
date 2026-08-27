import * as THREE from 'three'
import { enemies, gameState, type Entity } from '../ecs/world'
import { getEliteAffixes } from './advanced_mechanics_v3'
import { onSimulationTick } from './simulation_clock'
import { angleDelta, budgetForDistance, clamp, clamp01, damp, finite, layeredNoise, noiseSigned, Spring1D, Spring3D, yawFromVelocity } from './animation_math_v4'

type Stop = () => void
export type EnemyAnimState = 'spawn' | 'idle' | 'approach' | 'flank' | 'attack' | 'recoil' | 'stagger' | 'frozen' | 'burning' | 'elite' | 'boss' | 'dead'

export interface EnemyAnimationSnapshot {
  state: EnemyAnimState
  age: number
  normalizedTime: number
  locomotion: number
  speed: number
  yaw: number
  leanX: number
  leanZ: number
  bob: number
  breathing: number
  legPhase: number
  legAmplitude: number
  attackWeight: number
  attackProgress: number
  recoilWeight: number
  staggerWeight: number
  freezeWeight: number
  burnWeight: number
  eliteWeight: number
  bossWeight: number
  deathWeight: number
  spawnWeight: number
  hitFlash: number
  hover: number
  squash: number
  stretch: number
  turn: number
  secondary: number
  aura: number
  trail: number
}

interface EnemyAnimStateData {
  state: EnemyAnimState
  previous: EnemyAnimState
  age: number
  seed: number
  speed: Spring1D
  yaw: Spring1D
  leanX: Spring1D
  leanZ: Spring1D
  bob: Spring1D
  breath: Spring1D
  attack: Spring1D
  attackProgress: Spring1D
  recoil: Spring1D
  stagger: Spring1D
  frozen: Spring1D
  burning: Spring1D
  elite: Spring1D
  boss: Spring1D
  death: Spring1D
  spawn: Spring1D
  hitFlash: Spring1D
  hover: Spring1D
  squash: Spring1D
  stretch: Spring1D
  turn: Spring1D
  secondary: Spring1D
  aura: Spring1D
  trail: Spring1D
  phase: number
  lastHealth: number
  lastPosition: THREE.Vector3
  lastAttack: number
}

const states = new WeakMap<Entity, EnemyAnimStateData>()
const snapshots = new WeakMap<Entity, EnemyAnimationSnapshot>()
let running = false
let unsubscribe: Stop | undefined
let time = 0

function makeState(entity: Entity): EnemyAnimStateData {
  const seed = ((entity.enemyKind ?? 0) + 1) * 13.731 + (entity.phase ?? 0) * 7.17
  return {
    state: 'spawn', previous: 'spawn', age: 0, seed,
    speed: new Spring1D(), yaw: new Spring1D(), leanX: new Spring1D(), leanZ: new Spring1D(),
    bob: new Spring1D(), breath: new Spring1D(), attack: new Spring1D(), attackProgress: new Spring1D(),
    recoil: new Spring1D(), stagger: new Spring1D(), frozen: new Spring1D(), burning: new Spring1D(),
    elite: new Spring1D(), boss: new Spring1D(), death: new Spring1D(), spawn: new Spring1D(1),
    hitFlash: new Spring1D(), hover: new Spring1D(), squash: new Spring1D(1), stretch: new Spring1D(1),
    turn: new Spring1D(), secondary: new Spring1D(), aura: new Spring1D(), trail: new Spring1D(),
    phase: seed, lastHealth: finite(entity.health), lastPosition: entity.position.clone(), lastAttack: entity.attackCooldown ?? 0,
  }
}

function stateFor(entity: Entity): EnemyAnimStateData {
  let value = states.get(entity)
  if (!value) {
    value = makeState(entity)
    states.set(entity, value)
  }
  return value
}

function isBoss(entity: Entity): boolean {
  return entity.maxHealth >= 1000 || (entity.scale ?? 1) >= 2.5
}

function isElite(entity: Entity): boolean {
  return isBoss(entity) || getEliteAffixes(entity).length > 0 || (entity.scale ?? 1) >= 1.18
}

function distanceToPlayer(entity: Entity): number {
  const player = entity
  const target = getPlayerPosition()
  return target.distanceTo(player.position)
}

const playerPositionScratch = new THREE.Vector3()
function getPlayerPosition(): THREE.Vector3 {
  const player = enemies.entities.length > -1 ? requirePlayerPosition() : playerPositionScratch
  return player
}

function requirePlayerPosition(): THREE.Vector3 {
  const module = requireWorldPlayer()
  playerPositionScratch.copy(module)
  return playerPositionScratch
}

function requireWorldPlayer(): THREE.Vector3 {
  const anyEnemy = enemies.entities[0]
  if (anyEnemy) {
    const player = (globalThis as { __ANATEMA_PLAYER_POSITION__?: THREE.Vector3 }).__ANATEMA_PLAYER_POSITION__
    if (player) return player
  }
  return playerPositionScratch.set(0, 0, 0)
}

function classify(entity: Entity, s: EnemyAnimStateData): EnemyAnimState {
  if (entity.dead || entity.health <= 0) return 'dead'
  if (isBoss(entity)) return 'boss'
  const affixes = getEliteAffixes(entity)
  if ((entity.slow ?? 0) > 0.05 && affixes.includes('frostbound')) return 'frozen'
  if ((entity.hitFlash ?? 0) > 0.4 && finite(entity.lastDmg) > 0) return 'recoil'
  if ((entity.stagger ?? 0) > 0.05) return 'stagger'
  if (affixes.includes('volatile') || affixes.includes('venomous') || affixes.includes('berserker')) return 'elite'
  const speed = Math.hypot(entity.velocity.x, entity.velocity.z)
  if (speed < 0.15) return 'idle'
  const player = getPlayerPosition()
  const toPlayer = player.clone().sub(entity.position)
  const yaw = yawFromVelocity(entity.velocity, s.yaw.value)
  const targetYaw = Math.atan2(toPlayer.x, toPlayer.z)
  const turn = Math.abs(angleDelta(yaw, targetYaw))
  if (turn > 0.72 && speed > 1.2) return 'flank'
  if ((entity.attackCooldown ?? 0) < s.lastAttack - 0.001) return 'attack'
  return 'approach'
}

function archetypeProfile(entity: Entity): { frequency: number; amplitude: number; hover: number; lean: number; squash: number } {
  switch (entity.enemyKind ?? 0) {
    case 0: return { frequency: 6.8, amplitude: 0.16, hover: 0, lean: 0.18, squash: 0.08 }
    case 1: return { frequency: 4.2, amplitude: 0.11, hover: 0.01, lean: 0.12, squash: 0.035 }
    case 2: return { frequency: 3.8, amplitude: 0.22, hover: 0.07, lean: 0.06, squash: 0.18 }
    default: return { frequency: 3.1, amplitude: 0.09, hover: 0.12, lean: 0.1, squash: 0.06 }
  }
}

function updateCommon(entity: Entity, s: EnemyAnimStateData, dt: number): void {
  const distance = distanceToPlayer(entity)
  const pressure = clamp01(enemies.entities.length / 220)
  const budget = budgetForDistance(distance, pressure, 1)
  const profile = archetypeProfile(entity)
  const velocity = entity.velocity
  const speed = Math.hypot(velocity.x, velocity.z)
  const yaw = yawFromVelocity(velocity, s.yaw.value)
  s.speed.update(speed, 18, 0.9, dt)
  s.yaw.update(yaw, 16, 0.88, dt)
  const forwardLean = clamp(velocity.z * profile.lean * 0.02, -0.16, 0.16)
  const lateralLean = clamp(-velocity.x * profile.lean * 0.02, -0.14, 0.14)
  s.leanX.update(forwardLean, 16, 0.86, dt)
  s.leanZ.update(lateralLean, 16, 0.86, dt)
  const gait = time * profile.frequency + s.phase
  const gaitSin = Math.sin(gait)
  const locomotion = clamp01(speed / 6.5)
  s.bob.update(gaitSin * profile.amplitude * locomotion, 16, 0.88, dt)
  s.breath.update(0.5 + 0.5 * Math.sin(time * 1.7 + s.phase), 8, 0.8, dt)
  s.hover.update(profile.hover + Math.sin(time * 2.4 + s.phase) * profile.hover * 0.6, 7, 0.8, dt)
  s.turn.update(angleDelta(s.turn.value, yaw), 12, 0.9, dt)
  s.secondary.update(layeredNoise(time * 0.7, s.seed, [1, 2.2, 4.6], [1, 0.35, 0.12]), 10, 0.82, dt)
  s.trail.update(budget.allowTrails ? clamp01(speed / 10) : 0, 12, 0.82, dt)
  const health = finite(entity.health)
  const tookDamage = Math.max(0, s.lastHealth - health)
  if (tookDamage > 0.001) s.recoil.velocity += Math.min(1, tookDamage / Math.max(1, entity.maxHealth)) * 5
  s.lastHealth = health
  s.lastAttack = finite(entity.attackCooldown ?? 0)
  if (!budget.allowSecondary) s.secondary.update(0, 12, 0.8, dt)
}

function updateStateAnimation(entity: Entity, s: EnemyAnimStateData, dt: number): void {
  const profile = archetypeProfile(entity)
  const normalized = clamp01(s.age / stateDuration(s.state))
  s.spawn.update(s.state === 'spawn' ? 1 - normalized : 0, 14, 0.82, dt)
  s.attack.update(s.state === 'attack' ? Math.sin(normalized * Math.PI) : 0, 22, 0.82, dt)
  s.attackProgress.update(s.state === 'attack' ? normalized : 0, 18, 0.85, dt)
  s.recoil.update(s.state === 'recoil' ? Math.min(1, (finite(entity.hitFlash) + 0.35)) : 0, 30, 0.78, dt)
  s.stagger.update(s.state === 'stagger' ? clamp01((entity.stagger ?? 0) / 0.6) : 0, 18, 0.85, dt)
  s.frozen.update(s.state === 'frozen' ? clamp01((entity.slow ?? 0) / 2) : 0, 12, 0.82, dt)
  const burningSignal = getEliteAffixes(entity).includes('venomous') ? 0.45 : 0
  s.burning.update(burningSignal + (entity.hitFlash ?? 0) * 0.1, 10, 0.82, dt)
  s.elite.update(isElite(entity) ? 1 : 0, 9, 0.85, dt)
  s.boss.update(isBoss(entity) ? 1 : 0, 8, 0.82, dt)
  s.death.update(s.state === 'dead' ? normalized : 0, 8, 0.86, dt)
  const pulse = Math.sin(time * (3 + profile.frequency * 0.3) + s.seed)
  const hit = clamp01(finite(entity.hitFlash))
  s.hitFlash.update(hit, 34, 0.72, dt)
  const squash = 1 + pulse * profile.squash * clamp01(s.speed.value / 4) - s.recoil.value * 0.035 + s.stagger.value * 0.05
  s.squash.update(clamp(squash, 0.82, 1.14), 22, 0.82, dt)
  const stretch = 1 / Math.max(0.82, s.squash.value)
  s.stretch.update(clamp(stretch, 0.87, 1.2), 22, 0.82, dt)
}

function stateDuration(state: EnemyAnimState): number {
  switch (state) {
    case 'spawn': return 0.65
    case 'idle': return 2.5
    case 'approach': return 0.6
    case 'flank': return 0.48
    case 'attack': return 0.42
    case 'recoil': return 0.22
    case 'stagger': return 0.6
    case 'frozen': return 0.8
    case 'burning': return 0.45
    case 'elite': return 1.2
    case 'boss': return 1.8
    case 'dead': return 1.15
  }
}

function buildSnapshot(entity: Entity, s: EnemyAnimStateData): EnemyAnimationSnapshot {
  return {
    state: s.state,
    age: s.age,
    normalizedTime: clamp01(s.age / stateDuration(s.state)),
    locomotion: clamp01(s.speed.value / 6.5),
    speed: s.speed.value,
    yaw: s.yaw.value,
    leanX: s.leanX.value,
    leanZ: s.leanZ.value,
    bob: s.bob.value,
    breathing: s.breath.value,
    legPhase: time * archetypeProfile(entity).frequency + s.phase,
    legAmplitude: archetypeProfile(entity).amplitude,
    attackWeight: s.attack.value,
    attackProgress: s.attackProgress.value,
    recoilWeight: s.recoil.value,
    staggerWeight: s.stagger.value,
    freezeWeight: s.frozen.value,
    burnWeight: s.burning.value,
    eliteWeight: s.elite.value,
    bossWeight: s.boss.value,
    deathWeight: s.death.value,
    spawnWeight: s.spawn.value,
    hitFlash: s.hitFlash.value,
    hover: s.hover.value,
    squash: s.squash.value,
    stretch: s.stretch.value,
    turn: s.turn.value,
    secondary: s.secondary.value,
    aura: s.aura.value,
    trail: s.trail.value,
  }
}

function tick(dt: number): void {
  time += dt
  for (const entity of enemies.entities) {
    const s = stateFor(entity)
    const next = classify(entity, s)
    if (next !== s.state) {
      s.previous = s.state
      s.state = next
      s.age = 0
    } else {
      s.age += dt
    }
    updateCommon(entity, s, dt)
    updateStateAnimation(entity, s, dt)
    const snapshot = snapshots.get(entity) ?? buildSnapshot(entity, s)
    Object.assign(snapshot, buildSnapshot(entity, s))
    snapshots.set(entity, snapshot)
  }
}

export function startEnemyAnimationV4(): Stop {
  if (running || typeof window === 'undefined') return stopEnemyAnimationV4
  running = true
  time = 0
  unsubscribe = onSimulationTick(tick)
  return stopEnemyAnimationV4
}

export function stopEnemyAnimationV4(): void {
  if (!running) return
  running = false
  unsubscribe?.()
  unsubscribe = undefined
}

export function resetEnemyAnimationV4(): void {
  const wasRunning = running
  stopEnemyAnimationV4()
  time = 0
  states.clear?.()
  if (wasRunning) startEnemyAnimationV4()
}

export function getEnemyAnimationV4(entity: Entity): Readonly<EnemyAnimationSnapshot> {
  const s = stateFor(entity)
  let snapshot = snapshots.get(entity)
  if (!snapshot) {
    snapshot = buildSnapshot(entity, s)
    snapshots.set(entity, snapshot)
  }
  return snapshot
}

export function enemyAnimationWeight(entity: Entity): number {
  const s = stateFor(entity)
  return clamp01(s.speed.value / 8 + s.attack.value * 0.5 + s.elite.value * 0.15)
}

export function enemyAnimationYaw(entity: Entity): number {
  return stateFor(entity).yaw.value
}
