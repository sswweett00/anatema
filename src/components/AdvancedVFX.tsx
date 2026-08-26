import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer, gameState } from '../ecs/world'
import { abilities, hasSynergy } from '../game/abilities'

const RINGS = 8
const ORBS = 32
const BURST = 40

const COLORS: Record<string, number> = {
  steel: 0xffb15c,
  arrows: 0xffd08a,
  nova: 0xff7138,
  orbit: 0xffa14d,
  chain: 0x7ad7ff,
  storm: 0xcfeeff,
  frost: 0x8fd8ff,
  vortex: 0xb276ff,
  spikes: 0xd0ad80,
  pyre: 0xff6330,
  phantom: 0xcfe4ff,
  venom: 0x72e089,
  heart: 0xff5d66,
  swift: 0xffc66f,
  armor: 0xc7b18c,
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

const ACTIVE: string[] = ['steel', 'arrows', 'nova', 'orbit', 'chain', 'storm', 'frost', 'vortex', 'spikes', 'pyre', 'phantom', 'venom']

function owned(): string[] {
  return Object.keys(abilities).filter((id) => abilities[id as keyof typeof abilities] > 0)
}

function dominant(): string {
  let best = 'steel'
  let value = 0
  for (const id of Object.keys(abilities)) {
    const level = abilities[id as keyof typeof abilities]
    if (level > value) {
      value = level
      best = id
    }
  }
  return best
}

export default function AdvancedVFX() {
  const ringRefs = useRef<(THREE.Mesh | null)[]>([])
  const orbRef = useRef<THREE.InstancedMesh>(null!)
  const burstRef = useRef<THREE.Points>(null!)
  const haloRef = useRef<THREE.Mesh>(null!)
  const coreRef = useRef<THREE.Mesh>(null!)

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const burstData = useMemo(() => ({
    positions: new Float32Array(BURST * 3),
    colors: new Float32Array(BURST * 3),
  }), [])

  const { ringGeo, ringMat, orbGeo, orbMat, burstGeo, burstMat } = useMemo(() => {
    const soft = new THREE.CanvasTexture(makeSoftTexture())
    return {
      ringGeo: new THREE.RingGeometry(1, 1.05, 64),
      ringMat: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      orbGeo: new THREE.IcosahedronGeometry(0.06, 0),
      orbMat: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
      burstGeo: (() => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(burstData.positions, 3))
        g.setAttribute('color', new THREE.BufferAttribute(burstData.colors, 3))
        return g
      })(),
      burstMat: new THREE.PointsMaterial({ size: 0.26, map: soft, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
    }
  }, [burstData])

  useFrame((state, dt) => {
    const p = getPlayer()
    if (!p) return
    const t = state.clock.elapsedTime
    const ids = owned()
    const count = ids.length
    const main = dominant()
    const intensity = Math.min(1.5, 0.35 + count * 0.055)
    const combo = Math.min(1.7, 1 + gameState.combo * 0.008)
    const speed = Math.hypot(p.velocity.x, p.velocity.z)

    color.setHex(COLORS[main] ?? COLORS.steel)
    const halo = haloRef.current.material as THREE.MeshBasicMaterial
    halo.color.copy(color)
    halo.opacity = 0.035 + Math.min(0.1, count * 0.008) + Math.min(0.12, gameState.combo * 0.002)
    haloRef.current.position.set(p.position.x, 0.65, p.position.z)
    haloRef.current.scale.setScalar((1.25 + intensity * 0.35) * combo)

    const core = coreRef.current.material as THREE.MeshBasicMaterial
    core.color.copy(color)
    core.opacity = 0.05 + Math.min(0.12, count * 0.008)
    coreRef.current.position.set(p.position.x, 0.7, p.position.z)
    coreRef.current.scale.setScalar(0.9 + Math.sin(t * 5.5) * 0.08 + speed * 0.02)
    coreRef.current.rotation.y += dt * (1.4 + count * 0.04)

    for (let i = 0; i < RINGS; i++) {
      const mesh = ringRefs.current[i]
      if (!mesh) continue
      const id = ids[i % Math.max(1, count)]
      const level = id ? abilities[id as keyof typeof abilities] : 0
      const active = id ? ACTIVE.includes(id) : false
      const c = COLORS[id] ?? COLORS.steel
      const phase = t * (0.18 + i * 0.045) + i * 0.9
      const radius = 1.35 + i * 0.42 + Math.min(1.1, level * 0.055)
      mesh.position.set(p.position.x, 0.05 + (i % 3) * 0.025, p.position.z)
      mesh.rotation.z = phase * (i % 2 ? -1 : 1)
      mesh.rotation.x = -Math.PI / 2
      mesh.scale.setScalar(radius * (1 + Math.sin(phase * 1.7) * 0.035))
      const material = mesh.material as THREE.MeshBasicMaterial
      material.color.setHex(c)
      const abilityGlow = active ? 0.08 : 0.035
      material.opacity = Math.min(0.16, abilityGlow + Math.min(0.07, level * 0.006))
    }

    for (let i = 0; i < ORBS; i++) {
      const angle = t * (0.45 + (i % 7) * 0.045) + i * (Math.PI * 2 / ORBS)
      const layer = i % Math.max(1, Math.min(6, count || 1))
      const abilityId = ids[layer] ?? main
      const level = abilities[abilityId as keyof typeof abilities] ?? 0
      const radius = 1.3 + layer * 0.34 + Math.min(1.0, level * 0.05)
      dummy.position.set(
        p.position.x + Math.cos(angle) * radius,
        0.55 + Math.sin(angle * 1.7 + i) * 0.18,
        p.position.z + Math.sin(angle) * radius,
      )
      const s = 0.45 + Math.min(0.65, level * 0.025) + (activeAbility(abilityId) ? 0.15 : 0)
      dummy.scale.setScalar(s)
      dummy.rotation.set(t * 2.2 + i, t * 1.4, t * 2.7)
      dummy.updateMatrix()
      orbRef.current.setMatrixAt(i, dummy.matrix)
      color.setHex(COLORS[abilityId] ?? COLORS.steel)
      orbMat.color.copy(color)
    }
    orbRef.current.instanceMatrix.needsUpdate = true

    // Dominant resonance spiral in the point layer.
    const positions = burstData.positions
    const colors = burstData.colors
    const resonance = resonanceColor(ids)
    const boost = 0.7 + Math.min(1.2, gameState.combo * 0.01)
    for (let i = 0; i < BURST; i++) {
      const a = t * (0.9 + i * 0.003) + i * 0.39
      const r = 0.9 + (i / BURST) * (2.2 + speed * 0.08)
      positions[i * 3] = p.position.x + Math.cos(a) * r
      positions[i * 3 + 1] = 0.25 + Math.sin(a * 1.7 + i) * 0.3
      positions[i * 3 + 2] = p.position.z + Math.sin(a) * r
      const pulse = 0.55 + Math.sin(t * 6 + i * 0.7) * 0.45
      colors[i * 3] = resonance.r * pulse * boost
      colors[i * 3 + 1] = resonance.g * pulse * boost
      colors[i * 3 + 2] = resonance.b * pulse * boost
    }
    ;(burstGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(burstGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true

    if (gameState.combo >= 30 || hasSynergy('exec') || hasSynergy('glacier') || hasSynergy('lord')) {
      const pulse = 0.5 + Math.sin(t * 8) * 0.5
      burstMat.opacity = 0.35 + pulse * 0.35
    } else {
      burstMat.opacity = 0.12
    }
  })

  return (
    <group>
      <mesh ref={haloRef} position={[0, 0.65, 0]}>
        <sphereGeometry args={[0.8, 24, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={coreRef} position={[0, 0.7, 0]}>
        <octahedronGeometry args={[0.24, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh key={i} ref={(mesh) => { ringRefs.current[i] = mesh }} geometry={ringGeo} material={ringMat} />
      ))}
      <instancedMesh ref={orbRef} args={[orbGeo, orbMat, ORBS]} frustumCulled={false} />
      <points ref={burstRef} geometry={burstGeo} material={burstMat} frustumCulled={false} />
    </group>
  )
}

function activeAbility(id: string) {
  return ACTIVE.includes(id)
}

function resonanceColor(ids: string[]) {
  const id = ids.includes('storm') ? 'storm' : ids.includes('frost') ? 'frost' : ids.includes('pyre') ? 'pyre' : ids.includes('venom') ? 'venom' : ids.includes('vortex') ? 'vortex' : ids[0] ?? 'steel'
  const c = new THREE.Color(COLORS[id] ?? COLORS.steel)
  return c
}

function makeSoftTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.6)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 32)
  return canvas
}
