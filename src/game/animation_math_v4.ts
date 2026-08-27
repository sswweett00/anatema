import * as THREE from 'three'

export type Ease = (t: number) => number

export const EASE = {
  linear: (t: number) => t,
  smooth: (t: number) => t * t * (3 - 2 * t),
  smoother: (t: number) => t * t * t * (t * (t * 6 - 15) + 10),
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  outExpo: (t: number) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  outBack: (t: number) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) },
  inBack: (t: number) => { const c1 = 1.70158; const c3 = c1 + 1; return c3 * t * t * t - c1 * t * t },
  outElastic: (t: number) => { if (t === 0 || t === 1) return t; const c4 = (2 * Math.PI) / 3; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1 },
} satisfies Record<string, Ease>

export function finite(value: number | undefined | null, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function clamp01(value: number): number {
  return THREE.MathUtils.clamp(finite(value), 0, 1)
}

export function clamp(value: number, min: number, max: number): number {
  return THREE.MathUtils.clamp(finite(value), min, max)
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  const safeDt = clamp(dt, 0, 0.2)
  return THREE.MathUtils.damp(finite(current), finite(target), Math.max(0, lambda), safeDt)
}

export function criticallyDamped(current: number, target: number, velocity: number, frequency: number, dt: number): { value: number; velocity: number } {
  const safeDt = clamp(dt, 0, 0.1)
  const omega = Math.max(0.001, frequency) * Math.PI * 2
  const f = 1 + 2 * safeDt * omega
  const oo = omega * omega
  const hoo = safeDt * oo
  const hhoo = safeDt * hoo
  const detInv = 1 / (f + hhoo)
  const x = (f * current + safeDt * velocity + hhoo * target) * detInv
  const v = (velocity + hoo * (target - current)) * detInv
  return { value: x, velocity: v }
}

export function springScalar(state: { value: number; velocity: number }, target: number, stiffness: number, dampingRatio: number, dt: number): void {
  const k = Math.max(0.001, stiffness)
  const c = Math.max(0.001, dampingRatio * 2 * Math.sqrt(k))
  const accel = (target - state.value) * k - state.velocity * c
  state.velocity = finite(state.velocity) + accel * clamp(dt, 0, 0.033)
  state.value = finite(state.value) + state.velocity * clamp(dt, 0, 0.033)
  if (Math.abs(state.value - target) < 0.0005 && Math.abs(state.velocity) < 0.001) {
    state.value = target
    state.velocity = 0
  }
}

export function springAngle(state: { value: number; velocity: number }, target: number, stiffness: number, dampingRatio: number, dt: number): void {
  const delta = THREE.MathUtils.euclideanModulo(target - state.value + Math.PI, Math.PI * 2) - Math.PI
  springScalar(state, state.value + delta, stiffness, dampingRatio, dt)
  state.value = THREE.MathUtils.euclideanModulo(state.value + Math.PI, Math.PI * 2) - Math.PI
}

export class Spring1D {
  value: number
  velocity: number
  constructor(value = 0) {
    this.value = value
    this.velocity = 0
  }
  reset(value = 0): void {
    this.value = value
    this.velocity = 0
  }
  update(target: number, stiffness: number, dampingRatio: number, dt: number): number {
    springScalar(this, finite(target), stiffness, dampingRatio, dt)
    return this.value
  }
}

export class Spring3D {
  readonly value = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  reset(value: THREE.Vector3 | [number, number, number] = new THREE.Vector3()): void {
    if (value instanceof THREE.Vector3) this.value.copy(value)
    else this.value.set(value[0], value[1], value[2])
    this.velocity.setScalar(0)
  }
  update(target: THREE.Vector3, stiffness: number, dampingRatio: number, dt: number): THREE.Vector3 {
    const safeDt = clamp(dt, 0, 0.033)
    const k = Math.max(0.001, stiffness)
    const c = Math.max(0.001, dampingRatio * 2 * Math.sqrt(k))
    this.velocity.addScaledVector(target.clone().sub(this.value), k * safeDt)
    this.velocity.multiplyScalar(Math.max(0, 1 - c * safeDt))
    this.value.addScaledVector(this.velocity, safeDt)
    if (this.value.distanceToSquared(target) < 1e-8 && this.velocity.lengthSq() < 1e-7) this.value.copy(target)
    return this.value
  }
}

export class SpringRotation {
  readonly x = new Spring1D()
  readonly y = new Spring1D()
  readonly z = new Spring1D()
  reset(rotation: THREE.Euler): void {
    this.x.reset(rotation.x)
    this.y.reset(rotation.y)
    this.z.reset(rotation.z)
  }
  update(target: THREE.Euler, stiffness: number, dampingRatio: number, dt: number, output: THREE.Euler): THREE.Euler {
    this.x.update(angleDelta(this.x.value, target.x) + this.x.value, stiffness, dampingRatio, dt)
    this.y.update(angleDelta(this.y.value, target.y) + this.y.value, stiffness, dampingRatio, dt)
    this.z.update(angleDelta(this.z.value, target.z) + this.z.value, stiffness, dampingRatio, dt)
    output.set(this.x.value, this.y.value, this.z.value)
    return output
  }
}

export function angleDelta(a: number, b: number): number {
  return THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI
}

export function smoothDampVector(current: THREE.Vector3, target: THREE.Vector3, velocity: THREE.Vector3, smoothTime: number, dt: number, maxSpeed = Infinity): THREE.Vector3 {
  const safeDt = clamp(dt, 0, 0.033)
  const omega = 2 / Math.max(0.0001, smoothTime)
  const x = omega * safeDt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  let change = current.clone().sub(target)
  const originalTarget = target.clone()
  const maxChange = maxSpeed * smoothTime
  if (Number.isFinite(maxChange)) change.clampLength(0, maxChange)
  const temp = velocity.clone().addScaledVector(change, omega)
  velocity.copy(temp).multiplyScalar(exp)
  const output = target.clone().add(change.addScaledVector(temp, safeDt)).multiplyScalar(1 - exp)
  output.addScaledVector(target, exp)
  if (output.clone().sub(originalTarget).dot(change) > 0) {
    output.copy(originalTarget)
    velocity.set(0, 0, 0)
  }
  current.copy(output)
  return current
}

export function triangleWave(time: number, period: number): number {
  const p = Math.max(0.0001, period)
  const x = ((finite(time) % p) + p) % p / p
  return 1 - Math.abs(x * 2 - 1)
}

export function sawWave(time: number, period: number): number {
  const p = Math.max(0.0001, period)
  return ((finite(time) % p) + p) % p / p
}

export function pulse(time: number, frequency: number, phase = 0): number {
  return 0.5 + 0.5 * Math.sin(finite(time) * frequency * Math.PI * 2 + phase)
}

export function signedPulse(time: number, frequency: number, phase = 0): number {
  return Math.sin(finite(time) * frequency * Math.PI * 2 + phase)
}

export function pingPong(time: number, duration: number): number {
  return triangleWave(time, Math.max(0.0001, duration * 2))
}

export function noise1D(x: number): number {
  const n = Math.sin(x * 127.1 + 311.7) * 43758.5453123
  return n - Math.floor(n)
}

export function noiseSigned(x: number): number {
  return noise1D(x) * 2 - 1
}

export function layeredNoise(time: number, seed: number, frequencies: readonly number[], amplitudes: readonly number[]): number {
  let sum = 0
  let weight = 0
  const count = Math.min(frequencies.length, amplitudes.length)
  for (let i = 0; i < count; i++) {
    const amplitude = finite(amplitudes[i])
    sum += noiseSigned(time * finite(frequencies[i]) + seed * (i + 1) * 17.31) * amplitude
    weight += Math.abs(amplitude)
  }
  return weight > 0 ? sum / weight : 0
}

export function criticallyDampedVec3(current: THREE.Vector3, target: THREE.Vector3, velocity: THREE.Vector3, frequency: number, dt: number): void {
  const sx = criticallyDamped(current.x, target.x, velocity.x, frequency, dt)
  const sy = criticallyDamped(current.y, target.y, velocity.y, frequency, dt)
  const sz = criticallyDamped(current.z, target.z, velocity.z, frequency, dt)
  current.set(sx.value, sy.value, sz.value)
  velocity.set(sx.velocity, sy.velocity, sz.velocity)
}

export function approach(current: number, target: number, rate: number, dt: number): number {
  const step = Math.max(0, finite(rate)) * clamp(dt, 0, 0.2)
  if (Math.abs(target - current) <= step) return target
  return current + Math.sign(target - current) * step
}

export function approachAngle(current: number, target: number, rate: number, dt: number): number {
  const delta = angleDelta(current, target)
  const step = Math.max(0, finite(rate)) * clamp(dt, 0, 0.2)
  if (Math.abs(delta) <= step) return target
  return current + Math.sign(delta) * step
}

export function lerpClamped(a: number, b: number, t: number): number {
  return THREE.MathUtils.lerp(a, b, clamp01(t))
}

export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const span = inMax - inMin
  if (Math.abs(span) < 1e-6) return outMin
  return outMin + (value - inMin) / span * (outMax - outMin)
}

