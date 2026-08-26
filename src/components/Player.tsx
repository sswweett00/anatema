import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { getPlayer, gameState, enemies, spawnBurst } from '../ecs/world'
import { useInput } from '../hooks/useInput'
import { sfx } from '../game/audio'
import {
  abilities,
  hasSynergy,
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
 * KÜL ŞÖVALYESİ — detaylı zırhlı model.
 * Gövde: ~45 parça TEK birleşik vertex-renkli geometri (1 draw-call).
 * HDR parlaklığında boyanmış kor parçalar Bloom ile ışıldar.
 * Bacaklar yürür, pelerin dalgalanır, kılıç savrulur.
 */

const CAM_OFFSET = new THREE.Vector3(21, 21, 21)
const FORWARD = new THREE.Vector3(-0.7071, 0, -0.7071)
const RIGHT = new THREE.Vector3(0.7071, 0, -0.7071)

/* ---------------- yardımcı: parça boyama ---------------- */

function paint(geo: THREE.BufferGeometry, hex: number, bright = 1): THREE.BufferGeometry {
  const c = new THREE.Color(hex).multiplyScalar(bright)
  const count = geo.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

/* ---------------- palet ---------------- */
const STEEL = 0x4a5058
const STEEL_DARK = 0x31373e
const STEEL_LIGHT = 0x656d77
const LEATHER = 0x4a3120
const GOLD = 0xb08a3e
const RUST_CLOTH = 0x8a2f1a
const BONE = 0xc9b98f
const HDR_CORE: [number, number, number] = [5.2, 1.9, 0.55] /* bloom */
const HDR_SLIT: [number, number, number] = [4.2, 1.3, 0.4]
const HDR_EDGE: [number, number, number] = [3.6, 1.2, 0.35]

function paintHdr(geo: THREE.BufferGeometry, rgb: [number, number, number]): THREE.BufferGeometry {
  const count = geo.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = rgb[0]
    colors[i * 3 + 1] = rgb[1]
    colors[i * 3 + 2] = rgb[2]
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

/* ---------------- gövde zırhı (birleşik) ---------------- */

function buildBodyGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  /* göğüs zırhı */
  const chest = new THREE.CylinderGeometry(0.3, 0.26, 0.5, 14)
  chest.translate(0, 0.78, 0)
  parts.push(paint(chest, STEEL))

  const ridge = new THREE.BoxGeometry(0.34, 0.3, 0.12)
  ridge.translate(0, 0.85, 0.17)
  parts.push(paint(ridge, STEEL_LIGHT))

  const core = new THREE.OctahedronGeometry(0.07, 0)
  core.translate(0, 0.86, 0.26)
  parts.push(paintHdr(core, HDR_CORE))

  /* karın plakası + zincir eteklik */
  const belly = new THREE.CylinderGeometry(0.26, 0.24, 0.18, 14)
  belly.translate(0, 0.52, 0)
  parts.push(paint(belly, STEEL_DARK))

  const mail = new THREE.CylinderGeometry(0.24, 0.27, 0.16, 14)
  mail.translate(0, 0.44, 0)
  parts.push(paint(mail, 0x23262b))

  /* kemer + tokası */
  const belt = new THREE.TorusGeometry(0.265, 0.035, 8, 18)
  belt.rotateX(Math.PI / 2)
  belt.translate(0, 0.6, 0)
  parts.push(paint(belt, LEATHER))

  const buckle = new THREE.BoxGeometry(0.09, 0.07, 0.05)
  buckle.translate(0, 0.6, 0.27)
  parts.push(paint(buckle, GOLD))

  /* baldır plakaları (tasset) */
  for (const deg of [40, -40, 90, -90, 145, -145, 180]) {
    const a = (deg * Math.PI) / 180
    const t = new THREE.BoxGeometry(0.15, 0.24, 0.045)
    t.translate(0, -0.1, 0)
    t.rotateX(0.1)
    t.rotateY(a)
    t.translate(Math.sin(a) * 0.25, 0.48, Math.cos(a) * 0.25)
    parts.push(paint(t, deg === 180 ? STEEL : STEEL_DARK))
  }

  /* gerdanlık (gorget) */
  const gorget = new THREE.CylinderGeometry(0.17, 0.21, 0.13, 12)
  gorget.translate(0, 1.07, 0)
  parts.push(paint(gorget, STEEL_DARK))

  /* ---- miğfer ---- */
  const helm = new THREE.SphereGeometry(0.19, 20, 16)
  helm.scale(1, 1.08, 1.05)
  helm.translate(0, 1.26, 0)
  parts.push(paint(helm, STEEL))

  const visor = new THREE.BoxGeometry(0.27, 0.15, 0.1)
  visor.translate(0, 1.24, 0.15)
  parts.push(paint(visor, STEEL_LIGHT))

  const slit = new THREE.BoxGeometry(0.2, 0.035, 0.02)
  slit.translate(0, 1.26, 0.205)
  parts.push(paintHdr(slit, HDR_SLIT))

  const nasal = new THREE.BoxGeometry(0.04, 0.22, 0.06)
  nasal.translate(0, 1.28, 0.17)
  parts.push(paint(nasal, STEEL_LIGHT))

  const crest = new THREE.BoxGeometry(0.035, 0.05, 0.32)
  crest.translate(0, 1.45, -0.02)
  parts.push(paint(crest, GOLD))

  /* sorguç: geriye dökülen tüyler */
  for (let i = 0; i < 5; i++) {
    const f = i / 4
    const pl = new THREE.ConeGeometry(0.045 - f * 0.008, 0.13, 7)
    pl.rotateX(0.5 + f * 0.5)
    pl.translate(0, 1.47 - f * 0.05, -0.06 - f * 0.07)
    parts.push(paint(pl, RUST_CLOTH, 1 - f * 0.15))
  }

  /* yanak plakaları + boynuzlar */
  for (const s of [-1, 1]) {
    const cheek = new THREE.BoxGeometry(0.05, 0.13, 0.13)
    cheek.translate(s * 0.17, 1.19, 0.05)
    parts.push(paint(cheek, STEEL_DARK))

    const horn = new THREE.ConeGeometry(0.032, 0.18, 8)
    horn.rotateZ(s * -0.55)
    horn.translate(s * 0.15, 1.4, 0)
    parts.push(paint(horn, BONE))
  }

  /* ---- omuzluklar (pauldron) ---- */
  for (const s of [-1, 1]) {
    const dome = new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    dome.translate(s * 0.37, 0.99, 0)
    parts.push(paint(dome, STEEL_LIGHT))

    const rim = new THREE.TorusGeometry(0.16, 0.022, 8, 18)
    rim.rotateX(Math.PI / 2)
    rim.translate(s * 0.37, 0.99, 0)
    parts.push(paint(rim, GOLD))

    const spike = new THREE.ConeGeometry(0.028, 0.15, 8)
    spike.rotateZ(s * -0.4)
    spike.translate(s * 0.47, 1.12, 0)
    parts.push(paint(spike, STEEL))
  }

  /* ---- kollar + eldivenler ---- */
  for (const s of [-1, 1]) {
    const upper = new THREE.CylinderGeometry(0.07, 0.06, 0.22, 10)
    upper.translate(s * 0.39, 0.84, 0)
    parts.push(paint(upper, STEEL_DARK))

    const elbow = new THREE.SphereGeometry(0.065, 10, 8)
    elbow.translate(s * 0.39, 0.71, 0)
    parts.push(paint(elbow, STEEL))

    const fore = new THREE.CylinderGeometry(0.075, 0.058, 0.24, 10)
    fore.rotateX(s === 1 ? 0.25 : 0.1)
    fore.translate(s * 0.4, 0.56, s === 1 ? 0.06 : 0.02)
    parts.push(paint(fore, STEEL_LIGHT))

    const hand = new THREE.SphereGeometry(0.062, 10, 8)
    hand.translate(s * 0.41, 0.43, s === 1 ? 0.1 : 0.04)
    parts.push(paint(hand, LEATHER))
  }

  /* ---- sol kolda kalkan (buckler) ---- */
  const shield = new THREE.CylinderGeometry(0.17, 0.17, 0.03, 18)
  shield.rotateZ(Math.PI / 2)
  shield.translate(-0.52, 0.56, 0.02)
  parts.push(paint(shield, STEEL_DARK))

  const boss = new THREE.SphereGeometry(0.055, 10, 8)
  boss.translate(-0.55, 0.56, 0.02)
  parts.push(paint(boss, GOLD))

  const srim = new THREE.TorusGeometry(0.165, 0.018, 8, 18)
  srim.rotateY(Math.PI / 2)
  srim.translate(-0.535, 0.56, 0.02)
  parts.push(paint(srim, GOLD))

  /* ---- sırt plakası + sancak ---- */
  const back = new THREE.BoxGeometry(0.32, 0.36, 0.06)
  back.translate(0, 0.84, -0.2)
  parts.push(paint(back, STEEL_DARK))

  const banner = new THREE.BoxGeometry(0.2, 0.28, 0.015)
  banner.translate(0, 0.82, -0.245)
  parts.push(paint(banner, RUST_CLOTH))

  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('knight body merge failed')
  return merged
}

/* ---------------- bacak (kalça eksenli, birleşik) ---------------- */

function buildLegGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const thigh = new THREE.CylinderGeometry(0.09, 0.075, 0.3, 10)
  thigh.translate(0, -0.15, 0)
  parts.push(paint(thigh, STEEL_DARK))

  const knee = new THREE.SphereGeometry(0.08, 10, 8)
  knee.translate(0, -0.32, 0.02)
  parts.push(paint(knee, GOLD))

  const greave = new THREE.CylinderGeometry(0.075, 0.058, 0.3, 10)
  greave.translate(0, -0.5, 0)
  parts.push(paint(greave, STEEL))

  const foot = new THREE.BoxGeometry(0.11, 0.07, 0.22)
  foot.translate(0, -0.68, 0.05)
  parts.push(paint(foot, STEEL_LIGHT))

  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('leg merge failed')
  return merged
}

/* ---------------- büyük kılıç (birleşik) ---------------- */

function buildSwordGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const grip = new THREE.CylinderGeometry(0.045, 0.05, 0.36, 10)
  parts.push(paint(grip, LEATHER))

  for (let i = 0; i < 3; i++) {
    const wire = new THREE.TorusGeometry(0.052, 0.008, 6, 12)
    wire.rotateX(Math.PI / 2)
    wire.translate(0, -0.1 + i * 0.1, 0)
    parts.push(paint(wire, GOLD))
  }

  const pommel = new THREE.SphereGeometry(0.07, 12, 10)
  pommel.translate(0, -0.24, 0)
  parts.push(paint(pommel, GOLD))

  const pommelGem = new THREE.OctahedronGeometry(0.035, 0)
  pommelGem.translate(0, -0.24, 0.06)
  parts.push(paintHdr(pommelGem, HDR_CORE))

  const guard = new THREE.BoxGeometry(0.44, 0.075, 0.15)
  guard.translate(0, 0.2, 0)
  parts.push(paint(guard, GOLD))

  for (const s of [-1, 1]) {
    const tip = new THREE.SphereGeometry(0.042, 10, 8)
    tip.translate(s * 0.23, 0.2, 0)
    parts.push(paint(tip, GOLD))
  }

  const blade = new THREE.BoxGeometry(0.18, 1.35, 0.05)
  blade.translate(0, 0.95, 0)
  parts.push(paint(blade, 0xc3c9d1))

  const fuller = new THREE.BoxGeometry(0.055, 1.2, 0.062)
  fuller.translate(0, 0.92, 0)
  parts.push(paint(fuller, 0x6d737b))

  const point = new THREE.ConeGeometry(0.127, 0.32, 4)
  point.rotateY(Math.PI / 4)
  point.translate(0, 1.78, 0)
  parts.push(paint(point, 0xc3c9d1))

  /* kor ağız + rünler: HDR → Bloom ile parlar */
  const edge = new THREE.BoxGeometry(0.02, 1.3, 0.052)
  edge.translate(0.092, 0.95, 0)
  parts.push(paintHdr(edge, HDR_EDGE))

  for (let i = 0; i < 3; i++) {
    const rune = new THREE.OctahedronGeometry(0.032, 0)
    rune.translate(0, 0.6 + i * 0.3, 0.035)
    parts.push(paintHdr(rune, HDR_SLIT))
  }

  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('sword merge failed')
  return merged
}

