import * as THREE from 'three'
import { abilities } from './abilities'
import { gameState, getPlayer, type Entity } from '../ecs/world'
import { onSimulationTick } from './simulation_clock'
import { angleDelta, clamp, clamp01, damp, finite, Spring1D, Spring3D, SpringRotation, triangleWave, layeredNoise, signedPulse, yawFromVelocity } from './animation_math_v4'

type Stop = () => void
export type PlayerAnimState = 'idle' | 'move' | 'dash' | 'attack' | 'hurt' | 'stagger' | 'dead' | 'levelup' | 'casting' | 'land'

export interface PlayerAnimationSnapshot {
  state: PlayerAnimState
  normalizedTime: number
  locomotionWeight: number
  speed: number
  stride: number
  yaw: number
  leanX: number
  leanZ: number
  bodyBob: number
  breathing: number
  armSwing: number
  legSwing: number
  footContactL: number
  footContactR: number
  dashWeight: number
  dashStretch: number
  attackWeight: number
  attackProgress: number
  hurtWeight: number
  staggerWeight: number
  deathWeight: number
  castWeight: number
  landingWeight: number
  lookYaw: number
  lookPitch: number
  shoulderYaw: number
  cloakSway: number
  cloakLift: number
  swordWindup: number
  swordFollowThrough: number
  secondaryMotion: number
  trailIntensity: number
  motionBlur: number
  silhouetteScale: number
  headTilt: number
  hipShift: number
  additiveX: number
  additiveY: number
  additiveZ: number
}

interface PlayerState {
  state: PlayerAnimState
  previous: PlayerAnimState
  stateAge: number
  normalizedTime: number
  speed: Spring1D
  yaw: Spring1D
  leanX: Spring1D
  leanZ: Spring1D
  bodyBob: Spring1D
  breathing: Spring1D
  armSwing: Spring1D
  legSwing: Spring1D
  footL: Spring1D
  footR: Spring1D
  dash: Spring1D
  attack: Spring1D
  hurt: Spring1D
  stagger: Spring1D
  death: Spring1D
  cast: Spring1D
  landing: Spring1D
  lookYaw: Spring1D
  lookPitch: Spring1D
  shoulderYaw: Spring1D
  cloakSway: Spring1D
  cloakLift: Spring1D
  swordWindup: Spring1D
  swordFollow: Spring1D
  secondary: Spring1D
  trail: Spring1D
  blur: Spring1D
  silhouette: Spring1D
  headTilt: Spring1D
  hipShift: Spring1D
  additive: Spring3D
  cloakVelocity: THREE.Vector3
  lastPosition: THREE.Vector3
  lastYaw: number
  time: number
  footClock: number
  attackSeed: number
  dashSeed: number
  hurtSeed: number
  deathSeed: number
}

const state: PlayerState = {
  state: 'idle',
  previous: 'idle',
  stateAge: 0,
  normalizedTime: 0,
  speed: new Spring1D(),
  yaw: new Spring1D(),
  leanX: new Spring1D(),
  leanZ: new Spring1D(),
  bodyBob: new Spring1D(),
  breathing: new Spring1D(),
  armSwing: new Spring1D(),
  legSwing: new Spring1D(),
  footL: new Spring1D(),
  footR: new Spring1D(),
  dash: new Spring1D(),
  attack: new Spring1D(),
  hurt: new Spring1D(),
  stagger: new Spring1D(),
  death: new Spring1D(),
  cast: new Spring1D(),
  landing: new Spring1D(),
  lookYaw: new Spring1D(),
  lookPitch: new Spring1D(),
  shoulderYaw: new Spring1D(),
  cloakSway: new Spring1D(),
  cloakLift: new Spring1D(),
  swordWindup: new Spring1D(),
  swordFollow: new Spring1D(),
  secondary: new Spring1D(),
  trail: new Spring1D(),
  blur: new Spring1D(),
  silhouette: new Spring1D(1),
  headTilt: new Spring1D(),
  hipShift: new Spring1D(),
  additive: new Spring3D(),
  cloakVelocity: new THREE.Vector3(),
  lastPosition: new THREE.Vector3(),
  lastYaw: 0,
  time: 0,
  footClock: 0,
  attackSeed: 0.37,
  dashSeed: 1.91,
  hurtSeed: 4.13,
  deathSeed: 7.71,
}

