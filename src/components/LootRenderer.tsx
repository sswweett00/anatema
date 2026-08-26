import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { lootEntities } from '../ecs/world'

const MAX_LOOT = 96

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

export default function LootRenderer() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.18, 1), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.95, vertexColors: true }), [])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return

    try {
      const list = lootEntities.entities
      const now = Number.isFinite(state.clock.elapsedTime) ? state.clock.elapsedTime : 0
      const count = Math.min(MAX_LOOT, list.length)
      for (let i = 0; i < count; i++) {
        const item = list[i]
        const px = finite(item.position.x, 0)
        const py = finite(item.position.y, 0.18)
        const pz = finite(item.position.z, 0)
        const radius = Math.max(0.04, Math.min(1.5, finite(item.radius ?? 0.22, 0.22)))
        const pulse = 1 + Math.sin(now * 5 + i) * 0.12
        dummy.position.set(px, py, pz)
        dummy.rotation.set(now * 0.8, now * 1.1 + i * 0.23, now * 0.45)
        dummy.scale.setScalar(radius * 1.6 * pulse)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        color.setHex(finite(item.colorHex ?? 0xffc56e, 0xffc56e))
        mesh.setColorAt(i, color)
      }
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = count > 0
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = count > 0
    } catch (error) {
      console.error('[ANATHEMA] LootRenderer frame failed; draw suppressed for this frame', error)
      mesh.count = 0
    }
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, MAX_LOOT]} frustumCulled={false} />
}
