import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer, gameState } from '../ecs/world'
import { abilities, ABILITIES, MEND_DEF, type AbilityId } from '../game/abilities'
import { plasmaOrbTexture, magicalRuneCircleTexture } from '../game/textures'

const MAX_ABILITIES = 64
const MOTES = 192
const TRAILS = 36

const ABILITY_PALETTE: Record<AbilityId, number> = {
  steel: 0xffb74d,
  arrows: 0xffd54f,
  nova: 0xff5722,
  orbit: 0xff9800,
  chain: 0x00e5ff,
  storm: 0x38bdf8,
  frost: 0x67e8f9,
  vortex: 0xf97316,
  spikes: 0xd97706,
  pyre: 0xef4444,
  phantom: 0xa5b4fc,
  venom: 0x22c55e,
  heart: 0xf43f5e,
  swift: 0xfde047,
  armor: 0xa8a29e,
  crit: 0xfacc15,
  magnet: 0x38bdf8,
  rage: 0xdc2626,
  vamp: 0xe11d48,
  stone: 0x78716c,
  ghoststep: 0x818cf8,
  ferocity: 0xfb923c,
  thorns: 0x84cc16,
  laststand: 0xfef08a,
  focus: 0x60a5fa,
  momentum: 0xfbbf24,
  adrenaline: 0xf87171,
  bulwark: 0xd6d3d1,
  greed: 0xfacc15,
  harvest: 0x4ade80,
  scholar: 0x93c5fd,
  warlord: 0xc084fc,
  mend: 0x34d399,
  // Extended abilities
  meteor: 0xff4500,
  gravitywell: 0x9333ea,
  soulbolts: 0x06b6d4,
  bladestorm: 0x38bdf8,
  arcanemine: 0xec4899,
  bloodnova: 0xb91c1c,
  voidrift: 0x7e22ce,
  mirrors: 0x67e8f9,
  wolfpack: 0xe2e8f0,
  seismic: 0xb45309,
  runeprison: 0x0ea5e9,
  frostfire: 0x2dd4bf,
  ward: 0x60a5fa,
  overcharge: 0xfbbf24,
  executioner: 0xbe123c,
  berserker: 0xe11d48,
  resilience: 0x94a3b8,
  siphon: 0x10b981,
  evasion: 0xa78bfa,
  precision: 0x38bdf8,
  conduit: 0x06b6d4,
  detonation: 0xf97316,
  fortunesfavor: 0xfacc15,
  lifeforge: 0x14b8a6,
  aegis: 0xfcd34d,
  hemocraft: 0x991b1b,
  celerity: 0x38bdf8,
  deathsmark: 0x4c1d95,
  soulharvest: 0x059669,
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

  const points = useMemo(() => {
    const positions = new Float32Array(MOTES * 3)
    const colors = new Float32Array(MOTES * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
    return { geometry, positions, colors }
  }, [])

  const texture = useMemo(() => {
    return plasmaOrbTexture()
  }, [])

  const moteMaterial = useMemo(() => new THREE.PointsMaterial({
    size: 0.42,
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }), [texture])

  const sigilGeometry = useMemo(() => new THREE.OctahedronGeometry(0.09, 0), [])
  const coreGeometry = useMemo(() => new THREE.OctahedronGeometry(0.075, 0), [])
  const trailGeometry = useMemo(() => new THREE.IcosahedronGeometry(0.055, 0), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  const sigilMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
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

      color.setHex(ABILITY_PALETTE[id] ?? 0xffa14d)
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

    const primary = ABILITY_PALETTE[ABILITY_IDS.find((id) => abilities[id] > 0) ?? 'steel'] ?? 0xffb15c
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
    </group>
  )
}