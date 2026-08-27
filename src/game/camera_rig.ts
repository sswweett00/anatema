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
  basePosition: [0, 26, 18],
  baseZoom: 42,
  minZoom: 36,
  maxZoom: 47,
  followSharpness: 8.5,
  lookSharpness: 10.0,
  velocityLookAhead: 0.2,
  speedZoom: 1.5,
  pressureZoom: 1.2,
  maxLookAhead: 2.2,
  shakePosition: 0,
  shakeRotation: 0,
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
      if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
        camera.updateProjectionMatrix()
      }
    }
  }

  addImpact(_amount: number): void {
    // Screen shake disabled per user preference
    this.impact = 0
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

    const targetLookX = THREE.MathUtils.clamp(vx * CAMERA_RIG_CONFIG.velocityLookAhead, -CAMERA_RIG_CONFIG.maxLookAhead, CAMERA_RIG_CONFIG.maxLookAhead)
    const targetLookZ = THREE.MathUtils.clamp(vz * CAMERA_RIG_CONFIG.velocityLookAhead, -CAMERA_RIG_CONFIG.maxLookAhead, CAMERA_RIG_CONFIG.maxLookAhead)
    target.set(px, 0, pz)
    lookTarget.set(px + targetLookX, 0, pz + targetLookZ)

    const zoomTarget = CAMERA_RIG_CONFIG.baseZoom

    this.desiredPosition.set(px, 26, pz + 18)

    if (!this.initialized) {
      camera.position.copy(this.desiredPosition)
      this.desiredLook.copy(target)
      this.initialized = true
    } else {
      camera.position.lerp(this.desiredPosition, 1 - Math.exp(-CAMERA_RIG_CONFIG.followSharpness * safeDt))
      this.desiredLook.lerp(target, 1 - Math.exp(-CAMERA_RIG_CONFIG.lookSharpness * safeDt))
    }

    this.impact = 0
    camera.lookAt(this.desiredLook)

    if (camera instanceof THREE.OrthographicCamera) {
      const oldZoom = camera.zoom
      camera.zoom = damp(
        camera.zoom,
        zoomTarget,
        6.2,
        safeDt,
      )
      if (Math.abs(camera.zoom - oldZoom) > 0.0001) {
        camera.updateProjectionMatrix()
      }
    }

    camera.rotation.z = 0
  }
}
