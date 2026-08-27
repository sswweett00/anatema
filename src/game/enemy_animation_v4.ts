import * as THREE from 'three'
import { enemies, gameState, getPlayer, type Entity } from '../ecs/world'
import { getEliteAffixes } from './advanced_mechanics_v3'
import { onSimulationTick } from './simulation_clock'
import { angleDelta, budgetForDistance, clamp, clamp01, finite, layeredNoise, Spring1D, yawFromVelocity } from './animation_math_v4'

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
  lastAttack: number
}

const states = new WeakMap<Entity, EnemyAnimStateData>()
const snapshots = new WeakMap<Entity, EnemyAnimationSnapshot>()
let running = false
let unsubscribe: Stop | undefined
let time = 0
const playerScratch = new THREE.Vector3()

function makeState(entity: Entity): EnemyAnimStateData {
  const seed = ((entity.enemyKind ?? 0) + 1) * 13.731 + (entity.phase ?? 0) * 7.17
  return {
    state: 'spawn',
    previous: 'spawn',
    age: 0,
    seed,
    speed: new Spring1D(),
    yaw: new Spring1D(),
    leanX: new Spring1D(),
    leanZ: new Spring1D(),
    bob: new Spring1D(),
    breath: new Spring1D(),
    attack: new Spring1D(),
    attackProgress: new Spring1D(),
    recoil: new Spring1D(),
    stagger: new Spring1D(),
    frozen: new Spring1D(),
    burning: new Spring1D(),
    elite: new Spring1D(),
    boss: new Spring1D(),
    death: new Spring1D(),
    spawn: new Spring1D(1),
    hitFlash: new Spring1D(),
    hover: new Spring1D(),
    squash: new Spring1D(1),
    stretch: new Spring1D(1),
    turn: new Spring1D(),
    secondary: new Spring1D(),
    aura: new Spring1D(),
    trail: new Spring1D(),
    phase: seed,
    lastHealth: finite(entity.health),
    lastAttack: finite(entity.attackCooldown ?? 0),
  }
}

function stateFor(entity: Entity): EnemyAnimStateData {
  let current = states.get(entity)
  if (!current) {
    current = makeState(entity)
    states.set(entity, current)
  }
  return current
}

function getPlayerPosition(): THREE.Vector3 {
  const player = getPlayer()
  if (!player) return playerScratch.set(0, 0, 0)
  return playerScratch.copy(player.position)
}

function isBoss(entity: Entity): boolean {
  return entity.maxHealth >= 1000 || (entity.scale ?? 1) >= 2.5
}

function isElite(entity: Entity): boolean {
  return isBoss(entity) || getEliteAffixes(entity).length > 0 || (entity.scale ?? 1) >= 1.18
}

function archetypeProfile(entity: Entity): { frequency: number; amplitude: number; hover: number; lean: number; squash: number } {
  switch (entity.enemyKind ?? 0) {
    case 0:
      return { frequency: 6.8, amplitude: 0.055, hover: 0, lean: 1.15, squash: 0.08 }
    case 1:
      return { frequency: 4.2, amplitude: 0.035, hover: 0.01, lean: 0.8, squash: 0.03 }
    case 2:
      return { frequency: 3.8, amplitude: 0.075, hover: 0.07, lean: 0.38, squash: 0.16 }
    default:
      return { frequency: 3.1, amplitude: 0.045, hover: 0.12, lean: 0.65, squash: 0.06 }
  }
}

function classify(entity: Entity, data: EnemyAnimStateData): EnemyAnimState {
  if (entity.dead || finite(entity.health) <= 0) return 'dead'
  if (isBoss(entity)) return 'boss'
  const affixes = getEliteAffixes(entity)
  if ((entity.slow ?? 0) > 0.05 && affixes.includes('frostbound')) return 'frozen'
  if ((entity.hitFlash ?? 0) > 0.22 && finite(entity.lastDmg) > 0) return 'recoil'
  if ((entity.stagger ?? 0) > 0.05) return 'stagger'
  if (affixes.length > 0) return 'elite'
  const velocitySpeed = Math.hypot(entity.velocity.x, entity.velocity.z)
  if (velocitySpeed < 0.15) return 'idle'
  const player = getPlayerPosition()
  const yaw = yawFromVelocity(entity.velocity, data.yaw.value)
  const targetYaw = Math.atan2(player.x - entity.position.x, player.z - entity.position.z)
  const turning = Math.abs(angleDelta(yaw, targetYaw))
  if (turning > 0.8 && velocitySpeed > 1.1) return 'flank'
  if ((entity.attackCooldown ?? 0) < data.lastAttack - 0.001) return 'attack'
  return 'approach'
}