/* ================================================================== */

export default function Player() {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Mesh>(null!)
  const legR = useRef<THREE.Mesh>(null!)
  const orbit = useRef<THREE.Group>(null!)
  const cloak = useRef<THREE.Mesh>(null!)
  const sword = useRef<THREE.Group>(null!)
  const embers = useRef<THREE.InstancedMesh>(null!)
  const keys = useInput()
  const { camera, size } = useThree()

  const bodyGeo = useMemo(buildBodyGeo, [])
  const legGeo = useMemo(buildLegGeo, [])
  const swordGeo = useMemo(buildSwordGeo, [])

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.74,
        roughness: 0.36,
      }),
    []
  )
  const swordMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.88,
        roughness: 0.24,
      }),
    []
  )
  const emberMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({ color: '#ff8a3d', toneMapped: false }),
    []
  )
  const emberGeo = useMemo(() => new THREE.OctahedronGeometry(1, 0), [])

  const tmp = useMemo(
    () => ({
      move: new THREE.Vector3(),
      look: new THREE.Vector3(),
      camTarget: new THREE.Vector3(),
      menuPos: new THREE.Vector3(),
      dummy: new THREE.Object3D(),
    }),
    []
  )

  const emberAngles = useMemo(
    () => Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2),
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
      const ix = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0)
      const iy = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)

      /* yeteneklerden türeyen değerler */
      p.speed = moveSpeed(p)
      p.armor = armorValue()

      p.dashCooldown = Math.max(0, (p.dashCooldown ?? 0) - dt)
      p.invuln = Math.max(0, (p.invuln ?? 0) - dt)
      p.novaCooldown = (p.novaCooldown ?? 8) - dt

      /* ---- ATILMA (BOŞLUK / SHIFT) ---- */
      if (
        (k.Space || k.ShiftLeft || k.ShiftRight) &&
        (p.dashCooldown ?? 0) <= 0 &&
        (p.dashTime ?? 0) <= 0
      ) {
        let dx = p.facingX ?? 0
        let dz = p.facingZ ?? 1
        if (ix !== 0 || iy !== 0) {
          tmp.move.copy(FORWARD).multiplyScalar(iy).addScaledVector(RIGHT, ix).normalize()
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
        tmp.move.copy(FORWARD).multiplyScalar(iy).addScaledVector(RIGHT, ix).normalize()
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

      /* ---- KÜL FIRTINASI ---- */
      if (abilities.nova > 0 && p.novaCooldown <= 0) {
        p.novaCooldown = novaCd()
        const R = novaRadius()
        const R2 = R * R
        const novaDmg = novaDamage()
        const icy = hasSynergy('glacier')
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
            if (icy) e.slow = 2
            const d = Math.sqrt(d2) || 1
            e.velocity.x += (dx / d) * 15
            e.velocity.z += (dz / d) * 15
            if (e.health <= 0) e.dead = true
          }
        }
        gameState.flashNova = 1
        gameState.shake = Math.min(1, gameState.shake + 0.65)
        sfx.nova()
        spawnBurst(p.position, icy ? 0x9fdcff : 0xff8a3d, 40, 6.5, 0.8)
        spawnBurst(p.position, 0xe6dcc8, 16, 4, 0.5)
      }

      /* duruş kırıldıysa sersemleme */
      if (p.stagger && p.stagger > 0) {
        p.stagger -= dt
        if (p.stagger <= 0) {
          p.stagger = 0
          p.poise = p.maxPoise
        }
      }

      /* rejenerasyon */
      p.regenDelay = (p.regenDelay ?? 0) + dt
      if (p.regenDelay > 4) {
        p.health = Math.min(p.maxHealth, p.health + dt * regenRate())
      }
    } else {
      p.velocity.multiplyScalar(Math.exp(-6 * dt))
      p.position.addScaledVector(p.velocity, dt)
    }

    /* ================= görsel durum ================= */
    const speedAmt = Math.hypot(p.velocity.x, p.velocity.z)
    group.current.position.copy(p.position)

    body.current.visible = !((p.invuln ?? 0) > 0 && Math.floor(t * 22) % 2 === 0)
    legL.current.visible = body.current.visible
    legR.current.visible = body.current.visible
    sword.current.visible = body.current.visible

    /* savuruş / hareket yönü */
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

    /* kılıç animasyonu */
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

    /* yürüyüş: bacaklar + gövde salınımı + hafif öne eğilme */
    const stride = Math.min(1, speedAmt / 4.2)
    const swing = Math.sin(t * 11) * 0.6 * stride
    legL.current.rotation.x = swing
    legR.current.rotation.x = -swing
    body.current.position.y = Math.abs(Math.cos(t * 11)) * 0.045 * stride
    body.current.rotation.x = stride * 0.08
    cloak.current.rotation.x = 0.26 + Math.sin(t * 9) * 0.06 * Math.max(stride, 0.25)

    /* yörünge korları (instanced, tek draw-call) */
    const owned = abilities.orbit > 0
    const visCount = owned ? orbitCount() : 8
    const emberR = owned ? 1.35 : 0.95
    const emberScale = owned ? 0.13 : 0.05
    orbit.current.rotation.y = t * (owned ? 5 : 2.1)
    for (let i = 0; i < emberAngles.length; i++) {
      tmp.dummy.position.set(
        Math.cos(emberAngles[i]) * emberR,
        Math.sin(t * 3 + i) * 0.1,
        Math.sin(emberAngles[i]) * emberR
      )
      const s = i < visCount ? emberScale * (1 + Math.sin(t * 6 + i) * 0.25) : 0.0001
      tmp.dummy.scale.setScalar(s)
      tmp.dummy.rotation.set(t * 4 + i, t * 5, 0)
      tmp.dummy.updateMatrix()
      embers.current.setMatrixAt(i, tmp.dummy.matrix)
    }
    embers.current.instanceMatrix.needsUpdate = true

    /* ölünce yere seril */
    const fallen = gameState.phase === 'dead' ? Math.PI / 2.2 : 0
    group.current.rotation.x += (fallen - group.current.rotation.x) * Math.min(1, 5 * dt)

    /* ================= kamera ================= */
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

  return (
    <group ref={group}>
      {/* bacaklar (kalça ekseninde sallanır) */}
      <mesh ref={legL} geometry={legGeo} material={bodyMat} position={[-0.13, 0.66, 0]} castShadow />
      <mesh ref={legR} geometry={legGeo} material={bodyMat} position={[0.13, 0.66, 0]} castShadow />

      <group ref={body}>
        {/* birleşik zırhlı gövde */}
        <mesh geometry={bodyGeo} material={bodyMat} castShadow />

        {/* pelerin */}
        <mesh ref={cloak} castShadow position={[0, 0.62, -0.26]} rotation={[0.26, 0, 0]}>
          <coneGeometry args={[0.46, 1.15, 10, 1, true]} />
          <meshStandardMaterial color="#22120a" roughness={1} side={THREE.DoubleSide} />
        </mesh>

        {/* kor kalp ışığı */}
        <pointLight
          position={[0, 0.9, 0.45]}
          color="#ff6a2a"
          intensity={7}
          distance={8}
          decay={1.8}
        />

        {/* BÜYÜK KILIÇ */}
        <group ref={sword} position={[0.46, 0.74, 0.08]} rotation={[-0.35, 0, -0.6]}>
          <mesh geometry={swordGeo} material={swordMat} castShadow />
        </group>

        {/* yörünge korları (tek instanced mesh) */}
        <group ref={orbit} position={[0, 0.8, 0]}>
          <instancedMesh
            ref={embers}
            args={[emberGeo, emberMat, 8]}
            frustumCulled={false}
          />
        </group>
      </group>
    </group>
  )
}
