import { EASE, Ease, clamp01, lerpClamped, remapClamped, scalarEnvelope, signedPulse, triangleWave } from './animation_math_v4'

export interface TrackKey {
  time: number
  value: number
  ease?: Ease
}

export interface PoseTrack {
  id: string
  duration: number
  keys: readonly TrackKey[]
  loop?: boolean
  phase?: number
}

export interface PoseChannels {
  rootX: number
  rootY: number
  rootZ: number
  spinePitch: number
  spineYaw: number
  spineRoll: number
  headPitch: number
  headYaw: number
  headRoll: number
  armL: number
  armR: number
  forearmL: number
  forearmR: number
  handL: number
  handR: number
  hipPitch: number
  hipYaw: number
  hipRoll: number
  thighL: number
  thighR: number
  shinL: number
  shinR: number
  footL: number
  footR: number
  cloak: number
  sword: number
  shield: number
  scaleX: number
  scaleY: number
  scaleZ: number
}

export interface PoseProfile {
  id: string
  locomotion: PoseTrack
  attack: PoseTrack
  dash: PoseTrack
  hurt: PoseTrack
  stagger: PoseTrack
  death: PoseTrack
  cast: PoseTrack
  idle: PoseTrack
}

const key = (time: number, value: number, ease?: Ease): TrackKey => ({ time, value, ease })

export function loopedTime(time: number, duration: number): number {
  if (duration <= 0) return 0
  return ((time % duration) + duration) % duration
}

export function evaluateTrack(track: PoseTrack, time: number): number {
  if (track.keys.length === 0) return 0
  const local = track.loop ? loopedTime(time + (track.phase ?? 0), track.duration) : Math.max(0, Math.min(track.duration, time))
  if (local <= track.keys[0].time) return track.keys[0].value
  for (let i = 1; i < track.keys.length; i++) {
    const next = track.keys[i]
    if (local <= next.time) {
      const prev = track.keys[i - 1]
      const span = Math.max(0.0001, next.time - prev.time)
      const alpha = clamp01((local - prev.time) / span)
      return lerpClamped(prev.value, next.value, (next.ease ?? EASE.smooth)(alpha))
    }
  }
  return track.keys[track.keys.length - 1].value
}

function blend(a: number, b: number, weight: number): number {
  return a + (b - a) * clamp01(weight)
}

export function samplePose(profile: PoseProfile, time: number, weights: { locomotion: number; attack: number; dash: number; hurt: number; stagger: number; death: number; cast: number; idle: number }): PoseChannels {
  const result: PoseChannels = emptyPose()
  const poses = [
    [profile.locomotion, weights.locomotion],
    [profile.attack, weights.attack],
    [profile.dash, weights.dash],
    [profile.hurt, weights.hurt],
    [profile.stagger, weights.stagger],
    [profile.death, weights.death],
    [profile.cast, weights.cast],
    [profile.idle, weights.idle],
  ] as const
  for (const [track, weight] of poses) {
    const v = evaluateTrack(track, time)
    result.spinePitch += v * weight
    result.headPitch += v * 0.36 * weight
    result.hipPitch += v * 0.2 * weight
  }
  return result
}

export function emptyPose(): PoseChannels {
  return {
    rootX: 0, rootY: 0, rootZ: 0,
    spinePitch: 0, spineYaw: 0, spineRoll: 0,
    headPitch: 0, headYaw: 0, headRoll: 0,
    armL: 0, armR: 0, forearmL: 0, forearmR: 0, handL: 0, handR: 0,
    hipPitch: 0, hipYaw: 0, hipRoll: 0,
    thighL: 0, thighR: 0, shinL: 0, shinR: 0, footL: 0, footR: 0,
    cloak: 0, sword: 0, shield: 0,
    scaleX: 1, scaleY: 1, scaleZ: 1,
  }
}

function idleTrack(): PoseTrack {
  return {
    id: 'idle',
    duration: 4,
    loop: true,
    keys: [
      key(0, 0, EASE.smoother),
      key(1, 0.4),
      key(2, -0.15),
      key(3, 0.25),
      key(4, 0, EASE.smoother),
    ],
  }
}

