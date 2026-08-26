import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  bullets,
  enemies,
  getPlayer,
  gameState,
  spawnBullet,
  spawnBurst,
  world,
  ENEMY_KINDS,
  type Entity,
} from '../ecs/world'
import { sfx } from '../game/audio'

/*
 * KÜL OKLARI — otomatik nişan alan okçu sistemi.
 * En yakın düşmana doğru salvo ateşler; mermiler tek instancedMesh.
 * Vuruş / ölüm / kademe ilerlemesi burada işlenir (hepsi mutatif ECS).
 */

const MAX_BULLETS = 320
const WEAPON_RANGE = 22

const _origin = new THREE.Vector3()

export default function Weapons() {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const fireTimer = useRef(0)

  const { geo, mat } = useMemo(
    () => ({
      geo: new THREE.OctahedronGeometry(0.15, 0),
      mat: new THREE.MeshBasicMaterial({
        color: '#ffb15c',
        toneMapped: false,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    }),
    []
  )

  const tmp = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      dir: new THREE.Vector3(),
      removeBullets: [] as Entity[],
      removeEnemies: [] as Entity[],
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

    if (playing && player) {
      const tier = gameState.tier
      const interval = Math.max(0.14, 0.32 - tier * 0.022)

      /* ---- otomatik salvo ---- */
      fireTimer.current -= dt
      if (fireTimer.current <= 0) {
        fireTimer.current = interval

        let best: Entity | null = null
        let bestD2 = WEAPON_RANGE * WEAPON_RANGE
        const el = enemies.entities
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          const dx = e.position.x - player.position.x
          const dz = e.position.z - player.position.z
          const d2 = dx * dx + dz * dz
          if (d2 < bestD2) {
            bestD2 = d2
            best = e
          }
        }

        if (best && bullets.entities.length < MAX_BULLETS) {
          const shots = Math.min(tier, 7)
          tmp.dir
            .set(best.position.x - player.position.x, 0, best.position.z - player.position.z)
            .normalize()
          const dmg = 8 + tier * 3
          const pierce = tier >= 5 ? 2 : 1
          _origin.copy(player.position)

          for (let s = 0; s < shots; s++) {
            const off = s - (shots - 1) / 2
            const angle = off * 0.13 + (Math.random() - 0.5) * 0.05
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            const dx = tmp.dir.x * cos - tmp.dir.z * sin
            const dz = tmp.dir.x * sin + tmp.dir.z * cos
            spawnBullet(_origin, dx, dz, dmg, pierce)
          }
          sfx.shoot()
        }
      }

      /* ---- mermi hareketi + çarpışma ---- */
      tmp.removeBullets.length = 0
      const bl = bullets.entities
      const el = enemies.entities

      for (let i = 0; i < bl.length; i++) {
        const b = bl[i]
        b.life = (b.life ?? 0) - dt
        if (b.life <= 0) {
          tmp.removeBullets.push(b)
          continue
        }
        b.position.addScaledVector(b.velocity, dt)

        let spent = false
        for (let j = 0; j < el.length; j++) {
          const e = el[j]
          if (e.dead) continue
          const dx = e.position.x - b.position.x
          const dz = e.position.z - b.position.z
          const rr = e.radius + b.radius
          if (dx * dx + dz * dz < rr * rr) {
            const dmg = Math.max(1, (b.damage ?? 10) - e.armor)
            e.health -= dmg
            e.hitFlash = 1
            e.velocity.addScaledVector(b.velocity, 0.09)
            sfx.hit()
            spawnBurst(b.position, 0xffa14d, 3, 3, 0.35)
            b.pierce = (b.pierce ?? 1) - 1
            if (e.health <= 0 && !e.dead) {
              e.dead = true
              tmp.removeEnemies.push(e)
            }
            if (b.pierce <= 0) {
              spent = true
              break
            }
          }
        }
        if (spent) tmp.removeBullets.push(b)
      }

      for (let i = 0; i < tmp.removeBullets.length; i++) {
        world.remove(tmp.removeBullets[i])
      }

      /* ---- ölümler: skor, kor patlaması, kademe ---- */
      for (let i = 0; i < tmp.removeEnemies.length; i++) {
        const e = tmp.removeEnemies[i]
        world.remove(e)
        gameState.kills++
        sfx.kill()
        const kind = e.enemyKind ?? 0
        spawnBurst(e.position, ENEMY_KINDS[kind].color, kind === 2 ? 14 : 7, 4.2, 0.7)

        if (gameState.kills >= gameState.tier * 30 && gameState.tier < 7) {
          gameState.tier++
          gameState.tierFlash = 1
          sfx.tier()
        }
      }
      tmp.removeEnemies.length = 0
    }

    /* ---- GPU'ya yaz ---- */
    const bl = bullets.entities
    const n = Math.min(bl.length, MAX_BULLETS)
    for (let i = 0; i < n; i++) {
      const b = bl[i]
      tmp.dummy.position.copy(b.position)
      tmp.dummy.rotation.set(t * 9 + (b.spin ?? 0), t * 12 + (b.spin ?? 0), 0)
      const s = Math.min(1, (b.life ?? 0) * 4)
      tmp.dummy.scale.set(Math.max(0.001, s), Math.max(0.001, s * 1.7), Math.max(0.001, s))
      tmp.dummy.updateMatrix()
      mesh.setMatrixAt(i, tmp.dummy.matrix)
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={(m) => {
        meshRef.current = m!
      }}
      args={[geo, mat, MAX_BULLETS]}
      frustumCulled={false}
    />
  )
}
