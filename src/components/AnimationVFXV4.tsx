import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { enemies, gameState, getPlayer, type Entity } from '../ecs/world'
import { getCombatAnimationV4 } from '../game/combat_animation_v4'
import { getEnemyAnimationV4 } from '../game/enemy_animation_v4'
import { getPlayerAnimationV4 } from '../game/player_animation_v4'
import { getAnimationDirectorV4 } from '../game/animation_director_v4'
import { clamp01, finite, pulse, triangleWave } from '../game/animation_math_v4'

const MAX_ENEMIES = 256
const TRAIL_SAMPLES = 8
const FOOTPRINTS = 16
const RINGS = 8
const SPARKS = 32

interface TrailPoint {
  position: THREE.Vector3
  age: number
  alpha: number
  scale: number
}

function colorForEnemy(kind: number): THREE.Color {
  switch (kind) {
    case 0: return new THREE.Color('#8fc94f')
    case 1: return new THREE.Color('#e6d9bd')
    case 2: return new THREE.Color('#56d7a0')
    default: return new THREE.Color('#dca35f')
  }
}

function colorForState(state: string): THREE.Color {
  if (state === 'frozen') return new THREE.Color('#8fdcff')
  if (state === 'burning') return new THREE.Color('#ff6a32')
  if (state === 'boss') return new THREE.Color('#ff3f57')
  if (state === 'elite') return new THREE.Color('#ffc466')
  if (state === 'stagger') return new THREE.Color('#f4f0da')
  if (state === 'dead') return new THREE.Color('#8c6b5e')
  return new THREE.Color('#c58e60')
}

function makeRingGeometry(inner: number, outer: number, segments = 48): THREE.BufferGeometry {
  return new THREE.RingGeometry(inner, outer, segments)
}