function locomotionTrack(): PoseTrack {
  return {
    id: 'locomotion',
    duration: 0.64,
    loop: true,
    keys: [
      key(0, -1), key(0.08, -0.58), key(0.16, 0), key(0.24, 0.62),
      key(0.32, 1), key(0.4, 0.55), key(0.48, 0), key(0.56, -0.58), key(0.64, -1),
    ],
  }
}

function attackTrack(): PoseTrack {
  return {
    id: 'attack', duration: 0.34,
    keys: [key(0, 0), key(0.04, -0.35, EASE.inOutCubic), key(0.11, -1, EASE.outQuad), key(0.18, 0.25, EASE.outBack), key(0.24, 1), key(0.29, 0.4), key(0.34, 0, EASE.outQuad)],
  }
}

function dashTrack(): PoseTrack {
  return {
    id: 'dash', duration: 0.16,
    keys: [key(0, 0), key(0.025, 0.35, EASE.outExpo), key(0.07, 1, EASE.outBack), key(0.12, 0.7), key(0.16, 0, EASE.outQuad)],
  }
}

function hurtTrack(): PoseTrack {
  return {
    id: 'hurt', duration: 0.22,
    keys: [key(0, 0), key(0.035, 1, EASE.outQuad), key(0.09, -0.42, EASE.outBack), key(0.15, 0.18), key(0.22, 0, EASE.outQuad)],
  }
}

function staggerTrack(): PoseTrack {
  return {
    id: 'stagger', duration: 0.6,
    keys: [key(0, 0), key(0.08, -0.25, EASE.outQuad), key(0.2, 0.4), key(0.36, -0.18), key(0.5, 0.1), key(0.6, 0, EASE.outQuad)],
  }
}

function deathTrack(): PoseTrack {
  return {
    id: 'death', duration: 1.7,
    keys: [key(0, 0), key(0.12, 0.05, EASE.outQuad), key(0.38, 0.45, EASE.inCubic), key(0.78, 1, EASE.outCubic), key(1.2, 0.88), key(1.7, 1, EASE.outQuad)],
  }
}

function castTrack(): PoseTrack {
  return {
    id: 'cast', duration: 1.15,
    keys: [key(0, 0), key(0.24, 0.25, EASE.outQuad), key(0.56, 0.8, EASE.smooth), key(0.84, 1, EASE.outBack), key(1.15, 0, EASE.outExpo)],
  }
}

export const KNIGHT_PROFILE: PoseProfile = { id: 'knight', locomotion: locomotionTrack(), attack: attackTrack(), dash: dashTrack(), hurt: hurtTrack(), stagger: staggerTrack(), death: deathTrack(), cast: castTrack(), idle: idleTrack() }
export const GOBLIN_PROFILE: PoseProfile = makeCreatureProfile('goblin', 1.2, 1.15)
export const SKELETON_PROFILE: PoseProfile = makeCreatureProfile('skeleton', 0.74, 0.8)
export const SLIME_PROFILE: PoseProfile = makeCreatureProfile('slime', 0.48, 0.55)
export const ELITE_PROFILE: PoseProfile = makeCreatureProfile('elite', 0.68, 0.72)
export const BOSS_PROFILE: PoseProfile = makeCreatureProfile('boss', 0.42, 0.5)

function makeCreatureProfile(id: string, stride: number, attackScale: number): PoseProfile {
  const locomotion = locomotionTrack()
  const attack = attackTrack()
  locomotion.keys.forEach((item) => { item.value *= stride })
  attack.keys.forEach((item) => { item.value *= attackScale })
  return { id, locomotion, attack, dash: dashTrack(), hurt: hurtTrack(), stagger: staggerTrack(), death: deathTrack(), cast: castTrack(), idle: idleTrack() }
}