function stateDuration(state: EnemyAnimState): number {
  switch (state) {
    case 'spawn': return 0.7
    case 'idle': return 2.5
    case 'approach': return 0.6
    case 'flank': return 0.5
    case 'attack': return 0.42
    case 'recoil': return 0.24
    case 'stagger': return 0.62
    case 'frozen': return 0.9
    case 'burning': return 0.5
    case 'elite': return 1.1
    case 'boss': return 1.8
    case 'dead': return 1.25
  }
}

function updateMotion(entity: Entity, data: EnemyAnimStateData, dt: number): void {
  const player = getPlayer()
  const profile = archetypeProfile(entity)
  const distance = player ? entity.position.distanceTo(player.position) : 100
  const pressure = clamp01(enemies.entities.length / 220)
  const budget = budgetForDistance(distance, pressure, 1)
  const speed = Math.hypot(entity.velocity.x, entity.velocity.z)
  const yaw = yawFromVelocity(entity.velocity, data.yaw.value)
  data.speed.update(speed, 18, 0.9, dt)
  data.yaw.update(yaw, 15, 0.9, dt)
  data.leanX.update(clamp(entity.velocity.z * profile.lean * 0.018, -0.2, 0.2), 17, 0.86, dt)
  data.leanZ.update(clamp(-entity.velocity.x * profile.lean * 0.018, -0.18, 0.18), 17, 0.86, dt)

  const gait = time * profile.frequency + data.phase
  const locomotion = clamp01(speed / 6.5)
  const bob = Math.sin(gait) * profile.amplitude * locomotion
  data.bob.update(bob, 17, 0.88, dt)
  data.breath.update(0.5 + 0.5 * Math.sin(time * 1.65 + data.phase), 8, 0.82, dt)
  data.hover.update(profile.hover + Math.sin(time * 2.4 + data.phase) * profile.hover * 0.55, 7, 0.82, dt)
  data.turn.update(angleDelta(data.turn.value, yaw), 13, 0.9, dt)
  data.secondary.update(layeredNoise(time * 0.65, data.seed, [1.1, 2.4, 4.8], [0.7, 0.23, 0.07]), 9, 0.84, dt)
  data.trail.update(budget.allowTrails ? clamp01(speed / 9) : 0, 12, 0.8, dt)

  const previousHealth = data.lastHealth
  const health = finite(entity.health)
  const damageTaken = Math.max(0, previousHealth - health)
  if (damageTaken > 0.001) {
    data.recoil.velocity += clamp(damageTaken / Math.max(1, entity.maxHealth), 0, 1) * 4.5
  }
  data.lastHealth = health
  data.lastAttack = finite(entity.attackCooldown ?? 0)
  if (!budget.allowSecondary) data.secondary.update(0, 10, 0.82, dt)
}

function updateStatePose(entity: Entity, data: EnemyAnimStateData, dt: number): void {
  const normalized = clamp01(data.age / stateDuration(data.state))
  const profile = archetypeProfile(entity)
  const elite = isElite(entity)
  const boss = isBoss(entity)
  const hit = clamp01(finite(entity.hitFlash))
  const slow = clamp01((entity.slow ?? 0) / 2)
  const stagger = clamp01((entity.stagger ?? 0) / 0.6)
  data.spawn.update(data.state === 'spawn' ? 1 - normalized : 0, 16, 0.82, dt)
  data.attack.update(data.state === 'attack' ? Math.sin(normalized * Math.PI) : 0, 24, 0.82, dt)
  data.attackProgress.update(data.state === 'attack' ? normalized : 0, 20, 0.84, dt)
  data.recoil.update(data.state === 'recoil' ? clamp01(hit + 0.25) : 0, 34, 0.74, dt)
  data.stagger.update(stagger, 20, 0.84, dt)
  data.frozen.update(slow, 12, 0.82, dt)
  data.burning.update(affixBurnSignal(entity), 11, 0.82, dt)
  data.elite.update(elite ? 1 : 0, 9, 0.85, dt)
  data.boss.update(boss ? 1 : 0, 8, 0.84, dt)
  data.death.update(data.state === 'dead' ? normalized : 0, 8, 0.86, dt)
  data.hitFlash.update(hit, 38, 0.7, dt)
  const gaitPulse = Math.sin(time * (3 + profile.frequency * 0.24) + data.seed)
  const squashTarget = clamp(1 + gaitPulse * profile.squash * clamp01(data.speed.value / 4) - data.recoil.value * 0.045 + data.stagger.value * 0.06, 0.78, 1.18)
  data.squash.update(squashTarget, 24, 0.82, dt)
  data.stretch.update(clamp(1 / Math.max(0.82, data.squash.value), 0.86, 1.22), 24, 0.82, dt)
  data.aura.update(elite ? 0.65 + Math.sin(time * 2.7 + data.seed) * 0.15 : 0, 9, 0.8, dt)
  if (data.state === 'stagger') data.leanX.update(-0.14 * stagger, 12, 0.85, dt)
}