export function remapClamped(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return remap(clamp(value, Math.min(inMin, inMax), Math.max(inMin, inMax)), inMin, inMax, outMin, outMax)
}

export function deadzone(value: number, threshold: number): number {
  const t = clamp01(threshold)
  const abs = Math.abs(value)
  if (abs <= t) return 0
  return Math.sign(value) * remap(abs, t, 1, 0, 1)
}

export function normalizeSafe(v: THREE.Vector3, fallback = new THREE.Vector3(0, 0, 1)): THREE.Vector3 {
  if (v.lengthSq() < 1e-8 || !Number.isFinite(v.x + v.y + v.z)) return v.copy(fallback)
  return v.normalize()
}

export function yawFromVelocity(v: THREE.Vector3, fallback: number): number {
  const planar = v.lengthSq() - v.y * v.y
  if (planar < 1e-8) return fallback
  return Math.atan2(v.x, v.z)
}

export function projectPlanar(v: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  out.set(v.x, 0, v.z)
  return out
}

export function signedSpeed(v: THREE.Vector3, facing: THREE.Vector3): number {
  const speed = Math.hypot(v.x, v.z)
  if (speed < 1e-6) return 0
  return Math.sign(v.x * facing.x + v.z * facing.z) * speed
}

export function velocityTurnAmount(v: THREE.Vector3, facingAngle: number): number {
  const yaw = yawFromVelocity(v, facingAngle)
  return angleDelta(facingAngle, yaw)
}

