import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  enemies,
  getPlayer,
  gameState,
  spawnEnemy,
  spawnBurst,
  setPhase,
  announce,
  world,
  ENEMY_KINDS,
  MAX_ENEMIES,
  type Entity,
} from '../ecs/world'
import { sfx } from '../game/audio'

/*
 * SÜRÜ SİSTEMİ — 3 canavar türü, 3 instancedMesh (3 draw-call).
 *   0 GOBLIN  — kulaklı, burunlu, zıplayan yeşil cüce
 *   1 İSKELET — kafatası + kaburga + bacaklar, kemik beyazı
 *   2 BALÇIK  — ezilip büzülen yarı saydam yeşil kubbe
 * Sürü sayısı zamanla büyür (sürekli doluş + 18 sn'de bir dalga patlaması).
 * Tüm ölüm/skor/kademe işlemleri burada merkezî yapılır.
 */

const WAVE_EVERY = 18
const WHITE = new THREE.Color('#ffffff')

/* ---------------- birleşik low-poly canavar geometrileri ---------------- */

function buildGoblinGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const torso = new THREE.SphereGeometry(0.17, 8, 6)
  torso.scale(1, 0.9, 0.85)
  torso.translate(0, 0.26, 0)
  parts.push(torso)
  const head = new THREE.SphereGeometry(0.13, 8, 6)
  head.translate(0, 0.48, 0)
  parts.push(head)
  const nose = new THREE.ConeGeometry(0.03, 0.11, 4)
  nose.rotateX(Math.PI / 2)
  nose.translate(0, 0.46, 0.17)
  parts.push(nose)
  const earL = new THREE.ConeGeometry(0.045, 0.19, 5)
  earL.rotateZ(1.15)
  earL.translate(-0.18, 0.53, 0)
  parts.push(earL)
  const earR = new THREE.ConeGeometry(0.045, 0.19, 5)
  earR.rotateZ(-1.15)
  earR.translate(0.18, 0.53, 0)
  parts.push(earR)
  const armL = new THREE.BoxGeometry(0.05, 0.2, 0.05)
  armL.rotateZ(0.3)
  armL.translate(-0.21, 0.25, 0)
  parts.push(armL)
  const armR = new THREE.BoxGeometry(0.05, 0.2, 0.05)
  armR.rotateZ(-0.3)
  armR.translate(0.21, 0.25, 0)
  parts.push(armR)
  const legL = new THREE.BoxGeometry(0.07, 0.13, 0.09)
  legL.translate(-0.08, 0.065, 0)
  parts.push(legL)
  const legR = new THREE.BoxGeometry(0.07, 0.13, 0.09)
  legR.translate(0.08, 0.065, 0)
  parts.push(legR)
  return mergeGeometries(parts)!
}

function buildSkeletonGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const legL = new THREE.CylinderGeometry(0.028, 0.02, 0.26, 5)
  legL.translate(-0.07, 0.13, 0)
  parts.push(legL)
  const legR = new THREE.CylinderGeometry(0.028, 0.02, 0.26, 5)
  legR.translate(0.07, 0.13, 0)
  parts.push(legR)
  const pelvis = new THREE.BoxGeometry(0.2, 0.08, 0.11)
  pelvis.translate(0, 0.3, 0)
  parts.push(pelvis)
  const spine = new THREE.CylinderGeometry(0.032, 0.045, 0.3, 5)
  spine.translate(0, 0.5, 0)
  parts.push(spine)
  const ribW = [0.24, 0.21, 0.17]
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.BoxGeometry(ribW[i], 0.028, 0.11)
    rib.translate(0, 0.6 - i * 0.07, 0.01)
    parts.push(rib)
  }
  const armL = new THREE.CylinderGeometry(0.022, 0.017, 0.3, 4)
  armL.rotateZ(0.2)
  armL.translate(-0.17, 0.47, 0)
  parts.push(armL)
  const armR = new THREE.CylinderGeometry(0.022, 0.017, 0.3, 4)
  armR.rotateZ(-0.2)
  armR.translate(0.17, 0.47, 0)
  parts.push(armR)
  const skull = new THREE.SphereGeometry(0.15, 8, 6)
  skull.translate(0, 0.78, 0)
  parts.push(skull)
  const jaw = new THREE.BoxGeometry(0.13, 0.05, 0.09)
  jaw.translate(0, 0.66, 0.04)
  parts.push(jaw)
  return mergeGeometries(parts)!
}

function buildSlimeGeo(): THREE.BufferGeometry {
  const dome = new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.scale(1, 0.68, 1) /* yükseklik ~0.23 — squash animasyonu buna göre */
  return dome
}

/* ---------------- bileşen ---------------- */