export function sampleLocomotion(profile: PoseProfile, time: number, speed: number): PoseChannels {
  const result = emptyPose()
  const gait = evaluateTrack(profile.locomotion, time)
  const stride = clamp01(speed / 6.5)
  const phase = time / Math.max(0.1, profile.locomotion.duration) * Math.PI * 2
  result.thighL = gait * 0.72 * stride
  result.thighR = -gait * 0.72 * stride
  result.shinL = -Math.max(0, gait) * 0.52 * stride
  result.shinR = -Math.max(0, -gait) * 0.52 * stride
  result.footL = Math.sin(phase) * stride * 0.18
  result.footR = Math.sin(phase + Math.PI) * stride * 0.18
  result.armL = -gait * 0.34 * stride
  result.armR = gait * 0.34 * stride
  result.spinePitch = gait * 0.06 * stride
  result.hipRoll = Math.sin(phase * 2) * 0.045 * stride
  result.rootY = Math.abs(Math.sin(phase)) * 0.035 * stride
  return result
}

export function sampleAttack(profile: PoseProfile, time: number): PoseChannels {
  const result = emptyPose()
  const t = clamp01(time / profile.attack.duration)
  const v = evaluateTrack(profile.attack, time)
  const arc = Math.sin(t * Math.PI)
  result.armL = v * 0.9
  result.armR = -v * 1.25
  result.forearmL = v * 0.55
  result.forearmR = -v * 0.82
  result.handL = -v * 0.18
  result.handR = v * 0.2
  result.spineYaw = v * 0.24
  result.spinePitch = -arc * 0.18
  result.hipYaw = -v * 0.12
  result.sword = v * 1.4
  result.cloak = -v * 0.15
  return result
}

export function sampleDash(profile: PoseProfile, time: number): PoseChannels {
  const result = emptyPose()
  const v = evaluateTrack(profile.dash, time)
  result.spinePitch = -v * 0.32
  result.headPitch = v * 0.08
  result.armL = v * 0.5
  result.armR = v * 0.62
  result.forearmL = -v * 0.28
  result.forearmR = -v * 0.38
  result.thighL = v * 0.22
  result.thighR = -v * 0.12
  result.cloak = v * 0.55
  result.scaleZ = 1 + v * 0.12
  result.scaleY = 1 - v * 0.06
  return result
}

export function sampleHurt(profile: PoseProfile, time: number): PoseChannels {
  const result = emptyPose()
  const v = evaluateTrack(profile.hurt, time)
  result.rootX = -v * 0.08
  result.spinePitch = v * 0.22
  result.spineRoll = v * 0.16
  result.headYaw = -v * 0.24
  result.headPitch = v * 0.15
  result.armL = -v * 0.28
  result.armR = v * 0.31
  result.cloak = -v * 0.22
  return result
}

export function sampleStagger(profile: PoseProfile, time: number): PoseChannels {
  const result = emptyPose()
  const v = evaluateTrack(profile.stagger, time)
  result.rootX = v * 0.12
  result.rootZ = -Math.abs(v) * 0.045
  result.spinePitch = -v * 0.31
  result.spineYaw = v * 0.19
  result.headRoll = v * 0.23
  result.armL = v * 0.5
  result.armR = -v * 0.45
  result.thighL = -v * 0.25
  result.thighR = v * 0.18
  return result
}

export function sampleDeath(profile: PoseProfile, time: number): PoseChannels {
  const result = emptyPose()
  const progress = clamp01(time / profile.death.duration)
  const fall = evaluateTrack(profile.death, time)
  result.rootY = -fall * 0.12
  result.rootX = fall * 0.22
  result.spineRoll = fall * 0.8
  result.spinePitch = -fall * 0.45
  result.headPitch = fall * 0.3
  result.armL = fall * 0.85
  result.armR = -fall * 0.75
  result.forearmL = fall * 0.42
  result.forearmR = -fall * 0.38
  result.thighL = -fall * 0.22
  result.thighR = fall * 0.15
  result.cloak = fall * 0.8
  result.scaleY = 1 - progress * 0.18
  result.scaleZ = 1 + progress * 0.05
  return result
}

