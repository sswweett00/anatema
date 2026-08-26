import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { particles, world } from '../ecs/world'
import { softDotTexture } from '../game/textures'

/*
 * PARÇACIKLAR — yumuşak ışıltılı noktalar (THREE.Points, tek draw-call).
 * Her parçacık kameraya dönük, additif ve renk başına ayarlı.
 * wisp=true olanlar "ruh" gibi yukarı süzülür (kesim efekti).
 */

const MAX_P = 900
const _color = new THREE.Color()

export default function Particles() {
  const pointsRef = useRef<THREE.Points>(null!)

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
        map: softDotTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    []
  )

  const bigMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 1.15,
        map: softDotTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    []
  )

  const bigRef = useRef<THREE.Points>(null!)
  const bigGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(160 * 3).fill(-9999)
    const col = new Float32Array(160 * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage))
    return geo
  }, [])

  useLayoutEffect(() => {
    geometry.setDrawRange(0, 0)
    bigGeo.setDrawRange(0, 0)
  }, [geometry, bigGeo])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const list = particles.entities
    let n = 0
    let wn = 0
    const wPos = bigGeo.attributes.position.array as Float32Array
    const wCol = bigGeo.attributes.color.array as Float32Array

    for (let i = 0; i < list.length && n < MAX_P; i++) {
      const pt = list[i]
      pt.life = (pt.life ?? 0) - dt
      if (pt.life <= 0) {
        world.remove(pt)
        continue
      }
      /* hafif yerçekimi + sürtünme */
      pt.velocity.y -= 2.4 * dt
      pt.velocity.multiplyScalar(1 - 1.6 * dt)
      pt.position.addScaledVector(pt.velocity, dt)
      if (pt.position.y < 0.04) {
        pt.position.y = 0.04
        pt.velocity.y *= -0.35
      }

      const f = Math.min(1, (pt.life / (pt.maxLife ?? 0.6)) * 1.6)
      _color.setHex(pt.colorHex ?? 0xffffff).multiplyScalar(f * 1.7)

      if (pt.wisp) {
        /* ruhlar yukarı süzülür, büyük katmanda çizilir */
        if (wn < 160) {
          wPos[wn * 3] = pt.position.x
          wPos[wn * 3 + 1] = pt.position.y
          wPos[wn * 3 + 2] = pt.position.z
          wCol[wn * 3] = _color.r
          wCol[wn * 3 + 1] = _color.g
          wCol[wn * 3 + 2] = _color.b
          wn++
        }
        pt.velocity.y += 3.4 * dt /* yukarı it */
      }

      positions[n * 3] = pt.position.x
      positions[n * 3 + 1] = pt.position.y
      positions[n * 3 + 2] = pt.position.z
      colors[n * 3] = _color.r
      colors[n * 3 + 1] = _color.g
      colors[n * 3 + 2] = _color.b
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
