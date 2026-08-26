import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { particles, world } from '../ecs/world'
import { runtimeQuality } from '../game/performance'
import { softDotTexture } from '../game/textures'

/*
 * GPU tarafında iki draw-call. Draw budget ve simulation frequency pressure'a göre
 * ayrıştırılır; görüntü bütçesi korunurken CPU simülasyonu yoğun sahnede seyreltilir.
 */

const MAX_P = 900
const MAX_WISP = 160

export default function Particles() {
  const pointsRef = useRef<THREE.Points>(null!)
  const bigRef = useRef<THREE.Points>(null!)
  const simulationAccumulator = useRef(0)
  const sharedTexture = useMemo(() => softDotTexture(), [])

  const { geometry, positions, colors } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(MAX_P * 3).fill(-9999)
    const col = new Float32Array(MAX_P * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage))
    return { geometry: geo, positions: pos, colors: col }
  }, [])

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.55,
        map: sharedTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        alphaTest: 0.02,
      }),
    [sharedTexture],
  )

  const bigMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 1.15,
        map: sharedTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        alphaTest: 0.02,
      }),
    [sharedTexture],
  )

  const bigGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(MAX_WISP * 3).fill(-9999)
    const col = new Float32Array(MAX_WISP * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage))
    return geo
  }, [])

  useLayoutEffect(() => {
    geometry.setDrawRange(0, 0)
    bigGeo.setDrawRange(0, 0)
  }, [geometry, bigGeo])

  useFrame((_, rawDt) => {
    simulationAccumulator.current += Math.min(rawDt, 0.05)
    const targetHz = Math.max(30, Math.min(60, runtimeQuality.particleUpdateHz))
    const step = 1 / targetHz
    if (simulationAccumulator.current < step) return

    const dt = Math.min(simulationAccumulator.current, 0.05)
    simulationAccumulator.current = 0

    const list = particles.entities
    const particleBudget = Math.max(180, Math.floor(MAX_P * runtimeQuality.particleScale))
    const wispBudget = Math.max(40, Math.floor(MAX_WISP * Math.min(1, runtimeQuality.particleScale + 0.15)))
    material.size = 0.48 + runtimeQuality.particleScale * 0.12
    bigMaterial.size = 0.95 + runtimeQuality.particleScale * 0.2

    let n = 0
    let wn = 0
    const wPos = bigGeo.attributes.position.array as Float32Array
    const wCol = bigGeo.attributes.color.array as Float32Array

    for (let i = 0; i < list.length; i++) {
      const pt = list[i]
      pt.life = (pt.life ?? 0) - dt
      if (pt.life <= 0) {
        world.remove(pt)
        continue
      }

      pt.velocity.y -= 2.4 * dt
      const drag = Math.max(0, 1 - 1.6 * dt)
      pt.velocity.x *= drag
      pt.velocity.y *= drag
      pt.velocity.z *= drag
      pt.position.x += pt.velocity.x * dt
      pt.position.y += pt.velocity.y * dt
      pt.position.z += pt.velocity.z * dt

      if (pt.position.y < 0.04) {
        pt.position.y = 0.04
        pt.velocity.y *= -0.35
      }

      const f = Math.min(1, (pt.life / (pt.maxLife ?? 0.6)) * 1.6)
      const color = new THREE.Color(pt.colorHex ?? 0xffffff)
      color.multiplyScalar(f * 1.7)

      if (pt.wisp && wn < wispBudget) {
        wPos[wn * 3] = pt.position.x
        wPos[wn * 3 + 1] = pt.position.y
        wPos[wn * 3 + 2] = pt.position.z
        wCol[wn * 3] = color.r
        wCol[wn * 3 + 1] = color.g
        wCol[wn * 3 + 2] = color.b
        wn++
        pt.velocity.y += 3.4 * dt
      }

      if (n >= particleBudget) continue
      positions[n * 3] = pt.position.x
      positions[n * 3 + 1] = pt.position.y
      positions[n * 3 + 2] = pt.position.z
      colors[n * 3] = color.r
      colors[n * 3 + 1] = color.g
      colors[n * 3 + 2] = color.b
      n++
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
    geometry.setDrawRange(0, n)
    bigGeo.attributes.position.needsUpdate = true
    bigGeo.attributes.color.needsUpdate = true
    bigGeo.setDrawRange(0, wn)
  })

  return (
    <>
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
      <points ref={bigRef} geometry={bigGeo} material={bigMaterial} frustumCulled={false} />
    </>
  )
}