export function applyPlanarDrag(v: THREE.Vector3, drag: number, dt: number): void {
  const factor = Math.max(0, 1 - clamp(drag, 0, 100) * clamp(dt, 0, 0.033))
  v.x *= factor
  v.z *= factor
}

export function applyPlanarImpulse(v: THREE.Vector3, direction: THREE.Vector3, amount: number): void {
  const dir = normalizeSafe(direction)
  v.x += dir.x * finite(amount)
  v.z += dir.z * finite(amount)
}

export function dampVector3(v: THREE.Vector3, lambda: number, dt: number): void {
  const factor = Math.exp(-Math.max(0, finite(lambda)) * clamp(dt, 0, 0.2))
  v.multiplyScalar(factor)
}

export function dampEuler(rotation: THREE.Euler, target: THREE.Euler, lambda: number, dt: number): void {
  rotation.x = THREE.MathUtils.damp(rotation.x, target.x, lambda, dt)
  rotation.y = approachAngle(rotation.y, target.y, lambda, dt)
  rotation.z = THREE.MathUtils.damp(rotation.z, target.z, lambda, dt)
}

export function composeAdditiveRotation(base: THREE.Euler, x = 0, y = 0, z = 0, out = new THREE.Euler()): THREE.Euler {
  out.set(base.x + finite(x), base.y + finite(y), base.z + finite(z))
  return out
}

export function quaternionFromYawPitchRoll(yaw: number, pitch: number, roll: number, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromEuler(new THREE.Euler(finite(pitch), finite(yaw), finite(roll), 'YXZ'))
}

export function lookAtYaw(from: THREE.Vector3, to: THREE.Vector3, fallback = 0): number {
  const dx = finite(to.x - from.x)
  const dz = finite(to.z - from.z)
  if (Math.abs(dx) + Math.abs(dz) < 1e-7) return fallback
  return Math.atan2(dx, dz)
}

export function phaseOffset(index: number, count: number, phase = 0): number {
  if (count <= 0) return phase
  return phase + (index / count) * Math.PI * 2
}

export function wave01(time: number, frequency: number, phase: number): number {
  return 0.5 + 0.5 * Math.sin(time * frequency + phase)
}

export function oscillateAround(center: number, amplitude: number, time: number, frequency: number, phase = 0): number {
  return center + Math.sin(time * frequency + phase) * amplitude
}

export function clampMagnitude(v: THREE.Vector3, max: number): void {
  const m = Math.max(0, finite(max))
  if (v.lengthSq() > m * m && m > 0) v.setLength(m)
  if (m === 0) v.setScalar(0)
}

