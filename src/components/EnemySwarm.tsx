import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergePainted } from '../game/mergeGeo'
import {
  enemies,
  getPlayer,
  gameState,
  spawnEnemy,
  spawnBurst,
  spawnWisp,
  setPhase,
  announce,
  world,
  ENEMY_KINDS,
  MAX_ENEMIES,
  type Entity,
} from '../ecs/world'
import { sfx } from '../game/audio'
import { pushSoul, pushDamage } from '../game/fx'
import {
  abilities,
  hasSynergy,
  XP_VALUES,
  xpForLevel,
  xpMultiplier,
  orbitDamage,
  orbitRadius,
  rollDamage,
  vampHealPct,
  stoneReduction,
} from '../game/abilities'

/*
 * SÜRÜ SİSTEMİ — 3 canavar türü, 3 instancedMesh (3 draw-call).
 *   0 GOBLIN  — sivri kulaklı, kulplu sopalı, sarı gözlü yeşil cüce
 *   1 İSKELET — kafatası, kavisli kaburgalar, paslı kılıç, köz göz çukurları
 *   2 BALÇIK  — yarı saydam kubbe, içinde ışıklı çekirdek, squash & stretch
 * Yüksek segmentli pürüzsüz geometriler + parça başına vertex renkleri.
 * Sürü ÇOK AZ başlar, zamanla kabarır; 28 sn'de bir dalga patlaması gelir.
 */

const WAVE_EVERY = 28
const WHITE = new THREE.Color('#ffffff')
const FLASH = new THREE.Color(3, 3, 3) /* HDR beyaz — vuruş flaşı */
const HDR_WHITE = new THREE.Color(3, 3, 3)
const FROST_TINT = new THREE.Color('#8fd0ff')
let orbitTimer = 0

/* ---------------- yardımcılar ---------------- */

