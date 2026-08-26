import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  enemies,
  getPlayer,
  gameState,
  spawnEnemy,
  spawnBurst,
  setPhase,
  world,
  ENEMY_KINDS,
  type Entity,
} from '../ecs/world'
import { sfx } from '../game/audio'

/*
 * Sürü sistemi: 1.100+ düşman, TEK instancedMesh = TEK draw-call.
 * Tüm hareket / temas hasarı / GPU matris güncellemesi useFrame içinde,
 * React state'e dokunmadan yapılır.
 */

const MAX_INSTANCES = 2048
const TARGET_ALIVE = 1100
const WHITE = new THREE.Color('#ffffff')

export default function EnemySwarm() {
  const meshRef = useRef<THREE.InstancedMesh>(null!)

  const { geo, mat } = useMemo(
    () => ({
      geo: new THREE.IcosahedronGeometry(0.5, 0),
      mat: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.9,
        metalness: 0.12,
        flatShading: true,
      }),
    }),
    []
  )

  const tmp = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      color: new THREE.Color(),
      base: new THREE.Color(),
      dir: new THREE.Vector3(),
      side: new THREE.Vector3(),
      desired: new THREE.Vector3(),
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

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const mesh = meshRef.current
    const player = getPlayer()
    const playing = gameState.phase === 'playing'

    /* ---------------- simülasyon ---------------- */
    if (playing && player) {
      gameState.time += dt

      /* spawn direktörü: sürü sayısını hedefte tutar */
      const deficit = TARGET_ALIVE - enemies.entities.length
      if (deficit > 0) {
        const budget = Math.min(deficit, deficit > 400 ? 24 : 12)
        for (let i = 0; i < budget; i++) spawnEnemy(player.position)
      }

      tmp.remove.length = 0
      const list = enemies.entities
      for (let i = 0; i < list.length; i++) {
        const e = list[i]
        e.age = (e.age ?? 0) + dt

        tmp.dir.subVectors(player.position, e.position)
        tmp.dir.y = 0
        const d2 = tmp.dir.lengthSq()

        /* çok geride kalanları sürüden at (direktör yakına yeniden doğurur) */
        if (d2 > 6400) {
          tmp.remove.push(e)
          continue
        }

        const d = Math.sqrt(d2) || 0.001
        tmp.dir.divideScalar(d)

        /* teğetsel salınım — sürü olduğu yerde dönüp kaynasın */
        const swirl = Math.sin(t * 1.7 + (e.phase ?? 0)) * 0.55
        tmp.side.set(-tmp.dir.z, 0, tmp.dir.x).multiplyScalar(swirl)

        /* temas halkasında duraksama */
        const stop = Math.min(1, Math.max(0, (d - (e.radius + player.radius)) / 1.2))
        tmp.desired
          .copy(tmp.dir)
          .multiplyScalar(stop * e.speed)
          .addScaledVector(tmp.side, e.speed * 0.55)

        e.velocity.lerp(tmp.desired, 1 - Math.exp(-3.4 * dt))
        e.position.addScaledVector(e.velocity, dt)

        /* temas saldırısı */
        if (e.attackCooldown !== undefined && e.attackCooldown > 0) {
          e.attackCooldown -= dt
        }
        if (d < e.radius + player.radius + 0.15 && (e.attackCooldown ?? 0) <= 0) {
          e.attackCooldown = 0.85
          const dmg = Math.max(1, (e.damage ?? 5) - player.armor)
          player.health -= dmg
          player.regenDelay = 0
          const poiseHit = e.enemyKind === 2 ? 24 : 9
          player.poise = Math.max(0, player.poise - poiseHit)
          gameState.shake = Math.min(1, gameState.shake + 0.55)
          gameState.damageFlash = Math.min(1, gameState.damageFlash + 0.7)
          sfx.hurt()
          spawnBurst(player.position, 0xc22e1f, 5, 3.2, 0.45)
          e.velocity.addScaledVector(tmp.dir, -3.6)

          if (player.poise <= 0 && (!player.stagger || player.stagger <= 0)) {
            player.stagger = 1.15
            sfx.stagger()
            gameState.shake = 1
          }
          if (player.health <= 0) {
            player.health = 0
            sfx.die()
            setPhase('dead')
          }
        }

        if (e.hitFlash && e.hitFlash > 0) {
          e.hitFlash = Math.max(0, e.hitFlash - dt * 5)
        }
      }

      for (let i = 0; i < tmp.remove.length; i++) world.remove(tmp.remove[i])
    }

    /* ---------------- GPU'ya yaz ---------------- */
    const list = enemies.entities
    const n = Math.min(list.length, MAX_INSTANCES)
    for (let i = 0; i < n; i++) {
      const e = list[i]
      const kind = e.enemyKind ?? 0
      const scaleIn = Math.min(1, (e.age ?? 1) * 2.2)
      const bob = Math.sin(t * (3 + kind) + (e.phase ?? 0)) * 0.08
      const floatY = kind === 1 ? 0.32 : 0
      const s = (e.scale ?? 0.6) * scaleIn

      tmp.dummy.position.set(
        e.position.x,
        s * 0.5 + 0.08 + floatY + bob - (1 - scaleIn) * 0.5,
        e.position.z
      )
      tmp.dummy.rotation.set(
        (e.phase ?? 0) + t * 0.5,
        (e.phase ?? 0) * 1.7 + t * (0.7 + kind * 0.5),
        e.phase ?? 0
      )
      const flash = e.hitFlash ?? 0
      tmp.dummy.scale.setScalar(Math.max(0.001, s * (1 + flash * 0.3)))
      tmp.dummy.updateMatrix()
      mesh.setMatrixAt(i, tmp.dummy.matrix)

      tmp.base.setHex(ENEMY_KINDS[kind].color)
      tmp.color.copy(tmp.base).lerp(WHITE, flash * 0.85)
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
      args={[geo, mat, MAX_INSTANCES]}
      frustumCulled={false}
      castShadow
      receiveShadow
    />
  )
}