export function sampleCast(profile: PoseProfile, time: number): PoseChannels {
  const result = emptyPose()
  const v = evaluateTrack(profile.cast, time)
  result.rootY = v * 0.04
  result.spinePitch = -v * 0.22
  result.spineYaw = Math.sin(time * 2.4) * v * 0.09
  result.headPitch = v * 0.1
  result.armL = -v * 0.75
  result.armR = v * 0.72
  result.forearmL = v * 0.35
  result.forearmR = -v * 0.35
  result.handL = v * 0.15
  result.handR = -v * 0.15
  result.cloak = Math.sin(time * 4.1) * v * 0.2
  result.scaleX = 1 + v * 0.04
  result.scaleY = 1 + v * 0.04
  result.scaleZ = 1 + v * 0.04
  return result
}

export function sampleReactivePose(profile: PoseProfile, state: string, time: number, speed: number): PoseChannels {
  const base = sampleLocomotion(profile, time, speed)
  let reaction = emptyPose()
  if (state === 'attack') reaction = sampleAttack(profile, time)
  if (state === 'dash') reaction = sampleDash(profile, time)
  if (state === 'hurt' || state === 'recoil') reaction = sampleHurt(profile, time)
  if (state === 'stagger') reaction = sampleStagger(profile, time)
  if (state === 'dead') reaction = sampleDeath(profile, time)
  if (state === 'casting') reaction = sampleCast(profile, time)
  return blendPose(base, reaction, state === 'idle' ? 0.15 : 1)
}

export function blendPose(a: PoseChannels, b: PoseChannels, weight: number): PoseChannels {
  const w = clamp01(weight)
  const result = emptyPose()
  for (const channel of Object.keys(result) as Array<keyof PoseChannels>) result[channel] = blend(a[channel], b[channel], w)
  return result
}

export function addPose(a: PoseChannels, b: PoseChannels, weight = 1): PoseChannels {
  const result = { ...a }
  for (const channel of Object.keys(result) as Array<keyof PoseChannels>) {
    if (channel.startsWith('scale')) result[channel] *= lerpClamped(1, b[channel], weight)
    else result[channel] += b[channel] * weight
  }
  return result
}

export function applyElementalPose(base: PoseChannels, element: string, intensity: number, time: number): PoseChannels {
  const result = { ...base }
  const i = clamp01(intensity)
  if (element === 'fire') { result.spinePitch += Math.sin(time * 7) * 0.04 * i; result.cloak += Math.sin(time * 9) * 0.11 * i }
  if (element === 'ice') { result.spineRoll += Math.sin(time * 2.5) * 0.015 * i; result.headPitch -= 0.08 * i; result.scaleX *= 1 - i * 0.025; result.scaleY *= 1 + i * 0.018 }
  if (element === 'shock') { const jitter = signedPulse(time, 18) * i; result.headYaw += jitter * 0.05; result.armL += jitter * 0.08; result.armR -= jitter * 0.08 }
  if (element === 'poison') { result.rootY += Math.sin(time * 3.4) * 0.025 * i; result.rootZ += Math.sin(time * 2.2) * 0.035 * i }
  if (element === 'void') { result.spineYaw += Math.sin(time * 1.8) * 0.07 * i; result.cloak += triangleWave(time, 0.8) * 0.1 * i }
  if (element === 'blood') { result.spinePitch -= i * 0.05; result.armL += i * 0.08; result.armR -= i * 0.08 }
  return result
}

export function proceduralBreathing(time: number, intensity: number): PoseChannels {
  const result = emptyPose()
  const breath = 0.5 + 0.5 * Math.sin(time * 2.08)
  const micro = Math.sin(time * 6.7) * 0.12 + Math.sin(time * 11.3) * 0.04
  result.rootY = breath * 0.012 * intensity
  result.spinePitch = breath * 0.026 * intensity
  result.headPitch = -breath * 0.012 * intensity
  result.scaleY = 1 + breath * 0.008 * intensity
  result.spineRoll = micro * 0.01 * intensity
  return result
}

export function proceduralAim(yawError: number, pitchError: number, weight: number): PoseChannels {
  const result = emptyPose()
  const w = clamp01(weight)
  result.headYaw = remapClamped(yawError, -Math.PI, Math.PI, -0.6, 0.6) * w
  result.headPitch = remapClamped(pitchError, -Math.PI / 2, Math.PI / 2, -0.35, 0.35) * w
  result.spineYaw = result.headYaw * 0.32
  result.spinePitch = result.headPitch * 0.22
  return result
}