/* Bir geometriyi tek renge boyar (vertex colors) + organik parlaklık titreşimi */
function paint(geo: THREE.BufferGeometry, hex: number | string, bright = 1): THREE.BufferGeometry {
  const c = new THREE.Color(hex).multiplyScalar(bright)
  const count = geo.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const v = 0.9 + (((i * 2654435761) >>> 0) % 100) / 100 * 0.2
    colors[i * 3] = c.r * v
    colors[i * 3 + 1] = c.g * v
    colors[i * 3 + 2] = c.b * v
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

/* ---------------- GOBLIN ---------------- */

function buildGoblinGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const SKIN = 0x6f9e3f
  const SKIN_DARK = 0x557c2e
  const PALE = 0xa8c977

  const legL = new THREE.CylinderGeometry(0.045, 0.038, 0.17, 10)
  legL.translate(-0.08, 0.085, 0)
  parts.push(paint(legL, SKIN_DARK))
  const legR = new THREE.CylinderGeometry(0.045, 0.038, 0.17, 10)
  legR.translate(0.08, 0.085, 0)
  parts.push(paint(legR, SKIN_DARK))
  const footL = new THREE.SphereGeometry(0.055, 10, 8)
  footL.scale(1.15, 0.65, 1.5)
  footL.translate(-0.08, 0.03, 0.03)
  parts.push(paint(footL, SKIN_DARK))
  const footR = new THREE.SphereGeometry(0.055, 10, 8)
  footR.scale(1.15, 0.65, 1.5)
  footR.translate(0.08, 0.03, 0.03)
  parts.push(paint(footR, SKIN_DARK))

  const torso = new THREE.SphereGeometry(0.17, 20, 14)
  torso.scale(1, 0.92, 0.85)
  torso.translate(0, 0.3, 0)
  parts.push(paint(torso, SKIN))
  const belly = new THREE.SphereGeometry(0.12, 16, 12)
  belly.scale(0.95, 0.78, 0.62)
  belly.translate(0, 0.26, 0.075)
  parts.push(paint(belly, PALE))

  const armL = new THREE.CylinderGeometry(0.032, 0.026, 0.2, 10)
  armL.rotateZ(0.35)
  armL.translate(-0.21, 0.28, 0)
  parts.push(paint(armL, SKIN))
  const handL = new THREE.SphereGeometry(0.035, 10, 8)
  handL.translate(-0.25, 0.19, 0)
  parts.push(paint(handL, SKIN_DARK))

  const armR = new THREE.CylinderGeometry(0.032, 0.026, 0.2, 10)
  armR.rotateZ(-0.5)
  armR.translate(0.22, 0.3, 0.02)
  parts.push(paint(armR, SKIN))
  const handR = new THREE.SphereGeometry(0.035, 10, 8)
  handR.translate(0.28, 0.22, 0.05)
  parts.push(paint(handR, SKIN_DARK))

  /* sopa */
  const clubHandle = new THREE.CylinderGeometry(0.018, 0.024, 0.26, 8)
  clubHandle.rotateZ(-0.9)
  clubHandle.translate(0.34, 0.3, 0.05)
  parts.push(paint(clubHandle, 0x5a3b22))
  const clubHead = new THREE.SphereGeometry(0.068, 12, 10)
  clubHead.scale(1, 1.3, 1)
  clubHead.translate(0.44, 0.38, 0.05)
  parts.push(paint(clubHead, 0x452c18))

  const head = new THREE.SphereGeometry(0.135, 20, 14)
  head.scale(1.02, 0.95, 1)
  head.translate(0, 0.53, 0)
  parts.push(paint(head, SKIN))
  const nose = new THREE.ConeGeometry(0.034, 0.15, 10)
  nose.rotateX(Math.PI / 2)
  nose.translate(0, 0.5, 0.19)
  parts.push(paint(nose, SKIN_DARK))
  const earL = new THREE.ConeGeometry(0.048, 0.24, 10)
  earL.rotateZ(1.18)
  earL.translate(-0.2, 0.58, 0)
  parts.push(paint(earL, SKIN))
  const earR = new THREE.ConeGeometry(0.048, 0.24, 10)
  earR.rotateZ(-1.18)
  earR.translate(0.2, 0.58, 0)
  parts.push(paint(earR, SKIN))

  /* parlayan sarı gözler (HDR parlaklık) */
  const eyeL = new THREE.SphereGeometry(0.028, 10, 8)
  eyeL.translate(-0.055, 0.56, 0.115)
  parts.push(paint(eyeL, new THREE.Color(2.4, 1.9, 0.35).getHex(), 1))
  const eyeR = new THREE.SphereGeometry(0.028, 10, 8)
  eyeR.translate(0.055, 0.56, 0.115)
  parts.push(paint(eyeR, new THREE.Color(2.4, 1.9, 0.35).getHex(), 1))

  return mergePainted(parts)
}

/* ---------------- İSKELET ---------------- */

function buildSkeletonGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const BONE = 0xd9cfb4
  const BONE_DARK = 0xb3a78a
  const RUST = 0x8a4a2a

  const legL = new THREE.CylinderGeometry(0.03, 0.022, 0.3, 10)
  legL.translate(-0.07, 0.15, 0)
  parts.push(paint(legL, BONE_DARK))
  const legR = new THREE.CylinderGeometry(0.03, 0.022, 0.3, 10)
  legR.translate(0.07, 0.15, 0)
  parts.push(paint(legR, BONE_DARK))
  const footL = new THREE.BoxGeometry(0.06, 0.028, 0.13)
  footL.translate(-0.07, 0.015, 0.03)
  parts.push(paint(footL, BONE_DARK))
  const footR = new THREE.BoxGeometry(0.06, 0.028, 0.13)
  footR.translate(0.07, 0.015, 0.03)
  parts.push(paint(footR, BONE_DARK))

  const pelvis = new THREE.SphereGeometry(0.1, 14, 10)
  pelvis.scale(1.15, 0.55, 0.8)
  pelvis.translate(0, 0.33, 0)
  parts.push(paint(pelvis, BONE))

  const spine = new THREE.CylinderGeometry(0.034, 0.042, 0.32, 10)
  spine.translate(0, 0.53, 0)
  parts.push(paint(spine, BONE_DARK))
  for (let i = 0; i < 3; i++) {
    const vert = new THREE.SphereGeometry(0.046, 10, 8)
    vert.scale(1, 0.6, 1)
    vert.translate(0, 0.42 + i * 0.1, 0)
    parts.push(paint(vert, BONE))
  }

  /* kavisli kaburgalar (yarım torus) */
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.TorusGeometry(0.13 - i * 0.022, 0.014, 8, 18, Math.PI)
    rib.rotateX(Math.PI / 2)
    rib.translate(0, 0.66 - i * 0.075, 0)
    parts.push(paint(rib, BONE))
  }

  const armL = new THREE.CylinderGeometry(0.024, 0.018, 0.3, 10)
  armL.rotateZ(0.3)
  armL.translate(-0.19, 0.5, 0)
  parts.push(paint(armL, BONE_DARK))
  const handL = new THREE.SphereGeometry(0.03, 8, 8)
  handL.translate(-0.24, 0.37, 0)
  parts.push(paint(handL, BONE))
  const armR = new THREE.CylinderGeometry(0.024, 0.018, 0.3, 10)
  armR.rotateZ(-0.35)
  armR.translate(0.19, 0.5, 0.02)
  parts.push(paint(armR, BONE_DARK))
  const handR = new THREE.SphereGeometry(0.03, 8, 8)
  handR.translate(0.25, 0.38, 0.05)
  parts.push(paint(handR, BONE))

  /* paslı kılıç */
  const blade = new THREE.BoxGeometry(0.035, 0.42, 0.012)
  blade.rotateZ(-0.35)
  blade.translate(0.34, 0.56, 0.05)
  parts.push(paint(blade, RUST))
  const guard = new THREE.BoxGeometry(0.11, 0.022, 0.03)
  guard.rotateZ(-0.35)
  guard.translate(0.28, 0.42, 0.05)
  parts.push(paint(guard, 0x4a3220))

  const skull = new THREE.SphereGeometry(0.155, 20, 16)
  skull.scale(0.95, 1.02, 1)
  skull.translate(0, 0.84, 0)
  parts.push(paint(skull, BONE))
  const jaw = new THREE.BoxGeometry(0.14, 0.055, 0.1)
  jaw.translate(0, 0.71, 0.04)
  parts.push(paint(jaw, BONE_DARK))

  /* köz gibi göz çukurları */
  const socketL = new THREE.SphereGeometry(0.034, 10, 8)
  socketL.translate(-0.06, 0.86, 0.125)
  parts.push(paint(socketL, new THREE.Color(2.6, 0.9, 0.15).getHex(), 1))
  const socketR = new THREE.SphereGeometry(0.034, 10, 8)
  socketR.translate(0.06, 0.86, 0.125)
  parts.push(paint(socketR, new THREE.Color(2.6, 0.9, 0.15).getHex(), 1))

  return mergePainted(parts)
}

/* ---------------- BALÇIK ---------------- */

function buildSlimeGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const dome = new THREE.SphereGeometry(0.34, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.scale(1, 0.72, 1)
  parts.push(paint(dome, 0x3fbf82))

  /* dip halkası */
  const rim = new THREE.TorusGeometry(0.325, 0.032, 10, 30)
  rim.rotateX(Math.PI / 2)
  rim.translate(0, 0.025, 0)
  parts.push(paint(rim, 0x2c8f60))

  /* içindeki ışıklı çekirdek */
  const core = new THREE.SphereGeometry(0.15, 20, 14)
  core.scale(1, 0.85, 1)
  core.translate(0, 0.13, 0)
  parts.push(paint(core, new THREE.Color(0.9, 2.2, 1.5).getHex(), 1))

  /* gözler */
  const eyeL = new THREE.SphereGeometry(0.045, 12, 10)
  eyeL.scale(1, 1.25, 0.7)
  eyeL.translate(-0.1, 0.2, 0.245)
  parts.push(paint(eyeL, 0x0e2e20))
  const eyeR = new THREE.SphereGeometry(0.045, 12, 10)
  eyeR.scale(1, 1.25, 0.7)
  eyeR.translate(0.1, 0.2, 0.245)
  parts.push(paint(eyeR, 0x0e2e20))

  return mergePainted(parts)
}

/* ---------------- bileşen ---------------- */

