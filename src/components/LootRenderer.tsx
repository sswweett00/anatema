import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { lootEntities } from '../ecs/world'

const MAX_LOOT = 96

export default function LootRenderer() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.18, 1), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.95 }), [])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const list = lootEntities.entities
    const now = state.clock.elapsedTime
    const count = Math.min(MAX_LOOT, list.length)
    for (let i = 0; i < count; i++) {
      const item = list[i]
      const pulse = 1 + Math.sin(now * 5 + i) * 0.12
      dummy.position.copy(item.position)
      dummy.rotation.set(now * 0.8, now * 1.1 + i * 0.23, now * 0.45)
      dummy.scale.setScalar((item.radius ?? 0.22) * 1.6 * pulse)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      color.setHex(item.colorHex ?? 0xffc56e)
      mesh.setColorAt(i, color)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, MAX_LOOT]} frustumCulled={false} />
}