export function proceduralTurn(yawVelocity: number, speed: number): PoseChannels {
  const result = emptyPose()
  const turn = Math.max(-1.4, Math.min(1.4, yawVelocity))
  const weight = clamp01(speed / 6)
  result.spineYaw = turn * 0.18 * weight
  result.hipYaw = turn * 0.08 * weight
  result.headYaw = turn * 0.36 * weight
  result.armL = -turn * 0.08 * weight
  result.armR = -turn * 0.08 * weight
  return result
}

export function proceduralLanding(strength: number, time: number): PoseChannels {
  const result = emptyPose()
  const envelope = scalarEnvelope(time, 0.025, 0.015, 0.32)
  const s = clamp01(strength) * envelope
  result.rootY -= s * 0.07
  result.spinePitch += s * 0.12
  result.scaleY -= s * 0.06
  result.scaleX += s * 0.035
  result.scaleZ += s * 0.035
  result.armL += s * 0.22
  result.armR -= s * 0.22
  result.cloak += s * 0.3
  return result
}

export function proceduralFlinch(strength: number, axis: number, time: number): PoseChannels {
  const result = emptyPose()
  const pulse = signedPulse(time, 12.5)
  const s = clamp01(strength)
  result.rootX += pulse * 0.02 * s
  result.rootZ -= s * 0.035
  result.spineRoll += axis * s * 0.16
  result.headRoll -= axis * s * 0.1
  result.armL -= axis * s * 0.15
  result.armR -= axis * s * 0.15
  return result
}

export function proceduralDeathSecondary(time: number, progress: number): PoseChannels {
  const result = emptyPose()
  const p = clamp01(progress)
  result.cloak = Math.sin(time * 8) * 0.15 * (1 - p)
  result.rootX += Math.sin(time * 3.7) * 0.012 * (1 - p)
  result.headYaw += Math.sin(time * 2.4) * 0.04 * (1 - p)
  return result
}

export function proceduralStatusPose(status: string, intensity: number, time: number): PoseChannels {
  const result = emptyPose()
  const i = clamp01(intensity)
  switch (status) {
    case 'stagger': return proceduralFlinch(i, Math.sign(Math.sin(time * 2)) || 1, time)
    case 'frozen': result.spinePitch = -0.06 * i; result.headPitch = -0.08 * i; result.scaleX = 1 - i * 0.02; result.scaleY = 1 + i * 0.025; return result
    case 'burning': result.rootY = Math.abs(Math.sin(time * 5.7)) * 0.025 * i; result.cloak = Math.sin(time * 7.2) * 0.14 * i; return result
    case 'poisoned': result.rootX = Math.sin(time * 2.8) * 0.025 * i; result.rootZ = Math.sin(time * 1.9) * 0.02 * i; return result
    case 'shocked': return proceduralFlinch(i, signedPulse(time, 14), time)
    case 'void': result.spineYaw = Math.sin(time * 2.2) * 0.08 * i; result.headRoll = Math.sin(time * 3.2) * 0.04 * i; return result
    default: return result
  }
}

export function poseForEnemy(kind: number, state: string, time: number, speed: number, intensity: number, status = ''): PoseChannels {
  const profile = kind === 0 ? GOBLIN_PROFILE : kind === 1 ? SKELETON_PROFILE : kind === 2 ? SLIME_PROFILE : state === 'boss' ? BOSS_PROFILE : ELITE_PROFILE
  let pose = sampleReactivePose(profile, state, time, speed)
  pose = addPose(pose, proceduralBreathing(time, 1 - clamp01(speed / 6)))
  if (status) pose = addPose(pose, proceduralStatusPose(status, intensity, time), 1)
  return pose
}

export function poseForPlayer(time: number, state: string, speed: number, intensity: number): PoseChannels {
  let pose = sampleReactivePose(KNIGHT_PROFILE, state, time, speed)
  pose = addPose(pose, proceduralBreathing(time, 1 - clamp01(speed / 7)))
  pose = addPose(pose, proceduralLanding(intensity * 0.35, time))
  return pose
}