export default function EnemySwarm() {
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([null, null, null])
  const milestone = useRef(0)

  const { geos, mats } = useMemo(
    () => ({
      geos: [buildGoblinGeo(), buildSkeletonGeo(), buildSlimeGeo()],
      mats: [
        new THREE.MeshStandardMaterial({
          color: '#ffffff',
          vertexColors: true,
          roughness: 0.8,
          metalness: 0.04,
        }),
        new THREE.MeshStandardMaterial({
          color: '#ffffff',
          vertexColors: true,
          roughness: 0.62,
          metalness: 0.08,
        }),
        new THREE.MeshStandardMaterial({
          color: '#ffffff',
          vertexColors: true,
          roughness: 0.18,
          metalness: 0.05,
          transparent: true,
          opacity: 0.8,
          emissive: new THREE.Color('#0e3b28'),
          emissiveIntensity: 0.4,
        }),
      ],
    }),
    []
  )

  const tmp = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      color: new THREE.Color(),
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

      /* kombo penceresi kapanırsa sayaç sıfırlanır */
      if (gameState.comboTimer > 0) {
        gameState.comboTimer -= dt
        if (gameState.comboTimer <= 0) gameState.combo = 0
      }

      /* ---- spawn direktörü: ÇOK AZ başlar, zamanla kabarır ---- */
      const target = Math.min(MAX_ENEMIES, 10 + gameState.time * 2.8)
      const deficit = target - enemies.entities.length
      if (deficit > 0) {
        const budget = Math.min(deficit, deficit > 400 ? 16 : 5)
        for (let i = 0; i < budget; i++) spawnEnemy(player.position)
      }

      /* ---- dalga patlaması ---- */
      gameState.waveTimer -= dt
      if (gameState.waveTimer <= 0) {
        gameState.waveTimer = WAVE_EVERY
        gameState.wave++
        const burst = Math.min(30 + gameState.wave * 13, MAX_ENEMIES - enemies.entities.length)
        for (let i = 0; i < burst; i++) spawnEnemy(player.position)
        sfx.wave()
        announce(`SÜRÜ BÜYÜDÜ — DALGA ${gameState.wave}`)
      }

      /* ---- ölümler: merkezî skor / XP / Kan Bağı ---- */
      tmp.remove.length = 0
      const list = enemies.entities
      for (let i = 0; i < list.length; i++) {
        const e = list[i]
        if (!e.dead) continue
        tmp.remove.push(e)
        gameState.kills++
        const kind = e.enemyKind ?? 0
        /* kombo sayacı: hızlı kesimler XP'yi katlar */
        gameState.combo++
        gameState.comboTimer = 2.4
        if (gameState.combo > gameState.maxCombo) gameState.maxCombo = gameState.combo
        gameState.xp += XP_VALUES[kind] * xpMultiplier(gameState.combo)
        spawnBurst(e.position, ENEMY_KINDS[kind].color, kind === 2 ? 12 : 6, 4, 0.65)
        sfx.kill(gameState.combo)
        /* Demir Yürek: her kesimde küçük can + duruş yenilenir */
        player.health = Math.min(player.maxHealth, player.health + 0.6)
        player.poise = Math.min(player.maxPoise, player.poise + 8)
        /* Vampirizm: azami canın yüzdesi kadar em */
        if (abilities.vamp > 0)
          player.health = Math.min(
            player.maxHealth,
            player.health + player.maxHealth * vampHealPct()
          )
        /* ruh göğe yükselir + XP yazısı */
        spawnWisp(e.position, ENEMY_KINDS[kind].color)
        pushSoul(e.position.x, e.position.y, e.position.z, XP_VALUES[kind] * xpMultiplier(gameState.combo))
        /* son darbeyi göster (kritikler zaten vuruş anında yazıldı) */
        if (e.lastDmg !== undefined && !e.lastCrit)
          pushDamage(e.position.x, e.position.y, e.position.z, e.lastDmg, false)
      }
      for (let i = 0; i < tmp.remove.length; i++) world.remove(tmp.remove[i])

      /* ---- kilometre taşları: her 50 kesimde sürü kudurur ---- */
      if (gameState.kills < milestone.current * 50) milestone.current = 0 /* yeni koşu */
      const ms = Math.floor(gameState.kills / 50)
      if (ms > milestone.current) {
        milestone.current = ms
        announce(`${ms * 50} RUH KESİLDİ — SÜRÜ AZGINLAŞIYOR`)
        gameState.shake = Math.min(1, gameState.shake + 0.45)
        sfx.wave()
        /* ödül: küçük can */
        player.health = Math.min(player.maxHealth, player.health + 10)
      }

      /* ---- seviye atlamalar ---- */
      while (gameState.xp >= gameState.xpNext) {
        gameState.xp -= gameState.xpNext
        gameState.level++
        gameState.xpNext = xpForLevel(gameState.level)
        gameState.pendingLevelUps++
        gameState.levelFlash = 1
      }
      if (gameState.pendingLevelUps > 0 && gameState.phase === 'playing') {
        sfx.levelup()
        setPhase('levelup')
      }

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

        /* ayaz yavaşlatması */
        let speedMul = 1
        if (e.slow !== undefined && e.slow > 0) {
          e.slow -= dt
          speedMul = 0.42
        }

        /* teğetsel salınım — sürü olduğu yerde dönüp kaynasın */
        const swirl = Math.sin(t * 1.7 + (e.phase ?? 0)) * 0.55
        tmp.side.set(-tmp.dir.z, 0, tmp.dir.x).multiplyScalar(swirl)

        /* temas halkasında duraksama */
        const stop = Math.min(1, Math.max(0, (d - (e.radius + player.radius)) / 1.2))
        tmp.desired
          .copy(tmp.dir)
          .multiplyScalar(stop * e.speed * speedMul)
          .addScaledVector(tmp.side, e.speed * 0.55 * speedMul)

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
          /* Taş Deri: alınan hasar kalıcı azalır */
          const dmg = Math.max(1, Math.round(((e.damage ?? 5) - player.armor) * (1 - stoneReduction())))
          player.health -= dmg
          player.regenDelay = 0
          /* Demir İrade sinerjisi: duruş asla kırılmaz */
          const poiseHit = hasSynergy('will') ? 0 : kind === 2 ? 26 : kind === 1 ? 12 : 7
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

      /* ---- YÖRÜNGE KORLARI: temas halkası hasarı ---- */
      if (abilities.orbit > 0) {
        orbitTimer -= dt
        if (orbitTimer <= 0) {
          orbitTimer = 0.42
          const outer = orbitRadius()
          const outer2 = outer * outer
          const inner2 = 0.5 * 0.5
          const el = enemies.entities
          for (let i = 0; i < el.length; i++) {
            const e = el[i]
            if (e.dead) continue
            const dx = e.position.x - player.position.x
            const dz = e.position.z - player.position.z
            const d2 = dx * dx + dz * dz
            if (d2 < outer2 && d2 > inner2) {
              const roll = rollDamage(orbitDamage(), player)
              e.health -= Math.max(1, roll.value - e.armor)
              e.lastDmg = roll.value
              e.lastCrit = roll.crit
              if (roll.crit) sfx.crit()
              e.hitFlash = 1
              const d = Math.sqrt(d2) || 1
              e.velocity.x += (dx / d) * 5
              e.velocity.z += (dz / d) * 5
              if (e.health <= 0) e.dead = true
            }
          }
          spawnBurst(player.position, 0xff8a3d, 5, 3.4, 0.35)
        }
      }
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
        tmp.dummy.rotation.x = 0.18
      } else if (kind === 1) {
        /* iskelet: kemik tıkırtısıyla hafif salınım */
        y = Math.abs(Math.sin(t * 6 + ph)) * 0.06 * s
        tmp.dummy.rotation.x = 0.05
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

      /* vertex renkleri paleti taşır; instanceColor flaş + ton için çarpan */
      tmp.color.copy(WHITE).lerp(HDR_WHITE, flash * 0.6)
      /* ayaz altındakiler buz mavisi */
      if (e.slow !== undefined && e.slow > 0) {
        tmp.color.multiply(FROST_TINT)
      }
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
