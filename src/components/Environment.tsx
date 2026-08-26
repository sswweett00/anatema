import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer } from '../ecs/world'

/*
 * Lanetli savaş alanı: sisli zemin, mezar taşları, kuru ağaçlar,
 * kül lekeleri, ayin halkası, meşaleler ve oyuncuyu izleyen ışık rigi.
 * Tüm yerleşimler tohumlu RNG ile deterministiktir.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Scatter = { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number] }

function scatter(count: number, seed: number, minY = 0): Scatter[] {
  const rnd = mulberry32(seed)
  const out: Scatter[] = []
  let guard = 0
  while (out.length < count && guard < count * 6) {
    guard++
    const x = (rnd() - 0.5) * 380
    const z = (rnd() - 0.5) * 380
    if (x * x + z * z < 64) continue /* spawn halkası temiz kalsın */
    out.push({
      pos: [x, minY, z],
      rot: [(rnd() - 0.5) * 0.25, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.25],
      scale: [1, 1, 1],
    })
  }
  return out
}

function useStaticInstances(
  items: Scatter[],
  scaleFn: (s: Scatter, i: number, rnd: () => number) => [number, number, number]
) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const rnd = mulberry32(9917)
    const dummy = new THREE.Object3D()
    items.forEach((s, i) => {
      dummy.position.set(...s.pos)
      dummy.rotation.set(...s.rot)
      dummy.scale.set(...scaleFn(s, i, rnd))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
  }, [items, scaleFn])
  return ref
}

/* ---------- meşale alevi (sahte ışık konisi + titreme) ---------- */

function Brazier({ position, light = false }: { position: [number, number, number]; light?: boolean }) {
  const flame = useRef<THREE.Mesh>(null!)
  const glow = useRef<THREE.PointLight>(null!)
  const seed = useMemo(() => Math.random() * 100, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const f = 1 + Math.sin(t * 13 + seed) * 0.22 + Math.sin(t * 29 + seed * 2) * 0.1
    if (flame.current) {
      flame.current.scale.set(0.9 + f * 0.12, f, 0.9 + f * 0.12)
      flame.current.rotation.y = t * 2 + seed
    }
    if (glow.current) {
      glow.current.intensity = 22 * f + 4
    }
  })

  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.07, 0.12, 0.7, 6]} />
        <meshStandardMaterial color="#241d17" metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.34, 0.18, 0.26, 8]} />
        <meshStandardMaterial color="#33281e" metalness={0.75} roughness={0.45} />
      </mesh>
      <mesh ref={flame} position={[0, 1.12, 0]}>
        <coneGeometry args={[0.17, 0.55, 7]} />
        <meshBasicMaterial color="#ff9a3d" toneMapped={false} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <coneGeometry args={[0.1, 0.3, 6]} />
        <meshBasicMaterial color="#ffe08a" toneMapped={false} />
      </mesh>
      {light && (
        <pointLight
          ref={glow}
          position={[0, 1.4, 0]}
          color="#ff8a3d"
          intensity={24}
          distance={26}
          decay={1.8}
        />
      )}
    </group>
  )
}

/* ---------- oyuncuyu izleyen ışık rigi ---------- */

function LightRig() {
  const dir = useRef<THREE.DirectionalLight>(null!)
  const spot = useRef<THREE.SpotLight>(null!)
  const spotTarget = useMemo(() => new THREE.Object3D(), [])
  const dirTarget = useMemo(() => new THREE.Object3D(), [])
  const wispA = useRef<THREE.PointLight>(null!)
  const wispB = useRef<THREE.PointLight>(null!)

  useEffect(() => {
    if (dir.current) dir.current.target = dirTarget
    if (spot.current) spot.current.target = spotTarget
  }, [dirTarget, spotTarget])

  useFrame((state) => {
    const p = getPlayer()
    if (!p) return
    const t = state.clock.elapsedTime
    dirTarget.position.copy(p.position)
    dir.current.position.set(p.position.x + 16, 26, p.position.z + 12)

    spotTarget.position.copy(p.position)
    spot.current.position.set(p.position.x, 24, p.position.z + 6)

    const f1 = 0.75 + Math.sin(t * 11) * 0.15 + Math.sin(t * 23) * 0.1
    const f2 = 0.75 + Math.sin(t * 13 + 2) * 0.15 + Math.sin(t * 19 + 1) * 0.1
    wispA.current.position.set(p.position.x + 1.7, 1.5, p.position.z + 0.9)
    wispB.current.position.set(p.position.x - 1.7, 1.3, p.position.z - 0.9)
    wispA.current.intensity = 16 * f1
    wispB.current.intensity = 16 * f2
  })

  return (
    <>
      <primitive object={dirTarget} />
      <primitive object={spotTarget} />
      <directionalLight
        ref={dir}
        color="#7d93a8"
        intensity={1.25}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={90}
        shadow-bias={-0.0006}
      />
      <spotLight
        ref={spot}
        color="#ff9a55"
        intensity={300}
        distance={80}
        angle={0.55}
        penumbra={0.8}
        decay={1.5}
      />
      <pointLight ref={wispA} color="#ff7a33" distance={15} decay={1.8} />
      <pointLight ref={wispB} color="#ff7a33" distance={15} decay={1.8} />
    </>
  )
}

