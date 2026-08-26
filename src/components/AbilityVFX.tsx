import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer, gameState } from '../ecs/world'
import { abilities, hasSynergy } from '../game/abilities'

const MOTES = 96
const TRAILS = 24

const ABILITY_PALETTE: Record<string, number> = {
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

function colorForOwned(): number[] {
  return Object.keys(abilities)
    .filter((id) => abilities[id as keyof typeof abilities] > 0)
    .map((id) => ABILITY_PALETTE[id] ?? 0xffffff)
}

export default function AbilityVFX() {
  const pointsRef = useRef<THREE.Points>(null!)
  const trailRef = useRef<THREE.InstancedMesh>(null!)
  const pulseRef = useRef<THREE.Mesh>(null!)
  const ringRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)

  const points = useMemo(() => {
    const positions = new Float32Array(MOTES * 3)
    const colors = new Float32Array(MOTES * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return { geometry, positions, colors }
  }, [])

  const { moteMaterial, trailGeometry, trailMaterial } = useMemo(() => {
    const texture = new THREE.CanvasTexture(makeSoftTexture())
    texture.colorSpace = THREE.SRGBColorSpace
    return {
      moteMaterial: new THREE.PointsMaterial({
        size: 0.32,
        map: texture,
        vertexColors: true,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
      trailGeometry: new THREE.IcosahedronGeometry(0.055, 0),
      trailMaterial: new THREE.MeshBasicMaterial({
        color: '#ffb15c',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    }
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame((state) => {
    const player = getPlayer()
    if (!player) return
    const t = state.clock.elapsedTime
    const owned = colorForOwned()
    const ownedCount = owned.length
    const intensity = Math.min(1, ownedCount / 10)
    const moving = Math.hypot(player.velocity.x, player.velocity.z)
    const comboBoost = Math.min(0.5, gameState.combo * 0.012)
    const primary = owned[0] ?? ABILITY_PALETTE.steel

    color.setHex(primary)
    glowRef.current.scale.setScalar(1.65 + intensity * 0.55 + Math.sin(t * 4.2) * 0.07)
    const glowMaterial = glowRef.current.material as THREE.MeshBasicMaterial
    glowMaterial.color.copy(color)
    glowMaterial.opacity = 0.06 + intensity * 0.08 + comboBoost * 0.15

    pulseRef.current.position.copy(player.position).setY(0.08)
    pulseRef.current.scale.setScalar(Math.max(0.35, 0.8 + intensity * 0.25 + moving * 0.025 + Math.sin(t * 7) * 0.04))
    const pulseMaterial = pulseRef.current.material as THREE.MeshBasicMaterial
    pulseMaterial.color.copy(color)
    pulseMaterial.opacity = Math.min(0.24, 0.07 + intensity * 0.05 + comboBoost * 0.15)

    ringRef.current.position.copy(player.position).setY(0.03)
    ringRef.current.rotation.z = t * (0.35 + ownedCount * 0.04)
    ringRef.current.scale.setScalar(1.15 + Math.sin(t * 2.6) * 0.04 + (hasSynergy('dance') ? 0.12 : 0))
    const ringMaterial = ringRef.current.material as THREE.MeshBasicMaterial
    ringMaterial.color.copy(color)
    ringMaterial.opacity = 0.10 + Math.min(0.12, ownedCount * 0.008)

    const pos = points.positions
    const col = points.colors
    const ids = Object.keys(abilities)
    for (let i = 0; i < MOTES; i++) {
      const abilityIndex = ownedCount ? i % ownedCount : 0
      const abilityId = ids.find((id) => abilities[id as keyof typeof abilities] > 0) ?? 'steel'
      const c = owned[abilityIndex] ?? primary
      const level = abilityId in abilities ? abilities[abilityId as keyof typeof abilities] : 0
      const orbit = 1.0 + (abilityIndex % 6) * 0.32 + Math.min(1.2, level * 0.08)
      const speed = 0.45 + abilityIndex * 0.08
      const a = t * speed + i * (Math.PI * 2 / MOTES) * 4.3
      const wobble = Math.sin(t * 2.4 + i * 0.37) * 0.14
      pos[i * 3] = player.position.x + Math.cos(a) * (orbit + wobble)
      pos[i * 3 + 1] = 0.48 + Math.sin(a * 1.7 + i) * 0.25
      pos[i * 3 + 2] = player.position.z + Math.sin(a) * (orbit + wobble)
      color.setHex(c)
      const pulse = 0.65 + Math.sin(t * 5 + i) * 0.35
      col[i * 3] = color.r * pulse
      col[i * 3 + 1] = color.g * pulse
      col[i * 3 + 2] = color.b * pulse
    }
    ;(points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true

    const trailColor = color.setHex(owned[1] ?? primary)
    for (let i = 0; i < TRAILS; i++) {
      const f = i / TRAILS
      const lag = f * 1.5
      dummy.position.set(
        player.position.x - player.velocity.x * lag * 0.11,
        0.28 + Math.sin(t * 6 + i * 0.5) * 0.05,
        player.position.z - player.velocity.z * lag * 0.11,
      )
      const s = Math.max(0.025, (0.12 - f * 0.085) * (0.75 + moving * 0.12 + comboBoost))
      dummy.scale.setScalar(s)
      dummy.rotation.set(t * 2 + i, t * 1.5, t)
      dummy.updateMatrix()
      trailRef.current.setMatrixAt(i, dummy.matrix)
    }
    trailMaterial.color.copy(trailColor)
    trailMaterial.opacity = Math.min(0.65, moving * 0.09 + comboBoost + intensity * 0.04)
    trailRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <points ref={pointsRef} geometry={points.geometry} material={moteMaterial} frustumCulled={false} />
      <mesh ref={glowRef} position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.95, 20, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={pulseRef} position={[0, 0.08, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.25, 48]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ringRef} position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[1.65, 0.018, 6, 64]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh ref={trailRef} args={[trailGeometry, trailMaterial, TRAILS]} frustumCulled={false} />
    </group>
  )
}

function makeSoftTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.65)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 32)
  return canvas
}