const snapshot: PlayerAnimationSnapshot = {
  state: 'idle', normalizedTime: 0, locomotionWeight: 0, speed: 0, stride: 0, yaw: 0,
  leanX: 0, leanZ: 0, bodyBob: 0, breathing: 0, armSwing: 0, legSwing: 0,
  footContactL: 0, footContactR: 0, dashWeight: 0, dashStretch: 0, attackWeight: 0,
  attackProgress: 0, hurtWeight: 0, staggerWeight: 0, deathWeight: 0, castWeight: 0,
  landingWeight: 0, lookYaw: 0, lookPitch: 0, shoulderYaw: 0, cloakSway: 0, cloakLift: 0,
  swordWindup: 0, swordFollowThrough: 0, secondaryMotion: 0, trailIntensity: 0,
  motionBlur: 0, silhouetteScale: 1, headTilt: 0, hipShift: 0, additiveX: 0,
  additiveY: 0, additiveZ: 0,
}

let running = false
let unsubscribe: Stop | undefined

function classify(player: Entity): PlayerAnimState {
  if (gameState.phase === 'dead' || player.health <= 0) return 'dead'
  if ((player.stagger ?? 0) > 0.001) return 'stagger'
  if ((gameState.levelFlash ?? 0) > 0.2 && gameState.phase === 'playing') return 'levelup'
  if ((player.dashTime ?? 0) > 0.001) return 'dash'
  if (gameState.slashAnim > 0.001) return 'attack'
  if ((player.invuln ?? 0) > 0 && (gameState.damageFlash ?? 0) > 0.15) return 'hurt'
  if (gameState.phase === 'levelup') return 'casting'
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  if (speed > 0.55) return 'move'
  return 'idle'
}

function transition(next: PlayerAnimState): void {
  if (state.state === next) return
  state.previous = state.state
  state.state = next
  state.stateAge = 0
  state.normalizedTime = 0
  if (next === 'attack') state.attackSeed += 0.73
  if (next === 'dash') state.dashSeed += 1.17
  if (next === 'hurt') state.hurtSeed += 0.91
  if (next === 'dead') state.deathSeed += 1.43
}

function updateState(player: Entity, dt: number, time: number): void {
  state.time = time
  state.stateAge += dt
  state.normalizedTime = clamp01(state.stateAge / stateDuration(state.state))
  const target = classify(player)
  transition(target)
}

function stateDuration(anim: PlayerAnimState): number {
  switch (anim) {
    case 'idle': return 4
    case 'move': return 0.65
    case 'dash': return 0.16
    case 'attack': return 0.34
    case 'hurt': return 0.22
    case 'stagger': return 0.58
    case 'dead': return 1.7
    case 'levelup': return 1.8
    case 'casting': return 1.15
    case 'land': return 0.35
  }
}

function locomotion(player: Entity, dt: number, time: number): void {
  const velocity = player.velocity
  const speed = Math.hypot(velocity.x, velocity.z)
  const stride = clamp01(speed / Math.max(1, finite(player.speed, 6)))
  const yaw = yawFromVelocity(velocity, state.yaw.value)
  state.speed.update(speed, 28, 0.86, dt)
  state.yaw.update(yaw, 22, 0.9, dt)
  const accelerationX = (velocity.x - (state.lastPosition.x - player.position.x) / Math.max(dt, 1e-4))
  const accelerationZ = (velocity.z - (state.lastPosition.z - player.position.z) / Math.max(dt, 1e-4))
  const localLeanX = clamp(velocity.z * 0.017, -0.19, 0.19)
  const localLeanZ = clamp(-velocity.x * 0.017, -0.16, 0.16)
  state.leanX.update(localLeanX, 18, 0.85, dt)
  state.leanZ.update(localLeanZ, 18, 0.85, dt)
  state.footClock += dt * (4 + state.speed.value * 2.1)
  const gait = state.footClock
  const leftContact = Math.pow(clamp01((Math.sin(gait) + 1) * 0.5), 8)
  const rightContact = Math.pow(clamp01((Math.sin(gait + Math.PI) + 1) * 0.5), 8)
  state.footL.update(leftContact * stride, 45, 0.95, dt)
  state.footR.update(rightContact * stride, 45, 0.95, dt)
  const bounce = stride * (0.018 + Math.max(0, Math.sin(gait * 2)) * 0.026)
  const idleBreath = 0.006 + (1 - stride) * 0.008
  const breath = Math.sin(time * 2.15 + state.attackSeed) * idleBreath
  state.bodyBob.update(bounce + breath, 24, 0.9, dt)
  const armTarget = Math.sin(gait) * stride * (0.24 + abilities.swift * 0.004)
  const legTarget = Math.sin(gait) * stride * 0.34
  state.armSwing.update(armTarget, 20, 0.82, dt)
  state.legSwing.update(legTarget, 25, 0.9, dt)
  const lateral = clamp(velocity.x * 0.014, -0.12, 0.12)
  const forward = clamp(velocity.z * 0.014, -0.12, 0.12)
  state.hipShift.update(lateral, 16, 0.88, dt)
  state.headTilt.update(-lateral * 0.7 + forward * 0.35, 18, 0.9, dt)
  state.secondary.update(layeredNoise(time * 0.6, state.attackSeed, [1.3, 2.7, 5.1], [0.8, 0.3, 0.1]), 13, 0.8, dt)
  const accelMagnitude = Math.hypot(accelerationX, accelerationZ)
  state.blur.update(clamp01(accelMagnitude / 14) * stride, 18, 0.9, dt)
  state.lastPosition.copy(player.position)
}

