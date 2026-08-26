import * as THREE from 'three'
import type { Entity } from '../ecs/world'

export interface CameraRigConfig {
  basePosition: THREE.Vector3Tuple
  baseZoom: number
  minZoom: number
  maxZoom: number
  followSharpness: number
  lookSharpness: number
  velocityLookAhead: number
  speedZoom: number
  pressureZoom: number
  maxLookAhead: number
  shakePosition: number
  shakeRotation: number
  bounds: number
}

export const CAMERA_RIG_CONFIG: CameraRigConfig = {
  basePosition: [26, 26, 26],
  baseZoom: 42,
  minZoom: 36,
  maxZoom: 47,
  followSharpness: 7.2,
  lookSharpness: 9.2,
  velocityLookAhead: 0.34,
  speedZoom: 2.7,
  pressureZoom: 2.2,
  maxLookAhead: 3.5,
  shakePosition: 0.2,
  shakeRotation: 0.014,
  bounds: 185,
}

const target = new THREE.Vector3()
const lookTarget = new THREE.Vector3()
const shake = new THREE.Vector3()
const euler = new THREE.Euler()

function damp(current: number, targetValue: number, sharpness: number, dt: number): number {
  return THREE.MathUtils.damp(current, targetValue, sharpness, dt)
}

export class CameraRig {
  private readonly desiredPosition = new THREE.Vector3(...CAMERA_RIG_CONFIG.basePosition)
  private readonly desiredLook = new THREE.Vector3()
  private currentSpeed = 0
  private impact = 0
  private initialized = false
  private visualTime = 0

  reset(camera?: THREE.Camera): void {
    this.currentSpeed = 0
    this.impact = 0
    this.initialized = false
    this.visualTime = 0
    if (camera) {
      camera.position.set(...CAMERA_RIG_CONFIG.basePosition)
      camera.lookAt(0, 0, 0)
      if (camera instanceof THREE.OrthographicCamera) camera.zoom = CAMERA_RIG_CONFIG.baseZoom
      camera.rotation.set(0, 0, 0)
      camera.updateProjectionMatrix()
    }
  }

  addImpact(amount: number): void {
    if (!Number.isFinite(amount)) return
    this.impact = Math.min(1, Math.max(this.impact, Math.max(0, amount)))
  }

  update(camera: THREE.Camera, player: Entity | undefined, dt: number, pressure = 0): void {
    const safeDt = Math.min(0.05, Math.max(0.001, Number.isFinite(dt) ? dt : 1 / 60))
    if (!player) return

    this.visualTime += safeDt

    const px = Number.isFinite(player.position.x)
      ? THREE.MathUtils.clamp(player.position.x, -CAMERA_RIG_CONFIG.bounds, CAMERA_RIG_CONFIG.bounds)
      : 0
    const pz = Number.isFinite(player.position.z)
      ? THREE.MathUtils.clamp(player.position.z, -CAMERA_RIG_CONFIG.bounds, CAMERA_RIG_CONFIG.bounds)
      : 0
    const vx = Number.isFinite(player.velocity.x) ? player.velocity.x : 0
    const vz = Number.isFinite(player.velocity.z) ? player.velocity.z : 0
    const speed = Math.min(1, Math.hypot(vx, vz) / 9)
    this.currentSpeed = damp(this.currentSpeed, speed, 7.5, safeDt)

    const lookAheadX = THREE.MathUtils.clamp(vx * CAMERA_RIG_CONFIG.velocityLookAhead, -CAMERA_RIG_CONFIG.maxLookAhead, CAMERA_RIG_CONFIG.maxLookAhead)
    const lookAheadZ = THREE.MathUtils.clamp(vz * CAMERA_RIG_CONFIG.velocityLookAhead, -CAMERA_RIG_CONFIG.maxLookAhead, CAMERA_RIG_CONFIG.maxLookAhead)
    target.set(px, 0, pz)
    lookTarget.set(px + lookAheadX, 0, pz + lookAheadZ)

    const horizontalPressure = THREE.MathUtils.clamp(Number.isFinite(pressure) ? pressure : 0, 0, 1)
    const zoomTarget = CAMERA_RIG_CONFIG.baseZoom
      - this.currentSpeed * CAMERA_RIG_CONFIG.speedZoom
      - horizontalPressure * CAMERA_RIG_CONFIG.pressureZoom

    this.desiredPosition.set(26 + vx * 0.08, 26 + this.currentSpeed * 0.62, 26 + vz * 0.08)
    this.desiredPosition.x += (target.x - this.desiredPosition.x) * 0.032
    this.desiredPosition.z += (target.z - this.desiredPosition.z) * 0.032

    if (!this.initialized) {
      camera.position.copy(this.desiredPosition)
      this.desiredLook.copy(lookTarget)
      this.initialized = true
    } else {
      camera.position.lerp(this.desiredPosition, 1 - Math.exp(-CAMERA_RIG_CONFIG.followSharpness * safeDt))
      this.desiredLook.lerp(lookTarget, 1 - Math.exp(-CAMERA_RIG_CONFIG.lookSharpness * safeDt))
    }

    this.impact = damp(this.impact, 0, 12, safeDt)
    const t = this.visualTime
    const noiseX = Math.sin(t * 37.1) * Math.cos(t * 19.7)
    const noiseZ = Math.sin(t * 29.3 + 1.7) * Math.cos(t * 17.2)
    shake.set(noiseX, 0, noiseZ).multiplyScalar(this.impact * CAMERA_RIG_CONFIG.shakePosition)
    camera.position.add(shake)
    camera.lookAt(this.desiredLook)

    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = damp(
        camera.zoom,
        THREE.MathUtils.clamp(zoomTarget, CAMERA_RIG_CONFIG.minZoom, CAMERA_RIG_CONFIG.maxZoom),
        6.2,
        safeDt,
      )
      camera.updateProjectionMatrix()
    }

    euler.set(0, 0, this.impact * CAMERA_RIG_CONFIG.shakeRotation * Math.sin(t * 31.3))
    camera.rotation.z = euler.z
  }
}
