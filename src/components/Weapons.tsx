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
  type Entity,
} from '../ecs/world'
import { sfx } from '../game/audio'
import { pushDamage } from '../game/fx'
import {
  abilities,
  swordDamage,
  swordInterval,
  arrowCount,
  arrowDamage,
  arrowInterval,
  rollDamage,
} from '../game/abilities'
import { SpatialHash } from '../game/spatial'
import { applyStatus } from '../game/status_runtime'

const MAX_BULLETS = 320
const WEAPON_RANGE = 22
const SLASH_RANGE = 3.4
const ARC_POOL = 10
const COLLISION_RADIUS = 1.45

const _origin = new THREE.Vector3()
const weaponSpatial = new SpatialHash(2.6)

type Arc = { life: number; max: number }

function applyWeaponStatuses(target: Entity, sourceElement: 'physical' | 'fire'): void {
  if (abilities.pyre > 0) applyStatus(target, 'burn', 1 + abilities.pyre * 0.18, sourceElement === 'fire' ? 'fire' : 'physical')
  if (abilities.venom > 0) applyStatus(target, 'poison', 1 + abilities.venom * 0.16, 'poison')
  if (abilities.storm > 0) applyStatus(target, 'shock', 1 + abilities.storm * 0.12, 'shock')
  if (abilities.frost > 0) applyStatus(target, 'freeze', 1, 'ice')
  if (abilities.armor > 0) applyStatus(target, 'armor_break', Math.max(1, abilities.armor * 0.12), 'void')
}

export default function Weapons() {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const fireTimer = useRef(0)
  const slashTimer = useRef(0.5)
  const arcRefs = useRef<(THREE.Group | null)[]>([])
  const arcs = useRef<Arc[]>(Array.from({ length: ARC_POOL }, () => ({ life: 0, max: 0.26 })))

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
    [],
  )

  const tmp = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      dir: new THREE.Vector3(),
      removeBullets: [] as Entity[],
    }),
    [],
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
      const enemyList = enemies.entities
      weaponSpatial.build(enemyList)

      const best: Entity | null = weaponSpatial.nearest(player.position, WEAPON_RANGE, enemyList) ?? null
      const bestD2 = best ? best.position.distanceToSquared(player.position) : Infinity

      slashTimer.current -= dt
      if (slashTimer.current <= 0) {
        slashTimer.current = swordInterval()
        if (best && bestD2 < SLASH_RANGE * SLASH_RANGE) {
          const dx = best.position.x - player.position.x
          const dz = best.position.z - player.position.z
          const dLen = Math.sqrt(dx * dx + dz * dz) || 1
          player.facingX = dx / dLen
          player.facingZ = dz / dLen
          const yaw = Math.atan2(dx, dz)
          gameState.slashYaw = yaw
          gameState.slashAnim = 1

          const R2 = SLASH_RANGE * SLASH_RANGE
          for (let i = 0; i < enemyList.length; i++) {
            const e = enemyList[i]
            if (e.dead) continue
            const ex = e.position.x - player.position.x
            const ez = e.position.z - player.position.z
            const ed2 = ex * ex + ez * ez
            if (ed2 < R2) {
              const roll = rollDamage(swordDamage(), player)
              e.health -= Math.max(2, roll.value - e.armor)
              e.lastDmg = roll.value
              e.lastCrit = roll.crit
              applyWeaponStatuses(e, 'physical')
              if (roll.crit) {
                sfx.crit()
                spawnBurst(e.position, 0xfff1b8, 6, 4.5, 0.4)
                pushDamage(e.position.x, e.position.y, e.position.z, roll.value, true)
              }
              e.hitFlash = 1
              const ed = Math.sqrt(ed2) || 1
              e.velocity.x += (ex / ed) * 11
              e.velocity.z += (ez / ed) * 11
              if (e.health <= 0) e.dead = true
            }
          }

          for (let i = 0; i < ARC_POOL; i++) {
            if (arcs.current[i].life <= 0) {
              arcs.current[i].life = arcs.current[i].max
              const g = arcRefs.current[i]
              if (g) {
                g.visible = true
                g.position.set(player.position.x, 0.5, player.position.z)
                g.rotation.y = yaw
                g.scale.setScalar(0.4)
              }
              break
            }
          }

          gameState.shake = Math.min(1, gameState.shake + 0.2)
          sfx.slash()
          spawnBurst(
            _origin.set(
              player.position.x + (dx / dLen) * 1.6,
              0.4,
              player.position.z + (dz / dLen) * 1.6,
            ),
            0xffa14d,
            8,
            3.5,
            0.4,
          )
        }
      }

      fireTimer.current -= dt
      if (fireTimer.current <= 0) {
        fireTimer.current = arrowInterval()

        if (abilities.arrows > 0 && best && bullets.entities.length < MAX_BULLETS) {
          const shots = arrowCount()
          tmp.dir
            .set(best.position.x - player.position.x, 0, best.position.z - player.position.z)
            .normalize()
          const arrowRoll = rollDamage(arrowDamage(), player)
          const dmg = arrowRoll.value
          const pierce = abilities.arrows >= 4 ? 2 : 1
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

      tmp.removeBullets.length = 0
      const bl = bullets.entities

      for (let i = 0; i < bl.length; i++) {
        const b = bl[i]
        b.life = (b.life ?? 0) - dt
        if (b.life <= 0) {
          tmp.removeBullets.push(b)
          continue
        }
        b.position.addScaledVector(b.velocity, dt)

        let spent = false
        weaponSpatial.forEachNearby(b.position, COLLISION_RADIUS, enemyList, (e) => {
          if (spent || e.dead) return
          const dx = e.position.x - b.position.x
          const dz = e.position.z - b.position.z
          const rr = e.radius + b.radius
          if (dx * dx + dz * dz >= rr * rr) return

          const dmg = Math.max(1, (b.damage ?? 10) - e.armor)
          e.health -= dmg
          e.lastDmg = dmg
          e.lastCrit = false
          e.hitFlash = 1
          applyWeaponStatuses(e, abilities.pyre > 0 ? 'fire' : 'physical')
          e.velocity.addScaledVector(b.velocity, 0.09)
          sfx.hit()
          spawnBurst(b.position, 0xffa14d, 3, 3, 0.35)
          b.pierce = (b.pierce ?? 1) - 1
          if (e.health <= 0 && !e.dead) e.dead = true
          if (b.pierce <= 0) spent = true
        })

        if (spent) tmp.removeBullets.push(b)
      }

      for (let i = 0; i < tmp.removeBullets.length; i++) world.remove(tmp.removeBullets[i])
    }

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

    for (let i = 0; i < ARC_POOL; i++) {
      const a = arcs.current[i]
      const g = arcRefs.current[i]
      if (!g) continue
      if (a.life > 0) {
        a.life -= dt
        const p = 1 - Math.max(0, a.life) / a.max
        g.scale.setScalar(0.4 + p * 0.85)
        const m = (g.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial
        m.opacity = Math.pow(1 - p, 1.4) * 0.85
        if (a.life <= 0) g.visible = false
      }
    }
  })

  return (
    <>
      <instancedMesh ref={(m) => { meshRef.current = m! }} args={[geo, mat, MAX_BULLETS]} frustumCulled={false} />
      {Array.from({ length: ARC_POOL }, (_, i) => (
        <group key={i} visible={false} ref={(el) => { arcRefs.current[i] = el }}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.05, 3.15, 48, 1, -Math.PI / 2 - 1.0, 2.0]} />
            <meshBasicMaterial color="#ffb15c" transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}
