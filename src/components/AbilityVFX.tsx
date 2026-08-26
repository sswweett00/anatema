import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer, gameState } from '../ecs/world'
import { abilities, ABILITIES, MEND_DEF, hasSynergy, type AbilityId } from '../game/abilities'

const MAX_ABILITIES = 33
const MOTES = 128
const TRAILS = 32

const ABILITY_PALETTE: Record<AbilityId, number> = {
  steel: 0xffb15c,
  arrows: 0xffd08a,
  nova: 0xff7138,
  orbit: 0xffa14d,
  chain: 0x7ad7ff,
  storm: 0xc9eaff,
  frost: 0x8fd8ff,
  vortex: 0xff8f47,
  spikes: 0xd0ad80,
  pyre: 0xff6330,
  phantom: 0xcfe4ff,
  venom: 0x72e089,
  heart: 0xff5d52,
  swift: 0xffc66f,
  armor: 0xb8a28a,
  crit: 0xffe8a0,
  magnet: 0x9fddff,
  rage: 0xd52e38,
  vamp: 0xb32b42,
  stone: 0x8f8070,
  ghoststep: 0xa9a5ff,
  ferocity: 0xf0a05a,
  thorns: 0x8cae63,
  laststand: 0xffefaf,
  focus: 0x8fd2ff,
  momentum: 0xf2b871,
  adrenaline: 0xff6a52,
  bulwark: 0xc7b18c,
  greed: 0xffd15e,
  harvest: 0x77c58a,
  scholar: 0x7fc8ff,
  warlord: 0xcfa1ff,
  mend: 0x7de0a4,
}

const ABILITY_IDS: AbilityId[] = [
  ...ABILITIES.map((ability) => ability.id),
  MEND_DEF.id,
]

const ACTIVE_IDS = new Set(ABILITIES.filter((ability) => ability.type === 'AKTİF').map((ability) => ability.id))

interface VfxProfile {
  orbit: number
  height: number
  angularSpeed: number
  pulseSpeed: number
  scale: number
  phase: number
}

const PROFILE: Record<AbilityId, VfxProfile> = Object.fromEntries(
  ABILITY_IDS.map((id, index) => [
    id,
    {
      orbit: 1.35 + (index % 7) * 0.22,
      height: 0.42 + (index % 5) * 0.08,
      angularSpeed: 0.65 + (index % 6) * 0.13,
      pulseSpeed: 3.2 + (index % 5) * 0.55,
      scale: ACTIVE_IDS.has(id) ? 0.16 : 0.12,
      phase: index * 0.77,
    },
  ]),
) as Record<AbilityId, VfxProfile>

function makeSoftTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.68)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 32)
  return canvas
}