export default function AnimationVFXV4() {
  const playerRing = useRef<THREE.Mesh>(null!)
  const attackArc = useRef<THREE.Mesh>(null!)
  const dashRing = useRef<THREE.Mesh>(null!)
  const deathRing = useRef<THREE.Mesh>(null!)
  const eliteMesh = useRef<THREE.InstancedMesh>(null!)
  const telegraphMesh = useRef<THREE.InstancedMesh>(null!)
  const deathMesh = useRef<THREE.InstancedMesh>(null!)
  const trailMesh = useRef<THREE.InstancedMesh>(null!)
  const footprintMesh = useRef<THREE.InstancedMesh>(null!)
  const sparkMesh = useRef<THREE.InstancedMesh>(null!)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const scratch2 = useMemo(() => new THREE.Vector3(), [])
  const trails = useMemo(() => new Map<Entity, TrailPoint[]>(), [])
  const trailIndex = useRef(0)
  const footprintIndex = useRef(0)
  const sparkIndex = useRef(0)
  const lastTime = useRef(0)
  const lastPlayer = useMemo(() => new THREE.Vector3(), [])

  const playerRingMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffae61',
    transparent: true,
    opacity: 0,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const attackMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffe2b5',
    transparent: true,
    opacity: 0,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const dashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#9ddcff',
    transparent: true,
    opacity: 0,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const deathMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#d58b63',
    transparent: true,
    opacity: 0,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const eliteMat = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const telegraphMat = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.32,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const deathEnemyMat = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.28,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const trailMat = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.22,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [])
  const footprintMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#c8926c',
    transparent: true,
    opacity: 0.15,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [])
  const sparkMat = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [])

  const ringGeo = useMemo(() => makeRingGeometry(0.55, 0.59), [])
  const attackGeo = useMemo(() => new THREE.RingGeometry(0.65, 0.7, 64, 1, -0.75, Math.PI * 1.5), [])
  const dashGeo = useMemo(() => makeRingGeometry(0.8, 0.86, 64), [])
  const deathGeo = useMemo(() => makeRingGeometry(0.7, 0.74, 64), [])
  const auraGeo = useMemo(() => makeRingGeometry(0.82, 0.88, 32), [])
  const telegraphGeo = useMemo(() => new THREE.RingGeometry(0.58, 0.62, 32), [])
  const trailGeo = useMemo(() => new THREE.CircleGeometry(0.16, 12), [])
  const footprintGeo = useMemo(() => new THREE.CircleGeometry(0.1, 10), [])
  const sparkGeo = useMemo(() => new THREE.OctahedronGeometry(0.055, 0), [])

  useLayoutEffect(() => {
    if (eliteMesh.current) eliteMesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    if (telegraphMesh.current) telegraphMesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    if (deathMesh.current) deathMesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    if (trailMesh.current) trailMesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    if (footprintMesh.current) footprintMesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    if (sparkMesh.current) sparkMesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }, [])

  function hideInstanced(mesh: THREE.InstancedMesh, index: number): void {
    dummy.position.set(0, -100, 0)
    dummy.scale.setScalar(0)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  }

  function writeTrail(points: TrailPoint[], mesh: THREE.InstancedMesh, base: number): number {
    let written = 0
    for (let i = 0; i < points.length && base + written < mesh.count; i++) {
      const point = points[i]
      const life = clamp01(1 - point.age / 0.32)
      if (life <= 0) continue
      dummy.position.copy(point.position)
      dummy.position.y += 0.04 + life * 0.18
      dummy.scale.setScalar(point.scale * (0.45 + life * 0.55))
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(base + written, dummy.matrix)
      color.setRGB(1, 0.38 + life * 0.35, 0.18 + life * 0.4)
      mesh.setColorAt(base + written, color)
      written++
    }
    return written
  }

  function pushPlayerTrail(position: THREE.Vector3, speed: number): void {
    if (speed < 2.5) return
    const player = getPlayer()
    if (!player) return
    const points = trails.get(player) ?? []
    points.unshift({ position: position.clone(), age: 0, alpha: 1, scale: clamp01(speed / 9) })
    if (points.length > TRAIL_SAMPLES) points.length = TRAIL_SAMPLES
    trails.set(player, points)
  }

  function updateTrails(dt: number): void {
    trailIndex.current = 0
    const mesh = trailMesh.current
    if (!mesh) return
    mesh.count = Math.min(TRAIL_SAMPLES, 1 + trails.size * TRAIL_SAMPLES)
    let offset = 0
    for (const points of trails.values()) {
      for (const point of points) point.age += dt
      offset += writeTrail(points, mesh, offset)
      if (offset >= mesh.count) break
    }
    for (let i = offset; i < mesh.count; i++) hideInstanced(mesh, i)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  function updatePlayerPresentation(t: number, dt: number): void {
    const player = getPlayer()
    if (!player) return
    const anim = getPlayerAnimationV4()
    const combat = getCombatAnimationV4()
    const director = getAnimationDirectorV4()
    const energy = clamp01(anim.speed / 8 + combat.intensity * 0.2)

    playerRing.current.position.set(player.position.x, 0.03, player.position.z)
    playerRing.current.scale.setScalar(1 + anim.dashWeight * 0.4 + combat.reaction * 0.22)
    playerRingMat.opacity = clamp01(0.05 + energy * 0.12 + combat.perfect * 0.18)

    attackArc.current.position.set(player.position.x, 0.82 + anim.additiveY, player.position.z)
    attackArc.current.rotation.set(-Math.PI / 2, anim.yaw + anim.shoulderYaw, 0)
    const attack = clamp01(anim.attackWeight + combat.impact * 0.2)
    attackArc.current.scale.setScalar(0.78 + attack * 0.65)
    attackMat.opacity = clamp01(attack * 0.66 + combat.critical * 0.3)

    dashRing.current.position.set(player.position.x, 0.035, player.position.z)
    dashRing.current.scale.setScalar(0.9 + anim.dashWeight * 2.8)
    dashRing.current.rotation.z = t * 2.2 + anim.yaw
    dashMat.opacity = clamp01(anim.dashWeight * 0.72 + anim.trailIntensity * 0.14)

    const dead = gameState.phase === 'dead'
    deathRing.current.position.set(player.position.x, 0.035, player.position.z)
    const deathProgress = dead ? clamp01(combat.finisher + anim.deathWeight) : 0
    deathRing.current.scale.setScalar(1 + deathProgress * 4.2)
    deathMat.opacity = dead ? clamp01(0.05 + deathProgress * 0.32) : 0

    if (director.globalMotion < 0.98) {
      playerRing.current.rotation.z = Math.sin(t * 2) * 0.03
    }
    pushPlayerTrail(player.position, anim.speed)
    if (lastPlayer.distanceToSquared(player.position) > 0.09) {
      if (anim.stride > 0.45 && (anim.footContactL > 0.85 || anim.footContactR > 0.85)) addFootprint(player.position, anim.yaw)
      lastPlayer.copy(player.position)
    }
    void dt
  }

  function addFootprint(position: THREE.Vector3, yaw: number): void {
    const mesh = footprintMesh.current
    if (!mesh) return
    const index = footprintIndex.current % FOOTPRINTS
    footprintIndex.current++
    dummy.position.copy(position)
    dummy.position.y = 0.02
    dummy.rotation.set(-Math.PI / 2, 0, yaw)
    dummy.scale.setScalar(0.8)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.instanceMatrix.needsUpdate = true
  }

  function updateEnemyPresentation(t: number, dt: number): void {
    const elite = eliteMesh.current
    const telegraph = telegraphMesh.current
    const deaths = deathMesh.current
    if (!elite || !telegraph || !deaths) return
    let eliteCount = 0
    let telegraphCount = 0
    let deathCount = 0
    const player = getPlayer()
    const pressure = getAnimationDirectorV4().enemy.pressure

    for (const entity of enemies.entities) {
      if (eliteCount >= MAX_ENEMIES || telegraphCount >= MAX_ENEMIES || deathCount >= MAX_ENEMIES) break
      const anim = getEnemyAnimationV4(entity)
      const distance = player ? entity.position.distanceTo(player.position) : 99
      const visibleDistance = distance < 50
      if (!visibleDistance && pressure > 0.8) continue

      if (anim.eliteWeight > 0.05) {
        dummy.position.set(entity.position.x, 0.035 + anim.hover, entity.position.z)
        dummy.rotation.set(-Math.PI / 2, 0, anim.yaw)
        const pulseValue = 1 + anim.aura * (0.15 + pulse(t + anim.secondary, 1.6) * 0.06)
        dummy.scale.setScalar((0.9 + anim.eliteWeight * 0.55) * pulseValue)
        dummy.updateMatrix()
        elite.setMatrixAt(eliteCount, dummy.matrix)
        color.copy(colorForState(anim.state))
        color.multiplyScalar(1.4)
        elite.setColorAt(eliteCount, color)
        eliteCount++
      }

      const isTelegraph = anim.state === 'attack' || anim.state === 'flank' || anim.recoilWeight > 0.5
      if (isTelegraph) {
        dummy.position.copy(entity.position)
        dummy.position.y = 0.04
        dummy.rotation.set(-Math.PI / 2, 0, anim.yaw)
        const pulseScale = 1.2 + Math.sin(t * 8 + anim.secondary * 4) * 0.12
        dummy.scale.setScalar(pulseScale * (1 + anim.attackWeight * 0.55))
        dummy.updateMatrix()
        telegraph.setMatrixAt(telegraphCount, dummy.matrix)
        color.copy(colorForEnemy(entity.enemyKind ?? 0))
        if (anim.state === 'attack') color.lerp(new THREE.Color('#ff5d49'), 0.65)
        telegraph.setColorAt(telegraphCount, color)
        telegraphCount++
      }

      if (anim.state === 'dead' && anim.deathWeight > 0.02) {
        dummy.position.copy(entity.position)
        dummy.position.y = 0.04 + anim.bob
        dummy.rotation.set(-Math.PI / 2, 0, anim.yaw)
        const size = Math.max(0.6, entity.radius * 2) * (1 + anim.deathWeight * 1.8)
        dummy.scale.setScalar(size)
        dummy.updateMatrix()
        deaths.setMatrixAt(deathCount, dummy.matrix)
        color.copy(colorForState('dead'))
        color.multiplyScalar(0.8 + (1 - anim.deathWeight) * 0.5)
        deaths.setColorAt(deathCount, color)
        deathCount++
      }
    }

    elite.count = eliteCount
    telegraph.count = telegraphCount
    deaths.count = deathCount
    elite.instanceMatrix.needsUpdate = true
    telegraph.instanceMatrix.needsUpdate = true
    deaths.instanceMatrix.needsUpdate = true
    if (elite.instanceColor) elite.instanceColor.needsUpdate = true
    if (telegraph.instanceColor) telegraph.instanceColor.needsUpdate = true
    if (deaths.instanceColor) deaths.instanceColor.needsUpdate = true
    void dt
  }

  function updateSparks(t: number, dt: number): void {
    const mesh = sparkMesh.current
    if (!mesh) return
    const combat = getCombatAnimationV4()
    const player = getPlayer()
    if (!player) return
    const amount = Math.min(SPARKS, Math.max(0, combat.sparkCount))
    mesh.count = amount
    const intensity = clamp01(combat.intensity + combat.critical * 0.6)
    for (let i = 0; i < amount; i++) {
      const seed = i * 1.713 + t * (1.5 + combat.trail * 2)
      const angle = seed * 2.399963
      const radius = 0.35 + (i % 7) * 0.12 + intensity * 1.2
      const vertical = Math.abs(Math.sin(seed * 1.7)) * (0.3 + intensity * 1.8)
      dummy.position.set(
        player.position.x + Math.cos(angle) * radius,
        0.22 + vertical,
        player.position.z + Math.sin(angle) * radius,
      )
      const scale = (0.45 + intensity * 0.8) * (0.6 + triangleWave(t + i * 0.03, 1.2) * 0.5)
      dummy.scale.setScalar(scale)
      dummy.rotation.set(t * 3 + i, t * 2 + i * 0.5, t * 4 - i)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      color.setRGB(1, 0.35 + intensity * 0.5, 0.12 + intensity * 0.7)
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    sparkIndex.current = (sparkIndex.current + 1) % 1000
    void dt
  }

  useFrame((frame, rawDt) => {
    const dt = Math.min(0.033, Math.max(0.001, rawDt))
    const t = frame.clock.elapsedTime
    updatePlayerPresentation(t, dt)
    updateEnemyPresentation(t, dt)
    updateTrails(dt)
    updateSparks(t, dt)
    lastTime.current = t
  })

  return (
    <group>
      <mesh ref={playerRing} rotation-x={-Math.PI / 2} material={playerRingMat}>
        <primitive object={ringGeo} attach="geometry" />
      </mesh>
      <mesh ref={attackArc} material={attackMat}>
        <primitive object={attackGeo} attach="geometry" />
      </mesh>
      <mesh ref={dashRing} rotation-x={-Math.PI / 2} material={dashMat}>
        <primitive object={dashGeo} attach="geometry" />
      </mesh>
      <mesh ref={deathRing} rotation-x={-Math.PI / 2} material={deathMat}>
        <primitive object={deathGeo} attach="geometry" />
      </mesh>
      <instancedMesh ref={eliteMesh} args={[auraGeo, eliteMat, MAX_ENEMIES]} frustumCulled={false} />
      <instancedMesh ref={telegraphMesh} args={[telegraphGeo, telegraphMat, MAX_ENEMIES]} frustumCulled={false} />
      <instancedMesh ref={deathMesh} args={[telegraphGeo, deathEnemyMat, MAX_ENEMIES]} frustumCulled={false} />
      <instancedMesh ref={trailMesh} args={[trailGeo, trailMat, TRAIL_SAMPLES * 4]} frustumCulled={false} />
      <instancedMesh ref={footprintMesh} args={[footprintGeo, footprintMat, FOOTPRINTS]} frustumCulled={false} />
      <instancedMesh ref={sparkMesh} args={[sparkGeo, sparkMat, SPARKS]} frustumCulled={false} />
    </group>
  )
}

export { colorForEnemy, colorForState }