function dashAnimation(player: Entity, dt: number, time: number): void {
  const raw = clamp((player.dashTime ?? 0) / 0.16, 0, 1)
  const active = 1 - raw
  state.dash.update(active, 45, 0.88, dt)
  const burst = Math.sin(active * Math.PI)
  state.additive.value.x = damp(state.additive.value.x, 0, 24, dt)
  state.additive.value.y = damp(state.additive.value.y, burst * 0.035, 22, dt)
  state.additive.value.z = damp(state.additive.value.z, -burst * 0.1, 20, dt)
  state.silhouette.update(1 + burst * 0.13, 35, 0.82, dt)
  state.trail.update(Math.min(1, burst * 1.25 + 0.2), 24, 0.8, dt)
  state.blur.update(Math.max(state.blur.value, burst * 0.8), 15, 0.78, dt)
  state.cloakLift.update(burst * 0.18, 14, 0.7, dt)
  state.cloakSway.update(signedPulse(time + state.dashSeed, 8.5) * burst * 0.12, 16, 0.75, dt)
}

function attackAnimation(dt: number, time: number): void {
  const progress = clamp01(1 - (gameState.slashAnim ?? 0) / 0.32)
  const attack = Math.sin(progress * Math.PI)
  state.attack.update(attack, 42, 0.86, dt)
  const windup = 1 - clamp01(progress / 0.35)
  const follow = clamp01((progress - 0.56) / 0.44)
  state.swordWindup.update(windup, 32, 0.8, dt)
  state.swordFollow.update(follow * (1 - follow * 0.25), 30, 0.82, dt)
  state.additive.value.z = damp(state.additive.value.z, -attack * 0.055, 26, dt)
  state.additive.value.x = damp(state.additive.value.x, Math.sin(progress * Math.PI * 2) * 0.028, 26, dt)
  state.shoulderYaw.update(Math.sin(progress * Math.PI) * 0.12, 24, 0.82, dt)
  state.leanX.update(state.leanX.value - attack * 0.08, 20, 0.85, dt)
  state.cloakSway.update(Math.sin(progress * Math.PI * 1.2 + time * 2) * 0.08 * attack, 12, 0.8, dt)
}

function hurtAnimation(dt: number, time: number): void {
  const intensity = clamp01((gameState.damageFlash ?? 0) * 1.8)
  const pulse = Math.sin(time * 48 + state.hurtSeed) * intensity
  state.hurt.update(intensity, 50, 0.78, dt)
  state.additive.value.x = damp(state.additive.value.x, pulse * 0.025, 35, dt)
  state.additive.value.y = damp(state.additive.value.y, Math.abs(pulse) * 0.02, 35, dt)
  state.headTilt.update(-pulse * 0.13, 28, 0.78, dt)
  state.shoulderYaw.update(pulse * 0.16, 28, 0.78, dt)
  state.cloakSway.update(-pulse * 0.18, 18, 0.75, dt)
}