export default function EnemySwarm() {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([null, null, null])

  const { geos, mats } = useMemo(
    () => ({
      geos: [buildGoblinGeo(), buildSkeletonGeo(), buildSlimeGeo()],
      mats: [
        new THREE.MeshStandardMaterial({
          color: '#ffffff',
          roughness: 0.85,
          metalness: 0.05,
          flatShading: true,
        }),
        new THREE.MeshStandardMaterial({
          color: '#ffffff',
          roughness: 0.75,
          metalness: 0.05,
          flatShading: true,
        }),
        new THREE.MeshStandardMaterial({
          color: '#ffffff',
          roughness: 0.28,
          metalness: 0.08,
          flatShading: true,
          transparent: true,
          opacity: 0.82,
          emissive: new THREE.Color('#0e3b28'),
          emissiveIntensity: 0.55,
        }),
      ],
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
    for (const mesh of meshRefs.current) {
      if (!mesh) continue
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.count = 0
    }
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const player = getPlayer()
    const playing = gameState.phase === 'playing'

    /* ---------------- simülasyon ---------------- */
    if (playing && player) {
      gameState.time += dt

      /* ---- spawn direktörü: nüfus zamanla BÜYÜR ---- */
      const target = Math.min(MAX_ENEMIES, 120 + gameState.time * 8)
      const deficit = target - enemies.entities.length
      if (deficit > 0) {
        const budget = Math.min(deficit, 10)
        for (let i = 0; i < budget; i++) spawnEnemy(player.position)
      }

      /* ---- dalga patlaması ---- */
      gameState.waveTimer -= dt
      if (gameState.waveTimer <= 0) {
        gameState.waveTimer = WAVE_EVERY
        gameState.wave++
        const burst = Math.min(110, MAX_ENEMIES - enemies.entities.length)
        for (let i = 0; i < burst; i++) spawnEnemy(player.position)
        sfx.wave()
        announce(`SÜRÜ BÜYÜDÜ — DALGA ${gameState.wave}`)
      }

      /* ---- ölümler: merkezî skor / kademe / Kan Bağı ---- */
      tmp.remove.length = 0
      const list = enemies.entities
      for (let i = 0; i < list.length; i++) {
        const e = list[i]
        if (!e.dead) continue
        tmp.remove.push(e)
        gameState.kills++
        const kind = e.enemyKind ?? 0
        spawnBurst(e.position, ENEMY_KINDS[kind].color, kind === 2 ? 12 : 6, 4, 0.65)
        sfx.kill()
        /* Kan Bağı: her kesimde küçük can + duruş yenilenir */
        player.health = Math.min(player.maxHealth, player.health + 0.6)
        player.poise = Math.min(player.maxPoise, player.poise + 8)
        if (gameState.kills >= gameState.tier * 30 && gameState.tier < 7) {
          gameState.tier++
          gameState.tierFlash = 1
          sfx.tier()
        }
      }
      for (let i = 0; i < tmp.remove.length; i++) world.remove(tmp.remove[i])

      /* ---- hareket + temas ---- */
      tmp.remove.length = 0
      for (let i = 0; i < list.length; i++) {
        const e = list[i]
        if (e.dead) continue
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

        /* temas saldırısı (atılma sırasında dokunulmazlık geçer) */
        if (e.attackCooldown !== undefined && e.attackCooldown > 0) {
          e.attackCooldown -= dt
        }
        if (
          (player.invuln ?? 0) <= 0 &&
          d < e.radius + player.radius + 0.15 &&
          (e.attackCooldown ?? 0) <= 0
        ) {
          e.attackCooldown = 0.85
          const kind = e.enemyKind ?? 0
          const dmg = Math.max(1, (e.damage ?? 5) - player.armor)
          player.health -= dmg
          player.regenDelay = 0
          const poiseHit = kind === 2 ? 26 : kind === 1 ? 12 : 7
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

    /* ---------------- GPU'ya yaz (tür başına ayrı mesh) ---------------- */
    const counts = [0, 0, 0]
    const list = enemies.entities
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      const kind = e.enemyKind ?? 0
      const mesh = meshRefs.current[kind]
      const idx = counts[kind]
      if (!mesh || idx >= MAX_ENEMIES) continue

      const ph = e.phase ?? 0
      const s = (e.scale ?? 0.9) * Math.min(1, (e.age ?? 1) * 2.2)
      const flash = e.hitFlash ?? 0

      let y = 0
      tmp.dummy.rotation.set(0, 0, 0)
      tmp.dummy.scale.setScalar(Math.max(0.001, s * (1 + flash * 0.25)))

      if (kind === 0) {
        /* goblin: sekerek koşar, öne eğilir */
        y = Math.abs(Math.sin(t * 9 + ph)) * 0.16 * s
        tmp.dummy.rotation.x = 0.2
      } else if (kind === 1) {
        /* iskelet: kemik tıkırtısıyla hafif salınım */
        y = Math.abs(Math.sin(t * 6 + ph)) * 0.06 * s
        tmp.dummy.rotation.x = 0.06
      } else {
        /* balçık: squash & stretch + hoplama */
        const f = Math.abs(Math.sin(t * 4.5 + ph))
        const sy = s * (1 - 0.3 * f)
        const sxz = s * (1 + 0.22 * f)
        tmp.dummy.scale.set(
          Math.max(0.001, sxz * (1 + flash * 0.25)),
          Math.max(0.001, sy * (1 + flash * 0.25)),
          Math.max(0.001, sxz * (1 + flash * 0.25))
        )
        y = 0.02 + Math.abs(Math.sin(t * 3 + ph)) * 0.2 * s
      }

      /* hareket yönüne bak */
      const vx = e.velocity.x
      const vz = e.velocity.z
      if (vx * vx + vz * vz > 0.04) {
        tmp.dummy.rotation.y = Math.atan2(vx, vz)
      }

      tmp.dummy.position.set(e.position.x, y, e.position.z)
      tmp.dummy.updateMatrix()
      mesh.setMatrixAt(idx, tmp.dummy.matrix)

      tmp.base.setHex(ENEMY_KINDS[kind].color)
      tmp.color.copy(tmp.base).lerp(WHITE, flash * 0.85)
      mesh.setColorAt(idx, tmp.color)
      counts[kind]++
    }

    for (let k = 0; k < 3; k++) {
      const mesh = meshRefs.current[k]
      if (!mesh) continue
      mesh.count = counts[k]
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  return (
    <>
      {geos.map((geo, i) => (
        <instancedMesh
          key={i}
          ref={(m) => {
            meshRefs.current[i] = m
          }}
          args={[geo, mats[i], MAX_ENEMIES]}
          frustumCulled={false}
          castShadow
          receiveShadow
        />
      ))}
    </>
  )
}
