import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer, gameState } from '../ecs/world'
import { useInput } from '../hooks/useInput'

/*
 * Kül Şövalyesi — izometrik kamera takibi + WASD hareketi.
 * Oyun durumu ECS'ten okunur; burada hiç React state yok.
 */

const CAM_OFFSET = new THREE.Vector3(21, 21, 21)
/* izometrik kameraya göre ekran yönleri (W = ekranın yukarısı) */
const FORWARD = new THREE.Vector3(-0.7071, 0, -0.7071)
const RIGHT = new THREE.Vector3(0.7071, 0, -0.7071)

export default function Player() {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const orbit = useRef<THREE.Group>(null!)
  const cloak = useRef<THREE.Mesh>(null!)
  const keys = useInput()
  const { camera, size } = useThree()

  const tmp = useMemo(
    () => ({
      move: new THREE.Vector3(),
      look: new THREE.Vector3(),
      camTarget: new THREE.Vector3(),
      menuPos: new THREE.Vector3(),
    }),
    []
  )

  useFrame((state, rawDt) => {
    const p = getPlayer()
    if (!p) return
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const playing = gameState.phase === 'playing'

    /* ekran efektlerinin sönümlenmesi */
    gameState.shake = Math.max(0, gameState.shake - dt * 2.1)
    gameState.damageFlash = Math.max(0, gameState.damageFlash - dt * 2.6)
    gameState.tierFlash = Math.max(0, gameState.tierFlash - dt * 0.7)

    if (playing) {
      const k = keys.current
      const ix =
        (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0)
      const iy =
        (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)

      tmp.move.set(0, 0, 0)
      if (ix !== 0 || iy !== 0) {
        tmp.move
          .copy(FORWARD)
          .multiplyScalar(iy)
          .addScaledVector(RIGHT, ix)
          .normalize()
        const slowed = p.stagger && p.stagger > 0 ? 0.42 : 1
        tmp.move.multiplyScalar(p.speed * slowed)
      }
      p.velocity.lerp(tmp.move, 1 - Math.exp(-14 * dt))
      p.position.addScaledVector(p.velocity, dt)

      /* duruş (poise) kırıldıysa sersemleme */
      if (p.stagger && p.stagger > 0) {
        p.stagger -= dt
        if (p.stagger <= 0) {
          p.stagger = 0
          p.poise = p.maxPoise
        }
      }

      /* hasar almadıysa yavaş rejenerasyon */
      p.regenDelay = (p.regenDelay ?? 0) + dt
      if (p.regenDelay > 4) {
        p.health = Math.min(p.maxHealth, p.health + dt * 3)
      }

      /* zırh kadrana göre sertleşir */
      p.armor = 2 + Math.floor(gameState.tier / 2)
    } else {
      p.velocity.multiplyScalar(Math.exp(-6 * dt))
      p.position.addScaledVector(p.velocity, dt)
    }

    /* ---- görsel durum ---- */
    const speedAmt = Math.hypot(p.velocity.x, p.velocity.z)
    group.current.position.copy(p.position)

    if (speedAmt > 0.4) {
      const targetYaw = Math.atan2(p.velocity.x, p.velocity.z)
      const cur = body.current.rotation.y
      const d = Math.atan2(Math.sin(targetYaw - cur), Math.cos(targetYaw - cur))
      body.current.rotation.y = cur + d * Math.min(1, 12 * dt)
    }
    body.current.position.y =
      Math.sin(t * 11) * 0.05 * Math.min(1, speedAmt / 4)
    cloak.current.rotation.x =
      0.28 + Math.sin(t * 9) * 0.05 * Math.min(1, speedAmt / 3)
    orbit.current.rotation.y = t * 2.1

    /* ölünce yere seril */
    const fallen = gameState.phase === 'dead' ? Math.PI / 2.2 : 0
    group.current.rotation.x +=
      (fallen - group.current.rotation.x) * Math.min(1, 5 * dt)

    /* ---- kamera ---- */
    const cam = camera as THREE.OrthographicCamera
    if (cam.isOrthographicCamera) {
      const targetZoom = THREE.MathUtils.clamp(Math.min(size.width, size.height) / 16, 28, 60)
      if (Math.abs(cam.zoom - targetZoom) > 0.05) {
        cam.zoom = targetZoom
        cam.updateProjectionMatrix()
      }
    }

    if (gameState.phase === 'menu') {
      tmp.menuPos.set(Math.sin(t * 0.12) * 19, 18, Math.cos(t * 0.12) * 19)
      camera.position.lerp(tmp.menuPos, 1 - Math.exp(-1.2 * dt))
      camera.lookAt(0, 0, 0)
    } else {
      tmp.camTarget.copy(p.position).add(CAM_OFFSET)
      if (gameState.shake > 0) {
        const s = gameState.shake
        tmp.camTarget.x += (Math.random() - 0.5) * s * 1.2
        tmp.camTarget.y += (Math.random() - 0.5) * s * 0.7
        tmp.camTarget.z += (Math.random() - 0.5) * s * 1.2
      }
      camera.position.lerp(tmp.camTarget, 1 - Math.exp(-7 * dt))
      tmp.look.copy(p.position)
      tmp.look.y = 0
      camera.lookAt(tmp.look)
    }
  })

  const cinders = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2
        return [Math.cos(a) * 0.95, Math.sin(a * 3) * 0.12, Math.sin(a) * 0.95] as const
      }),
    []
  )

  return (
    <group ref={group}>
      <group ref={body}>
        {/* gövde — kül zırhı */}
        <mesh castShadow position={[0, 0.52, 0]}>
          <capsuleGeometry args={[0.32, 0.55, 6, 12]} />
          <meshStandardMaterial color="#454b52" metalness={0.78} roughness={0.36} />
        </mesh>
        {/* miğfer */}
        <mesh castShadow position={[0, 1.14, 0]}>
          <sphereGeometry args={[0.2, 12, 10]} />
          <meshStandardMaterial color="#2c3136" metalness={0.85} roughness={0.28} />
        </mesh>
        <mesh position={[0, 1.18, 0.16]}>
          <boxGeometry args={[0.22, 0.05, 0.08]} />
          <meshBasicMaterial color="#ff7a2e" toneMapped={false} />
        </mesh>
        <mesh position={[0, 1.36, 0]} rotation={[0.2, 0, 0]}>
          <coneGeometry args={[0.07, 0.32, 6]} />
          <meshStandardMaterial color="#7a2c12" roughness={0.9} />
        </mesh>
        {/* omuzluklar */}
        <mesh castShadow position={[0.38, 0.88, 0]}>
          <boxGeometry args={[0.28, 0.17, 0.36]} />
          <meshStandardMaterial color="#343a40" metalness={0.8} roughness={0.34} />
        </mesh>
        <mesh castShadow position={[-0.38, 0.88, 0]}>
          <boxGeometry args={[0.28, 0.17, 0.36]} />
          <meshStandardMaterial color="#343a40" metalness={0.8} roughness={0.34} />
        </mesh>
        {/* pelerin */}
        <mesh ref={cloak} castShadow position={[0, 0.58, -0.24]} rotation={[0.28, 0, 0]}>
          <coneGeometry args={[0.44, 1.1, 8, 1, true]} />
          <meshStandardMaterial color="#1a110a" roughness={1} side={THREE.DoubleSide} />
        </mesh>
        {/* göğüsteki kor kalp */}
        <mesh position={[0, 0.74, 0.3]}>
          <octahedronGeometry args={[0.1, 0]} />
          <meshBasicMaterial color="#ff7a2e" toneMapped={false} />
        </mesh>
        <pointLight
          position={[0, 0.85, 0.4]}
          color="#ff6a2a"
          intensity={6}
          distance={8}
          decay={1.8}
        />
        {/* yörünge korları */}
        <group ref={orbit} position={[0, 0.78, 0]}>
          {cinders.map((pos, i) => (
            <mesh key={i} position={pos as unknown as [number, number, number]}>
              <octahedronGeometry args={[0.055, 0]} />
              <meshBasicMaterial
                color={i % 2 ? '#ff8a3d' : '#d1662a'}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}
