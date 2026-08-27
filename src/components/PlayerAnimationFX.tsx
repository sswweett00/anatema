import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer, gameState } from '../ecs/world'
import AnimationVFXV4 from './AnimationVFXV4'

const AFTERIMAGES = 6
const FOOTSTEPS = 2

const afterGeo = new THREE.CapsuleGeometry(0.22, 0.68, 4, 8)
const footGeo = new THREE.CircleGeometry(0.18, 20)
const slashGeo = new THREE.TorusGeometry(0.86, 0.028, 6, 40, Math.PI * 1.22)

export default function PlayerAnimationFX() {
  const root = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Mesh>(null!)
  const slash = useRef<THREE.Mesh>(null!)
  const landing = useRef<THREE.Mesh>(null!)
  const feet = useRef<THREE.InstancedMesh>(null!)
  const ghosts = useRef<THREE.InstancedMesh>(null!)

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const ghostPositions = useMemo(() => Array.from({ length: AFTERIMAGES }, () => new THREE.Vector3()), [])
  const ghostRotations = useMemo(() => new Array(AFTERIMAGES).fill(0), [])
  const ghostAlpha = useMemo(() => new Float32Array(AFTERIMAGES), [])
  const footPhase = useRef(0)
  const previousDash = useRef(0)
  const previousDead = useRef(false)
  const hitSpring = useRef(0)
  const landingSpring = useRef(0)

  const ghostMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff9a4d',
    transparent: true,
    opacity: 0.16,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [])

  const footMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#d9a06d',
    transparent: true,
    opacity: 0.0,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [])

  const slashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffd7a3',
    transparent: true,
    opacity: 0,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])

  const landingMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffb15c',
    transparent: true,
    opacity: 0,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])

  useFrame((state, rawDt) => {
    const player = getPlayer()
    if (!player) return

    const dt = Math.min(0.033, Math.max(0.001, rawDt))
    const t = state.clock.elapsedTime
    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    const stride = THREE.MathUtils.clamp(speed / 6.5, 0, 1)
    const dash = THREE.MathUtils.clamp(player.dashTime ?? 0, 0, 0.16)
    const slashing = gameState.slashAnim > 0
    const dead = gameState.phase === 'dead'

    if (dead && !previousDead.current) landingSpring.current = 0.9
    previousDead.current = dead

    if (dash > previousDash.current + 0.001) {
      for (let i = AFTERIMAGES - 1; i > 0; i--) {
        ghostPositions[i].copy(ghostPositions[i - 1])
        ghostRotations[i] = ghostRotations[i - 1]
      }
      ghostPositions[0].copy(player.position)
      ghostRotations[0] = Math.atan2(player.velocity.x, player.velocity.z)
    }
    previousDash.current = dash

    root.current.position.copy(player.position)
    root.current.rotation.y = Math.atan2(player.facingX ?? player.velocity.x, player.facingZ ?? player.velocity.z)

    const idleBreath = 1 + Math.sin(t * 2.15) * (0.012 + (1 - stride) * 0.008)
    const lateralWeight = THREE.MathUtils.clamp(player.velocity.x * 0.022, -0.07, 0.07)
    const forwardWeight = THREE.MathUtils.clamp(player.velocity.z * 0.022, -0.07, 0.07)
    const dashLean = dash > 0 ? 0.18 * (dash / 0.16) : 0
    const attackLean = slashing ? 0.12 * (1 - gameState.slashAnim) : 0

    hitSpring.current = THREE.MathUtils.damp(hitSpring.current, Math.min(1, (gameState.damageFlash ?? 0) * 1.6), 22, dt)
    landingSpring.current = THREE.MathUtils.damp(landingSpring.current, 0, 7, dt)

    torso.current.scale.x = idleBreath * (1 + hitSpring.current * 0.08)
    torso.current.scale.y = (1 / idleBreath) * (1 + dashLean * 0.05 + attackLean * 0.04)
    torso.current.rotation.x = -dashLean - attackLean + forwardWeight * 0.5
    torso.current.rotation.z = -lateralWeight - hitSpring.current * 0.06

    footPhase.current += dt * (5.0 + stride * 12.0)
    const footOpacity = stride * 0.16
    const footSpread = 0.2
    for (let i = 0; i < FOOTSTEPS; i++) {
      const phase = footPhase.current + i * Math.PI
      const contact = Math.max(0, Math.sin(phase))
      const angle = root.current.rotation.y + (i === 0 ? Math.PI / 2 : -Math.PI / 2)
      const x = Math.cos(angle) * footSpread
      const z = Math.sin(angle) * footSpread
      dummy.position.set(player.position.x + x, 0.025, player.position.z + z)
      dummy.rotation.set(-Math.PI / 2, 0, root.current.rotation.y)
      dummy.scale.setScalar(0.45 + contact * 0.55)
      dummy.updateMatrix()
      feet.current.setMatrixAt(i, dummy.matrix)
    }
    feet.current.instanceMatrix.needsUpdate = true
    footMat.opacity = footOpacity

    slash.current.position.set(player.position.x, 0.82, player.position.z)
    slash.current.rotation.set(0, gameState.slashYaw, -Math.PI / 2)
    const slashProgress = slashing ? 1 - gameState.slashAnim : 0
    const slashPulse = Math.sin(Math.min(1, slashProgress) * Math.PI)
    slash.current.scale.setScalar(0.78 + slashProgress * 0.5)
    slashMat.opacity = slashing ? 0.4 * slashPulse : 0

    landing.current.position.set(player.position.x, 0.035, player.position.z)
    landing.current.scale.setScalar(0.8 + landingSpring.current * 2.7)
    landingMat.opacity = landingSpring.current * 0.2

    const hasDashAfterimage = dash > 0 || (dash === 0 && previousDash.current > 0.001)
    color.setHex(abilitiesColor(player))
    ghostMat.color.copy(color)

    for (let i = 0; i < AFTERIMAGES; i++) {
      const falloff = 1 - i / AFTERIMAGES
      const visible = hasDashAfterimage && ghostPositions[i].lengthSq() > 0
      ghostAlpha[i] = visible ? falloff * Math.min(0.75, dash / 0.16 + 0.08) : 0
      if (visible) {
        dummy.position.copy(ghostPositions[i]).setY(0.95 - i * 0.035)
        dummy.rotation.set(0, ghostRotations[i], 0)
        dummy.scale.set(1 + falloff * 0.05, 1 - i * 0.045, 1)
      } else {
        dummy.position.set(0, -100, 0)
        dummy.scale.setScalar(0)
      }
      dummy.updateMatrix()
      ghosts.current.setMatrixAt(i, dummy.matrix)
    }
    ghosts.current.instanceMatrix.needsUpdate = true
    ghostMat.opacity = Math.min(0.22, Math.max(...ghostAlpha) * 0.28)
  })

  return (
    <group ref={root}>
      <mesh ref={torso} position={[0, 0.9, 0]} scale={[1, 1, 1]}>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshBasicMaterial color="#ff9b61" transparent opacity={0.0} depthWrite={false} />
      </mesh>
      <instancedMesh ref={ghosts} args={[afterGeo, ghostMat, AFTERIMAGES]} frustumCulled={false} />
      <instancedMesh ref={feet} args={[footGeo, footMat, FOOTSTEPS]} frustumCulled={false} />
      <mesh ref={slash} geometry={slashGeo} material={slashMat} />
      <mesh ref={landing} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.7, 0.76, 48]} />
        <primitive object={landingMat} attach="material" />
      </mesh>
      <AnimationVFXV4 />
    </group>
  )
}

function abilitiesColor(player: { health: number; maxHealth: number }): number {
  const ratio = player.maxHealth > 0 ? player.health / player.maxHealth : 1
  if (ratio < 0.28) return 0xff4a46
  if (ratio < 0.55) return 0xff9a4d
  return 0xffc27a
}