/* ---------- ana ortam ---------- */

export default function Environment() {
  const stones = useMemo(() => scatter(260, 1337), [])
  const rocks = useMemo(() => scatter(130, 777), [])
  const trees = useMemo(() => scatter(90, 4242), [])
  const stains = useMemo(() => scatter(170, 999), [])

  const stoneRef = useStaticInstances(stones, useMemo(() => (_s: Scatter, _i: number, rnd: () => number) => [0.8 + rnd() * 0.5, 0.7 + rnd() * 1.1, 0.8 + rnd() * 0.5] as [number, number, number], []))
  const rockRef = useStaticInstances(rocks, useMemo(() => (_s: Scatter, _i: number, rnd: () => number) => { const v = 0.3 + rnd() * 0.7; return [v, v * 0.8, v] as [number, number, number] }, []))
  const treeRef = useStaticInstances(trees, useMemo(() => (_s: Scatter, _i: number, rnd: () => number) => [1, 0.8 + rnd() * 0.9, 1] as [number, number, number], []))
  const stainRef = useStaticInstances(stains, useMemo(() => (_s: Scatter, _i: number, rnd: () => number) => { const v = 0.9 + rnd() * 2.4; return [v, 1, v] as [number, number, number] }, []))

  const brazierSpots = useMemo(() => {
    const out: { pos: [number, number, number]; light: boolean }[] = []
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      out.push({
        pos: [Math.cos(a) * 10.5, 0, Math.sin(a) * 10.5],
        light: i % 3 === 0,
      })
    }
    return out
  }, [])

  return (
    <group>
      {/* zemin */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[540, 540]} />
        <meshStandardMaterial color="#191410" roughness={0.96} metalness={0} />
      </mesh>

      {/* ayin halkaları */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[5.4, 5.85, 72]} />
        <meshBasicMaterial color="#7a2c12" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[3.9, 4.05, 72]} />
        <meshBasicMaterial color="#d1662a" transparent opacity={0.28} toneMapped={false} />
      </mesh>

      {/* kül lekeleri */}
      <instancedMesh ref={stainRef} args={[undefined, undefined, stains.length]} frustumCulled={false} rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
        <circleGeometry args={[1, 18]} />
        <meshBasicMaterial color="#0e0b08" transparent opacity={0.85} />
      </instancedMesh>

      {/* mezar taşları */}
      <instancedMesh ref={stoneRef} args={[undefined, undefined, stones.length]} frustumCulled={false} castShadow receiveShadow>
        <boxGeometry args={[0.55, 1, 0.2]} />
        <meshStandardMaterial color="#2c2620" roughness={0.95} />
      </instancedMesh>

      {/* kayalar */}
      <instancedMesh ref={rockRef} args={[undefined, undefined, rocks.length]} frustumCulled={false} castShadow receiveShadow>
        <dodecahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial color="#241f1a" roughness={1} flatShading />
      </instancedMesh>

      {/* kuru ağaçlar */}
      <instancedMesh ref={treeRef} args={[undefined, undefined, trees.length]} frustumCulled={false} castShadow>
        <coneGeometry args={[0.1, 3.4, 5]} />
        <meshStandardMaterial color="#17110c" roughness={1} />
      </instancedMesh>

      {/* meşaleler */}
      {brazierSpots.map((b, i) => (
        <Brazier key={i} position={b.pos} light={b.light} />
      ))}

      {/* temel ışıklar */}
      <ambientLight color="#3a2c22" intensity={0.55} />
      <hemisphereLight args={['#3d3126', '#0b0806', 0.5]} />

      <LightRig />
    </group>
  )
}
