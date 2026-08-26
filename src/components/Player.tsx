import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { enemies, getPlayer, gameState, spawnBurst } from '../ecs/world'
import { useInput } from '../hooks/useInput'
import { sfx } from '../game/audio'
import {
  abilities,
  moveSpeed,
  armorValue,
  dashCooldownMax,
  regenRate,
  novaDamage,
  novaRadius,
  novaCooldown as novaCd,
  orbitCount,
} from '../game/abilities'

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
  const sword = useRef<THREE.Group>(null!)
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
    gameState.levelFlash = Math.max(0, gameState.levelFlash - dt * 0.7)
    gameState.flashNova = Math.max(0, gameState.flashNova - dt * 2.4)

    if (playing) {
      const k = keys.current
      const ix =
        (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0)
      const iy =
        (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)

      /* yeteneklerden türeyen değerler */
      p.speed = moveSpeed()
      p.armor = armorValue()

      /* yetenek zamanlayıcıları */
      p.dashCooldown = Math.max(0, (p.dashCooldown ?? 0) - dt)
      p.invuln = Math.max(0, (p.invuln ?? 0) - dt)
      p.novaCooldown = (p.novaCooldown ?? 8) - dt

      /* ---- ATILMA (BOŞLUK / SHIFT): kısa dokunulmazlık ---- */
      if (
        (k.Space || k.ShiftLeft || k.ShiftRight) &&
        (p.dashCooldown ?? 0) <= 0 &&
        (p.dashTime ?? 0) <= 0
      ) {
        let dx = p.facingX ?? 0
        let dz = p.facingZ ?? 1
        if (ix !== 0 || iy !== 0) {
          tmp.move
            .copy(FORWARD)
            .multiplyScalar(iy)
            .addScaledVector(RIGHT, ix)
            .normalize()
          dx = tmp.move.x
          dz = tmp.move.z
        }
        p.dashX = dx
        p.dashZ = dz
        p.dashTime = 0.16
        p.dashCooldown = dashCooldownMax()
        p.invuln = 0.32
        sfx.dash()
        spawnBurst(p.position, 0xff8a3d, 10, 3.4, 0.4)
      }

      tmp.move.set(0, 0, 0)
      if (ix !== 0 || iy !== 0) {
        tmp.move
          .copy(FORWARD)
          .multiplyScalar(iy)
          .addScaledVector(RIGHT, ix)
          .normalize()
        p.facingX = tmp.move.x
        p.facingZ = tmp.move.z
        const slowed = p.stagger && p.stagger > 0 ? 0.42 : 1
        tmp.move.multiplyScalar(p.speed * slowed)
      }

      if ((p.dashTime ?? 0) > 0) {
        p.dashTime = (p.dashTime ?? 0) - dt
        p.velocity.set((p.dashX ?? 0) * 24, 0, (p.dashZ ?? 0) * 24)
        spawnBurst(p.position, 0xffb15c, 2, 1.2, 0.26)
      } else {
        p.velocity.lerp(tmp.move, 1 - Math.exp(-14 * dt))
      }
      p.position.addScaledVector(p.velocity, dt)

      /* ---- KÜL FIRTINASI: yetenek seçildiyse otomatik halka dalgası ---- */
      if (abilities.nova > 0 && p.novaCooldown <= 0) {
        p.novaCooldown = novaCd()
        const R = novaRadius()
        const R2 = R * R
        const novaDmg = novaDamage()
        const el = enemies.entities
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const dx = e.position.x - p.position.x
          const dz = e.position.z - p.position.z
          const d2 = dx * dx + dz * dz
          if (d2 < R2) {
            e.health -= Math.max(1, novaDmg - e.armor)
            e.hitFlash = 1
            const d = Math.sqrt(d2) || 1
            e.velocity.x += (dx / d) * 15
            e.velocity.z += (dz / d) * 15
            if (e.health <= 0) e.dead = true
          }
        }
        gameState.flashNova = 1
        gameState.shake = Math.min(1, gameState.shake + 0.65)
        sfx.nova()
        spawnBurst(p.position, 0xff8a3d, 40, 6.5, 0.8)
        spawnBurst(p.position, 0xe6dcc8, 16, 4, 0.5)
      }

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
        p.health = Math.min(p.maxHealth, p.health + dt * regenRate())
      }
    } else {
      p.velocity.multiplyScalar(Math.exp(-6 * dt))
      p.position.addScaledVector(p.velocity, dt)
    }

    /* ---- görsel durum ---- */
    const speedAmt = Math.hypot(p.velocity.x, p.velocity.z)
    group.current.position.copy(p.position)

    /* dokunulmazlık sırasında titreyip sön */
    body.current.visible = !(
      (p.invuln ?? 0) > 0 && Math.floor(t * 22) % 2 === 0
    )

    /* savuruş sırasında hedefe, yoksa hareket yönüne bak */
    gameState.slashAnim = Math.max(0, gameState.slashAnim - dt * 3.2)
    const slashing = gameState.slashAnim > 0
    let yawTarget: number | null = null
    if (slashing) yawTarget = gameState.slashYaw
    else if (speedAmt > 0.4) yawTarget = Math.atan2(p.velocity.x, p.velocity.z)
    if (yawTarget !== null) {
      const cur = body.current.rotation.y
      const d = Math.atan2(Math.sin(yawTarget - cur), Math.cos(yawTarget - cur))
      body.current.rotation.y = cur + d * Math.min(1, (slashing ? 20 : 12) * dt)
    }

    /* büyük kılıç savuruş animasyonu */
    if (slashing) {
      const pr = 1 - gameState.slashAnim
      const ease = 1 - Math.pow(1 - pr, 3)
      sword.current.rotation.z = -1.35 + ease * 2.3
      sword.current.rotation.x = 0.25 - ease * 0.45
    } else {
      const cur = sword.current.rotation.z
      sword.current.rotation.z = cur + (-0.6 - cur) * Math.min(1, 8 * dt)
      sword.current.rotation.x = 0.25 + Math.sin(t * 2) * 0.04
    }

    body.current.position.y =
      Math.sin(t * 11) * 0.05 * Math.min(1, speedAmt / 4)
    cloak.current.rotation.x =
      0.28 + Math.sin(t * 9) * 0.05 * Math.min(1, speedAmt / 3)

    /* yörünge korları: yetenekle çoğalır, büyür ve hızlanır */
    const owned = abilities.orbit > 0
    const visCount = owned ? orbitCount() : 8
    const cinderScale = owned ? 0.13 : 0.055
    orbit.current.rotation.y = t * (owned ? 5 : 2.1)
    for (let i = 0; i < cinderRefs.current.length; i++) {
      const m = cinderRefs.current[i]
      if (!m) continue
      m.visible = i < visCount
      const s = cinderScale * (1 + Math.sin(t * 6 + i) * 0.2)
      m.scale.setScalar(s)
    }

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
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return [Math.cos(a) * 1.05, Math.sin(a * 3) * 0.12, Math.sin(a) * 1.05] as const
      }),
    []
  )
  const cinderRefs = useRef<(THREE.Mesh | null)[]>([])

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
        {/* BÜYÜK KILIÇ — Kül Şövalyesi'nin asıl silahı */}
        <group ref={sword} position={[0.44, 0.72, 0.08]} rotation={[-0.35, 0, -0.6]}>
          {/* kabza */}
          <mesh castShadow position={[0, -0.02, 0]}>
            <cylinderGeometry args={[0.042, 0.05, 0.34, 10]} />
            <meshStandardMaterial color="#3a2417" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.22, 0]}>
            <sphereGeometry args={[0.06, 12, 10]} />
            <meshStandardMaterial color="#8a6a3a" metalness={0.85} roughness={0.3} />
          </mesh>
          {/* siperlik */}
          <mesh castShadow position={[0, 0.18, 0]}>
            <boxGeometry args={[0.36, 0.07, 0.13]} />
            <meshStandardMaterial color="#8a6a3a" metalness={0.85} roughness={0.32} />
          </mesh>
          {/* namlu */}
          <mesh castShadow position={[0, 0.92, 0]}>
            <boxGeometry args={[0.17, 1.32, 0.05]} />
            <meshStandardMaterial color="#b8bcc2" metalness={0.92} roughness={0.22} />
          </mesh>
          {/* oluk */}
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.05, 1.15, 0.062]} />
            <meshStandardMaterial color="#6d737b" metalness={0.9} roughness={0.3} />
          </mesh>
          {/* sivri uç */}
          <mesh castShadow position={[0, 1.7, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.121, 0.3, 4]} />
            <meshStandardMaterial color="#b8bcc2" metalness={0.92} roughness={0.22} />
          </mesh>
          {/* kor ağız */}
          <mesh position={[0.088, 0.92, 0]}>
            <boxGeometry args={[0.018, 1.28, 0.052]} />
            <meshBasicMaterial color="#ff8a3d" toneMapped={false} />
          </mesh>
        </group>
        {/* yörünge korları */}
        <group ref={orbit} position={[0, 0.78, 0]}>
          {cinders.map((pos, i) => (
            <mesh
              key={i}
              ref={(el) => {
                cinderRefs.current[i] = el
              }}
              position={pos as unknown as [number, number, number]}
            >
              <octahedronGeometry args={[1, 0]} />
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
