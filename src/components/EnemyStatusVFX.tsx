import { useMemo, useRef, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { enemies, gameState } from '../ecs/world'
import { softDotTexture, softRingTexture } from '../game/textures'

/* ------------------------------------------------------------------ */
/*  DÜŞMAN STATÜ 3D GÖRSEL EFEKTLERİ                                  */
 * Yanma: yükselen közler + zemin alev halkası
 * Ayaz/yavaşlama: dönen buz kristalleri + frost halkası
/* ------------------------------------------------------------------ */

const MAX_STATUS_INSTANCES = 600

export default function EnemyStatusVFX() {
  const fireEmbersMesh = useRef<THREE.InstancedMesh>(null!)
  const iceCrystalsMesh = useRef<THREE.InstancedMesh>(null!)
  const frostRingsMesh = useRef<THREE.InstancedMesh>(null!)
  const fireRingsMesh = useRef<THREE.InstancedMesh>(null!)

  const tex = useMemo(() => ({
    dot: softDotTexture(),
    ring: softRingTexture(),
  }), [])

  const tmp = useMemo(() => ({
    dummy: new THREE.Object3D(),
    color: new THREE.Color(),
    pos: new THREE.Vector3(),
  }), [])

  const emberGeo = useMemo(() => new THREE.DodecahedronGeometry(0.065, 0), [])
  const emberMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ff6611', toneMapped: false }),
    []
  )

  const crystalGeo = useMemo(() => {
    const geo = new THREE.OctahedronGeometry(0.12, 0)
    geo.scale(0.8, 1.8, 0.8)
    return geo
  }, [])
  const crystalMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: '#7dd3fc',
      emissive: new THREE.Color('#38bdf8'),
      emissiveIntensity: 0.85,
      roughness: 0.1,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88,
    }),
    []
  )

  const ringGeo = useMemo(() => new THREE.PlaneGeometry(1.4, 1.4), [])
  const frostRingMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      map: tex.ring,
      color: '#38bdf8',
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    [tex.ring]
  )
  const fireRingMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      map: tex.ring,
      color: '#ea580c',
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    [tex.ring]
  )

  useLayoutEffect(() => {
    for (const mesh of [fireEmbersMesh.current, iceCrystalsMesh.current, frostRingsMesh.current, fireRingsMesh.current]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.count = 0
    }
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const meshes = [fireEmbersMesh.current, iceCrystalsMesh.current, frostRingsMesh.current, fireRingsMesh.current]
    if (gameState.phase !== 'playing') {
      for (const mesh of meshes) mesh.count = 0
      return
    }

    let emberCount = 0
    let crystalCount = 0
    let frostRingCount = 0
    let fireRingCount = 0

    for (const e of enemies.entities) {
      if (e.dead && (e.dissolving ?? 0) >= 0.95) continue
      const isBurning = (e.burn ?? 0) > 0.05
      const isSlowed = (e.slow ?? 0) > 0.05
      const scale = e.scale ?? 1
      const radius = e.radius ?? 0.5
      const phase = e.phase ?? 0

      if (isBurning) {
        if (fireRingsMesh.current && fireRingCount < MAX_STATUS_INSTANCES) {
          tmp.dummy.position.set(e.position.x, 0.03, e.position.z)
          tmp.dummy.rotation.set(-Math.PI / 2, 0, t * 1.5 + phase)
          tmp.dummy.scale.setScalar(scale * (1.1 + Math.sin(t * 12 + phase) * 0.15))
          tmp.dummy.updateMatrix()
          fireRingsMesh.current.setMatrixAt(fireRingCount++, tmp.dummy.matrix)
        }

        if (fireEmbersMesh.current) {
          for (let j = 0; j < 3 && emberCount < MAX_STATUS_INSTANCES; j++) {
            const seed = phase + j * 2.1
            const emberAge = (t * 2.8 + seed) % 1
            const angle = seed * 3.7 + emberAge * 3
            const dist = radius * (0.3 + 0.5 * Math.sin(seed * 4))
            const ex = e.position.x + Math.cos(angle) * dist
            const ey = 0.15 + emberAge * (scale * 1.4) + Math.sin(t * 8 + seed) * 0.05
            const ez = e.position.z + Math.sin(angle) * dist
            tmp.dummy.position.set(ex, ey, ez)
            tmp.dummy.rotation.set(t * 5 + seed, t * 4, 0)
            tmp.dummy.scale.setScalar(Math.max(0.001, Math.sin(emberAge * Math.PI) * 1.2))
            tmp.dummy.updateMatrix()
            fireEmbersMesh.current.setMatrixAt(emberCount++, tmp.dummy.matrix)
          }
        }
      }

      if (isSlowed) {
        if (frostRingsMesh.current && frostRingCount < MAX_STATUS_INSTANCES) {
          tmp.dummy.position.set(e.position.x, 0.035, e.position.z)
          tmp.dummy.rotation.set(-Math.PI / 2, 0, -t * 0.8 + phase)
          tmp.dummy.scale.setScalar(scale * (1.15 + Math.sin(t * 4 + phase) * 0.08))
          tmp.dummy.updateMatrix()
          frostRingsMesh.current.setMatrixAt(frostRingCount++, tmp.dummy.matrix)
        }

        if (iceCrystalsMesh.current) {
          for (let k = 0; k < 3 && crystalCount < MAX_STATUS_INSTANCES; k++) {
            const angle = t * 2.2 + (k / 3) * Math.PI * 2 + phase
            const orbitR = radius * 1.25 + 0.08
            const cx = e.position.x + Math.cos(angle) * orbitR
            const cy = 0.35 + (k * 0.22) * scale + Math.sin(t * 5 + k + phase) * 0.08
            const cz = e.position.z + Math.sin(angle) * orbitR
            tmp.dummy.position.set(cx, cy, cz)
            tmp.dummy.rotation.set(0.3, -angle + Math.PI / 2, 0.4)
            tmp.dummy.scale.setScalar(0.9 * scale)
            tmp.dummy.updateMatrix()
            iceCrystalsMesh.current.setMatrixAt(crystalCount++, tmp.dummy.matrix)
          }
        }
      }
    }

    for (const mesh of [fireEmbersMesh.current, iceCrystalsMesh.current, frostRingsMesh.current, fireRingsMesh.current]) mesh.instanceMatrix.needsUpdate = true
    fireEmbersMesh.current.count = emberCount
    iceCrystalsMesh.current.count = crystalCount
    frostRingsMesh.current.count = frostRingCount
    fireRingsMesh.current.count = fireRingCount
  })

  return (
    <group>
      <instancedMesh ref={fireEmbersMesh} args={[emberGeo, emberMat, MAX_STATUS_INSTANCES]} frustumCulled={false} />
      <instancedMesh ref={iceCrystalsMesh} args={[crystalGeo, crystalMat, MAX_STATUS_INSTANCES]} frustumCulled={false} />
      <instancedMesh ref={frostRingsMesh} args={[ringGeo, frostRingMat, MAX_STATUS_INSTANCES]} frustumCulled={false} />
      <instancedMesh ref={fireRingsMesh} args={[ringGeo, fireRingMat, MAX_STATUS_INSTANCES]} frustumCulled={false} />
    </group>
  )
}