export function finiteVector3(v: THREE.Vector3, fallback = new THREE.Vector3()): THREE.Vector3 {
  if (![v.x, v.y, v.z].every(Number.isFinite)) return v.copy(fallback)
  return v
}

export function finiteEuler(e: THREE.Euler): THREE.Euler {
  if (![e.x, e.y, e.z].every(Number.isFinite)) e.set(0, 0, 0)
  return e
}

export function scalarEnvelope(time: number, attack: number, hold: number, release: number): number {
  const t = finite(time)
  const a = Math.max(0.0001, attack)
  const h = Math.max(0, hold)
  const r = Math.max(0.0001, release)
  if (t <= 0) return 0
  if (t < a) return EASE.outQuad(t / a)
  if (t < a + h) return 1
  const rt = t - a - h
  if (rt < r) return 1 - EASE.inQuad(rt / r)
  return 0
}

export function oneShotPulse(time: number, duration: number, ease: Ease = EASE.smooth): number {
  if (time <= 0 || time >= duration) return 0
  return ease(clamp01(time / duration)) * (1 - ease(clamp01(time / duration))) * 4
}

export function radialFalloff(distance: number, radius: number, exponent = 1): number {
  const r = Math.max(0.0001, radius)
  return Math.pow(clamp01(1 - distance / r), Math.max(0.01, exponent))
}

export function dampTowardsVector(current: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number): void {
  const factor = 1 - Math.exp(-Math.max(0, finite(lambda)) * clamp(dt, 0, 0.2))
  current.lerp(target, factor)
}

export function integrateOffset(position: THREE.Vector3, velocity: THREE.Vector3, acceleration: THREE.Vector3, dt: number): void {
  const safeDt = clamp(dt, 0, 0.033)
  velocity.addScaledVector(acceleration, safeDt)
  position.addScaledVector(velocity, safeDt)
}

export function decay(value: number, halfLife: number, dt: number): number {
  const h = Math.max(0.0001, halfLife)
  return finite(value) * Math.pow(0.5, clamp(dt, 0, 0.2) / h)
}

export function decaySpringState(state: { value: number; velocity: number }, halfLife: number, dt: number): void {
  state.value = decay(state.value, halfLife, dt)
  state.velocity = decay(state.velocity, halfLife * 0.7, dt)
}

export function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - clamp01(t)
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

export function hermite(t: number, p0: number, v0: number, p1: number, v1: number): number {
  const u = clamp01(t)
  const h00 = 2 * u * u * u - 3 * u * u + 1
  const h10 = u * u * u - 2 * u * u + u
  const h01 = -2 * u * u * u + 3 * u * u
  const h11 = u * u * u - u * u
  return h00 * p0 + h10 * v0 + h01 * p1 + h11 * v1
}

export function evaluateTrack(time: number, keys: readonly { time: number; value: number; ease?: Ease }[], fallback = 0): number {
  if (keys.length === 0) return fallback
  if (time <= keys[0].time) return keys[0].value
  const last = keys[keys.length - 1]
  if (time >= last.time) return last.value
  for (let i = 1; i < keys.length; i++) {
    const next = keys[i]
    if (time <= next.time) {
      const prev = keys[i - 1]
      const alpha = (time - prev.time) / Math.max(0.0001, next.time - prev.time)
      return THREE.MathUtils.lerp(prev.value, next.value, (next.ease ?? EASE.smooth)(alpha))
    }
  }
  return last.value
}

export interface AnimationBudget {
  distance: number
  updateHz: number
  detail: number
  allowTrails: boolean
  allowSecondary: boolean
}

export function budgetForDistance(distance: number, pressure: number, quality = 1): AnimationBudget {
  const d = Math.max(0, finite(distance))
  const p = clamp01(pressure)
  const q = clamp(quality, 0.25, 1.5)
  const detail = d < 8 ? 1 : d < 20 ? 0.78 : d < 40 ? 0.52 : 0.28
  const updateHz = d < 10 ? 60 : d < 24 ? 40 : d < 55 ? 24 : 12
  return {
    distance: d,
    updateHz: Math.max(8, updateHz * q * (1 - p * 0.35)),
    detail,
    allowTrails: d < 30 && p < 0.85,
    allowSecondary: d < 45 && p < 0.92,
  }
}

export function shouldStepAccumulator(accumulator: number, interval: number): { step: boolean; remainder: number } {
  const next = accumulator + interval
  if (next < interval) return { step: false, remainder: next }
  return { step: true, remainder: next - interval }
}