function staggerAnimation(dt: number, time: number): void {
  const remaining = clamp01((getPlayer()?.stagger ?? 0) / 0.58)
  const envelope = remaining * (1 - 0.35 * remaining)
  const recoil = signedPulse(time + state.hurtSeed, 4.5) * envelope
  state.stagger.update(envelope, 20, 0.88, dt)
  state.additive.value.x = damp(state.additive.value.x, recoil * 0.08, 15, dt)
  state.additive.value.z = damp(state.additive.value.z, -envelope * 0.04, 15, dt)
  state.leanZ.update(recoil * 0.3, 13, 0.85, dt)
  state.armSwing.update(recoil * 0.5, 14, 0.82, dt)
  state.cloakLift.update(envelope * 0.06, 10, 0.8, dt)
}

function deathAnimation(dt: number, time: number): void {
  const progress = clamp01(state.stateAge / 1.7)
  const ease = progress < 0.16 ? progress / 0.16 : 1
  const fall = clamp01((progress - 0.12) / 0.65)
  const settle = clamp01((progress - 0.7) / 0.3)
  state.death.update(progress, 10, 0.86, dt)
  state.silhouette.update(1 + ease * 0.05 - settle * 0.06, 12, 0.8, dt)
  state.additive.value.x = damp(state.additive.value.x, Math.sin(time * 10 + state.deathSeed) * 0.025 * (1 - settle), 8, dt)
  state.additive.value.y = damp(state.additive.value.y, 0.018 * (1 - fall) - 0.12 * fall, 9, dt)
  state.additive.value.z = damp(state.additive.value.z, -0.03 * fall, 9, dt)
  state.leanX.update(-0.35 * fall, 8, 0.8, dt)
  state.leanZ.update(0.22 * Math.sin(fall * Math.PI) * (1 - settle), 8, 0.82, dt)
  state.armSwing.update((0.65 + Math.sin(progress * 9) * 0.08) * fall, 7, 0.8, dt)
  state.cloakLift.update(-0.22 * fall + 0.04 * Math.sin(progress * 13), 8, 0.75, dt)
  state.trail.update((1 - settle) * 0.7, 8, 0.8, dt)
}

function castAnimation(dt: number, time: number): void {
  const progress = clamp01(state.stateAge / stateDuration(state.state))
  const charge = Math.sin(progress * Math.PI)
  state.cast.update(charge, 20, 0.85, dt)
  state.additive.value.y = damp(state.additive.value.y, charge * 0.035, 14, dt)
  state.shoulderYaw.update(Math.sin(time * 3.3) * charge * 0.15, 14, 0.82, dt)
  state.headTilt.update(Math.sin(time * 2.1) * charge * 0.06, 12, 0.84, dt)
  state.silhouette.update(1 + charge * 0.045, 15, 0.85, dt)
  state.cloakLift.update(charge * 0.1, 11, 0.8, dt)
}

function levelAnimation(dt: number): void {
  const progress = clamp01(state.stateAge / 1.8)
  const burst = Math.sin(progress * Math.PI)
  state.cast.update(burst, 18, 0.82, dt)
  state.silhouette.update(1 + burst * 0.08, 20, 0.85, dt)
  state.trail.update(burst * 0.35, 16, 0.82, dt)
  state.additive.value.y = damp(state.additive.value.y, burst * 0.045, 12, dt)
}

