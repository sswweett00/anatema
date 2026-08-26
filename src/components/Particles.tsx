import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { particles, world, type Entity } from '../ecs/world'

/*
 * Kor / kıvılcım parçacık havuzu — tek instancedMesh.
 * Ölümlerde, vuruşlarda ve hasarlarda dünya buna parçacık ekler.
 */

const MAX_PARTICLES = 512
const WHITE = new THREE.Color('#ffffff')

export default function Particles() {
  const meshRef = useRef<THREE.InstancedMesh>(null!)

  const { geo, mat } = useMemo(
    () => ({
      geo: new THREE.TetrahedronGeometry(0.1, 0),
      mat: new THREE.MeshBasicMaterial({
        color: '#ffffff',
        toneMapped: false,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    }),
    []
  )

  const tmp = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      color: new THREE.Color(),
      remove: [] as Entity[],
    }),
    []
  )

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = performance.now() * 0.001
    const mesh = meshRef.current

    tmp.remove.length = 0
    const list = particles.entities
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      p.life = (p.life ?? 0) - dt
      if (p.life <= 0) {
        tmp.remove.push(p)
        continue
      }
      p.velocity.y -= 7.5 * dt
      p.velocity.multiplyScalar(Math.exp(-1.6 * dt))
      p.position.addScaledVector(p.velocity, dt)
      if (p.position.y < 0.03) {
        p.position.y = 0.03
        p.velocity.y *= -0.4
      }
    }
    for (let i = 0; i < tmp.remove.length; i++) world.remove(tmp.remove[i])

    const n = Math.min(particles.entities.length, MAX_PARTICLES)
    for (let i = 0; i < n; i++) {
      const p = particles.entities[i]
      const ratio = Math.max(0, (p.life ?? 0) / (p.maxLife ?? 1))
      tmp.dummy.position.copy(p.position)
      tmp.dummy.rotation.set(
        t * 6 + (p.spin ?? 0),
        t * 8 + (p.spin ?? 0),
        (p.spin ?? 0) * 0.5
      )
      tmp.dummy.scale.setScalar(Math.max(0.001, (p.radius ?? 0.08) * 5 * ratio))
      tmp.dummy.updateMatrix()
      mesh.setMatrixAt(i, tmp.dummy.matrix)

      tmp.color.setHex(p.colorHex ?? 0xff8a3d).lerp(WHITE, (1 - ratio) * 0.35)
      mesh.setColorAt(i, tmp.color)
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={(m) => {
        meshRef.current = m!
      }}
      args={[geo, mat, MAX_PARTICLES]}
      frustumCulled={false}
    />
  )
}