function affixBurnSignal(entity: Entity): number {
  const affixes = getEliteAffixes(entity)
  if (affixes.includes('venomous')) return 0.72
  if (affixes.includes('volatile')) return 0.55
  if (affixes.includes('berserker')) return 0.34
  return 0
}

function buildSnapshot(entity: Entity, data: EnemyAnimStateData): EnemyAnimationSnapshot {
  const profile = archetypeProfile(entity)
  return {
    state: data.state,
    age: data.age,
    normalizedTime: clamp01(data.age / stateDuration(data.state)),
    locomotion: clamp01(data.speed.value / 6.5),
    speed: data.speed.value,
    yaw: data.yaw.value,
    leanX: data.leanX.value,
    leanZ: data.leanZ.value,
    bob: data.bob.value,
    breathing: data.breath.value,
    legPhase: time * profile.frequency + data.phase,
    legAmplitude: profile.amplitude,
    attackWeight: data.attack.value,
    attackProgress: data.attackProgress.value,
    recoilWeight: data.recoil.value,
    staggerWeight: data.stagger.value,
    freezeWeight: data.frozen.value,
    burnWeight: data.burning.value,
    eliteWeight: data.elite.value,
    bossWeight: data.boss.value,
    deathWeight: data.death.value,
    spawnWeight: data.spawn.value,
    hitFlash: data.hitFlash.value,
    hover: data.hover.value,
    squash: data.squash.value,
    stretch: data.stretch.value,
    turn: data.turn.value,
    secondary: data.secondary.value,
    aura: data.aura.value,
    trail: data.trail.value,
  }
}

function tick(dt: number): void {
  time += dt
  for (const entity of enemies.entities) {
    const data = stateFor(entity)
    const next = classify(entity, data)
    if (next !== data.state) {
      data.previous = data.state
      data.state = next
      data.age = 0
    } else {
      data.age += dt
    }
    updateMotion(entity, data, dt)
    updateStatePose(entity, data, dt)
    const current = snapshots.get(entity)
    const nextSnapshot = buildSnapshot(entity, data)
    if (current) Object.assign(current, nextSnapshot)
    else snapshots.set(entity, nextSnapshot)
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
  if (wasRunning) startEnemyAnimationV4()
}

export function getEnemyAnimationV4(entity: Entity): Readonly<EnemyAnimationSnapshot> {
  const data = stateFor(entity)
  let current = snapshots.get(entity)
  if (!current) {
    current = buildSnapshot(entity, data)
    snapshots.set(entity, current)
  }
  return current
}

export function enemyAnimationWeight(entity: Entity): number {
  const data = stateFor(entity)
  return clamp01(data.speed.value / 8 + data.attack.value * 0.5 + data.elite.value * 0.15)
}

export function enemyAnimationYaw(entity: Entity): number {
  return stateFor(entity).yaw.value
}

export function enemyAnimationScale(entity: Entity): THREE.Vector3 {
  const data = stateFor(entity)
  return new THREE.Vector3(data.squash.value, data.stretch.value, data.squash.value)
}

export function enemyAnimationOffset(entity: Entity): THREE.Vector3 {
  const data = stateFor(entity)
  return new THREE.Vector3(data.leanZ.value * 0.15, data.bob.value + data.hover.value, data.leanX.value * 0.15)
}