function assembleSnapshot(player: Entity): void {
  snapshot.state = state.state
  snapshot.normalizedTime = state.normalizedTime
  snapshot.speed = state.speed.value
  snapshot.stride = clamp01(snapshot.speed / Math.max(1, finite(player.speed, 6)))
  snapshot.locomotionWeight = snapshot.stride
  snapshot.yaw = state.yaw.value
  snapshot.leanX = state.leanX.value
  snapshot.leanZ = state.leanZ.value
  snapshot.bodyBob = state.bodyBob.value
  snapshot.breathing = state.breathing.value
  snapshot.armSwing = state.armSwing.value
  snapshot.legSwing = state.legSwing.value
  snapshot.footContactL = state.footL.value
  snapshot.footContactR = state.footR.value
  snapshot.dashWeight = state.dash.value
  snapshot.dashStretch = Math.max(0, state.silhouette.value - 1)
  snapshot.attackWeight = state.attack.value
  snapshot.attackProgress = gameState.slashAnim > 0 ? clamp01(1 - gameState.slashAnim / 0.32) : 0
  snapshot.hurtWeight = state.hurt.value
  snapshot.staggerWeight = state.stagger.value
  snapshot.deathWeight = state.death.value
  snapshot.castWeight = state.cast.value
  snapshot.landingWeight = state.landing.value
  snapshot.lookYaw = state.lookYaw.value
  snapshot.lookPitch = state.lookPitch.value
  snapshot.shoulderYaw = state.shoulderYaw.value
  snapshot.cloakSway = state.cloakSway.value
  snapshot.cloakLift = state.cloakLift.value
  snapshot.swordWindup = state.swordWindup.value
  snapshot.swordFollowThrough = state.swordFollow.value
  snapshot.secondaryMotion = state.secondary.value
  snapshot.trailIntensity = state.trail.value
  snapshot.motionBlur = state.blur.value
  snapshot.silhouetteScale = state.silhouette.value
  snapshot.headTilt = state.headTilt.value
  snapshot.hipShift = state.hipShift.value
  snapshot.additiveX = state.additive.value.x
  snapshot.additiveY = state.additive.value.y
  snapshot.additiveZ = state.additive.value.z
}

function tick(dt: number, time: number): void {
  const player = getPlayer()
  if (!player) return
  const safeDt = clamp(dt, 0.001, 0.033)
  updateState(player, safeDt, time)
  locomotion(player, safeDt, time)
  state.breathing.update(Math.sin(time * 2.1) * 0.5 + 0.5, 8, 0.82, safeDt)
  state.cloakSway.update(Math.sin(time * 1.4 + state.secondary.value * 2) * 0.06, 7, 0.8, safeDt)
  if (state.state === 'dash') dashAnimation(player, safeDt, time)
  if (state.state === 'attack') attackAnimation(safeDt, time)
  if (state.state === 'hurt') hurtAnimation(safeDt, time)
  if (state.state === 'stagger') staggerAnimation(safeDt, time)
  if (state.state === 'dead') deathAnimation(safeDt, time)
  if (state.state === 'casting') castAnimation(safeDt, time)
  if (state.state === 'levelup') levelAnimation(safeDt)
  if (state.state !== 'dash') state.trail.update(snapshot.trailIntensity * 0.2, 12, 0.85, safeDt)
  if (state.state !== 'dead') state.silhouette.update(1, 6, 0.9, safeDt)
  assembleSnapshot(player)
}

export function startPlayerAnimationV4(): Stop {
  if (running || typeof window === 'undefined') return stopPlayerAnimationV4
  running = true
  state.lastPosition.copy(getPlayer()?.position ?? new THREE.Vector3())
  unsubscribe = onSimulationTick(tick)
  return stopPlayerAnimationV4
}

export function stopPlayerAnimationV4(): void {
  if (!running) return
  running = false
  unsubscribe?.()
  unsubscribe = undefined
}

export function resetPlayerAnimationV4(): void {
  const wasRunning = running
  stopPlayerAnimationV4()
  state.state = 'idle'
  state.previous = 'idle'
  state.stateAge = 0
  state.normalizedTime = 0
  for (const spring of [state.speed, state.yaw, state.leanX, state.leanZ, state.bodyBob, state.breathing, state.armSwing, state.legSwing, state.footL, state.footR, state.dash, state.attack, state.hurt, state.stagger, state.death, state.cast, state.landing, state.lookYaw, state.lookPitch, state.shoulderYaw, state.cloakSway, state.cloakLift, state.swordWindup, state.swordFollow, state.secondary, state.trail, state.blur, state.silhouette, state.headTilt, state.hipShift]) spring.reset(spring === state.silhouette ? 1 : 0)
  state.additive.reset()
  state.cloakVelocity.set(0, 0, 0)
  state.footClock = 0
  snapshot.state = 'idle'
  if (wasRunning) startPlayerAnimationV4()
}

export function getPlayerAnimationV4(): Readonly<PlayerAnimationSnapshot> {
  return snapshot
}

export function playerAnimationState(): PlayerAnimState {
  return state.state
}

export function playerAnimationTransitioning(): boolean {
  return state.state !== state.previous && state.stateAge < 0.12
}

export function playerAnimationEnergy(): number {
  return clamp01(state.speed.value / 8 + state.attack.value * 0.35 + state.dash.value * 0.5)
}