export default function AbilityVFX() {
  const moteRef = useRef<THREE.Points>(null!)
  const sigilRef = useRef<THREE.InstancedMesh>(null!)
  const coreRef = useRef<THREE.InstancedMesh>(null!)
  const trailRef = useRef<THREE.InstancedMesh>(null!)
  const pulseRef = useRef<THREE.Mesh>(null!)
  const ringRef = useRef<THREE.Mesh>(null!)
  const slashRef = useRef<THREE.Mesh>(null!)
  const dashRef = useRef<THREE.Mesh>(null!)

  const points = useMemo(() => {
    const positions = new Float32Array(MOTES * 3)
    const colors = new Float32Array(MOTES * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
    return { geometry, positions, colors }
  }, [])

  const texture = useMemo(() => {
    const value = new THREE.CanvasTexture(makeSoftTexture())
    value.colorSpace = THREE.SRGBColorSpace
    return value
  }, [])

  const moteMaterial = useMemo(() => new THREE.PointsMaterial({
    size: 0.34,
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }), [texture])

  const sigilGeometry = useMemo(() => new THREE.TorusGeometry(0.13, 0.018, 6, 18), [])
  const coreGeometry = useMemo(() => new THREE.OctahedronGeometry(0.075, 0), [])
  const trailGeometry = useMemo(() => new THREE.IcosahedronGeometry(0.055, 0), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const slashColor = useMemo(() => new THREE.Color(), [])

  const sigilMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  const coreMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  const trailMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffb15c',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame((state, rawDt) => {
    const player = getPlayer()
    if (!player) return

    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const p = player.position
    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    const comboBoost = Math.min(0.65, gameState.combo * 0.012)

    let ownedCount = 0
    let moteIndex = 0

    for (let abilityIndex = 0; abilityIndex < ABILITY_IDS.length; abilityIndex++) {
      const id = ABILITY_IDS[abilityIndex]
      const level = abilities[id]
      const owned = level > 0
      const profile = PROFILE[id]

      if (!owned) {
        dummy.scale.setScalar(0.00001)
        dummy.updateMatrix()
        sigilRef.current.setMatrixAt(abilityIndex, dummy.matrix)
        coreRef.current.setMatrixAt(abilityIndex, dummy.matrix)
        continue
      }

      ownedCount++
      const radius = profile.orbit + Math.min(1.8, level * 0.045)
      const angle = t * profile.angularSpeed + profile.phase + level * 0.03
      const wobble = Math.sin(t * profile.pulseSpeed + profile.phase) * 0.06
      const x = p.x + Math.cos(angle) * radius
      const z = p.z + Math.sin(angle) * radius
      const y = profile.height + Math.sin(t * 1.7 + profile.phase) * 0.07 + wobble
      const pulse = 0.78 + Math.sin(t * profile.pulseSpeed + profile.phase) * 0.22
      const levelScale = Math.min(1.8, 1 + level * 0.055)

      dummy.position.set(x, y, z)
      dummy.rotation.set(t * 1.4 + profile.phase, t * 1.7 + profile.phase, angle)
      dummy.scale.setScalar(profile.scale * levelScale * pulse)
      dummy.updateMatrix()
      sigilRef.current.setMatrixAt(abilityIndex, dummy.matrix)

      dummy.scale.setScalar(profile.scale * 0.72 * levelScale * (ACTIVE_IDS.has(id) ? 1.25 : 1))
      dummy.rotation.set(-t * 2.2, t * 1.8, -angle)
      dummy.position.y += 0.08
      dummy.updateMatrix()
      coreRef.current.setMatrixAt(abilityIndex, dummy.matrix)

      color.setHex(ABILITY_PALETTE[id])
      sigilRef.current.setColorAt(abilityIndex, color)
      color.multiplyScalar(ACTIVE_IDS.has(id) ? 1.65 : 1.15)
      coreRef.current.setColorAt(abilityIndex, color)

      for (let j = 0; j < 4 && moteIndex < MOTES; j++) {
        const a = angle + j * Math.PI * 0.5
        const r = radius * (0.72 + j * 0.04)
        const base = moteIndex * 3
        points.positions[base] = x + Math.cos(a) * r * 0.18
        points.positions[base + 1] = y + Math.sin(t * 3 + j + profile.phase) * 0.12
        points.positions[base + 2] = z + Math.sin(a) * r * 0.18
        const brightness = 0.55 + pulse * 0.65
        points.colors[base] = color.r * brightness
        points.colors[base + 1] = color.g * brightness
        points.colors[base + 2] = color.b * brightness
        moteIndex++
      }
    }

    for (; moteIndex < MOTES; moteIndex++) {
      const base = moteIndex * 3
      points.positions[base] = p.x
      points.positions[base + 1] = -999
      points.positions[base + 2] = p.z
      points.colors[base] = 0
      points.colors[base + 1] = 0
      points.colors[base + 2] = 0
    }

    ;(points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true
    sigilRef.current.instanceMatrix.needsUpdate = true
    coreRef.current.instanceMatrix.needsUpdate = true
    if (sigilRef.current.instanceColor) sigilRef.current.instanceColor.needsUpdate = true
    if (coreRef.current.instanceColor) coreRef.current.instanceColor.needsUpdate = true

    const intensity = Math.min(1, ownedCount / 10)
    const primary = ABILITY_PALETTE[ABILITY_IDS.find((id) => abilities[id] > 0) ?? 'steel']
    slashColor.setHex(primary)

    const pulseMaterial = pulseRef.current.material as THREE.MeshBasicMaterial
    pulseRef.current.position.set(p.x, 0.045, p.z)
    pulseRef.current.scale.setScalar(0.78 + intensity * 0.35 + Math.sin(t * 6.5) * 0.05)
    pulseMaterial.color.copy(slashColor)
    pulseMaterial.opacity = Math.min(0.28, 0.055 + intensity * 0.075 + comboBoost * 0.11)

    const ringMaterial = ringRef.current.material as THREE.MeshBasicMaterial
    ringRef.current.position.set(p.x, 0.035, p.z)
    ringRef.current.rotation.z += dt * (0.4 + ownedCount * 0.035)
    ringRef.current.scale.setScalar(1.08 + Math.sin(t * 2.2) * 0.035)
    ringMaterial.color.copy(slashColor)
    ringMaterial.opacity = 0.08 + Math.min(0.16, ownedCount * 0.006)

    const slash = Math.max(0, Math.min(1, gameState.slashAnim))
    const slashMaterial = slashRef.current.material as THREE.MeshBasicMaterial
    slashRef.current.position.set(p.x, 0.72, p.z)
    slashRef.current.rotation.y = gameState.slashYaw
    slashRef.current.scale.set(1.1 + (1 - slash) * 1.6, 0.45 + (1 - slash) * 0.45, 1)
    slashMaterial.color.setHex(ABILITY_PALETTE.steel)
    slashMaterial.opacity = slash > 0 ? Math.min(0.8, slash * 0.9 + 0.08) : 0

    const dashing = (player.dashTime ?? 0) > 0
    const dashMaterial = dashRef.current.material as THREE.MeshBasicMaterial
    dashRef.current.position.set(p.x, 0.54, p.z)
    dashRef.current.rotation.y = Math.atan2(player.velocity.x, player.velocity.z)
    dashRef.current.scale.set(1.2 + speed * 0.16, dashing ? 1.7 : 0.45, 1)
    dashMaterial.color.setHex(abilities.ghoststep > 0 ? ABILITY_PALETTE.ghoststep : ABILITY_PALETTE.swift)
    dashMaterial.opacity = dashing ? Math.min(0.7, 0.25 + speed * 0.025) : Math.min(0.16, speed * 0.012)

    const trailColor = color.setHex(primary)
    for (let i = 0; i < TRAILS; i++) {
      const f = i / TRAILS
      const lag = f * 1.8
      dummy.position.set(
        p.x - player.velocity.x * lag * 0.1,
        0.28 + Math.sin(t * 7 + i * 0.45) * 0.05,
        p.z - player.velocity.z * lag * 0.1,
      )
      const trailScale = Math.max(0.018, (0.11 - f * 0.085) * (0.65 + speed * 0.16 + comboBoost))
      dummy.scale.setScalar(trailScale)
      dummy.rotation.set(t * 2 + i, t * 1.5, t + i * 0.2)
      dummy.updateMatrix()
      trailRef.current.setMatrixAt(i, dummy.matrix)
    }
    trailRef.current.instanceMatrix.needsUpdate = true
    trailMaterial.color.copy(trailColor)
    trailMaterial.opacity = Math.min(0.62, speed * 0.075 + comboBoost * 0.8)
  })

  return (
    <group>
      <points ref={moteRef} geometry={points.geometry} material={moteMaterial} frustumCulled={false} />
      <instancedMesh ref={sigilRef} args={[sigilGeometry, sigilMaterial, MAX_ABILITIES]} frustumCulled={false} />
      <instancedMesh ref={coreRef} args={[coreGeometry, coreMaterial, MAX_ABILITIES]} frustumCulled={false} />
      <instancedMesh ref={trailRef} args={[trailGeometry, trailMaterial, TRAILS]} frustumCulled={false} />

      <mesh ref={pulseRef} position={[0, 0.045, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.3, 64]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>

      <mesh ref={ringRef} position={[0, 0.035, 0]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[1.72, 0.022, 8, 72]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>

      <mesh ref={slashRef} position={[0, 0.72, 0]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.82, 0.055, 8, 48, Math.PI * 1.35]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>

      <mesh ref={dashRef} position={[0, 0.54, 0]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[0.75, 2.8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}