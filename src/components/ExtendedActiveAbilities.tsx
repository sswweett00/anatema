import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { enemies, getPlayer, gameState, spawnBurst, type Entity } from '../ecs/world'
import { sfx } from '../game/audio'
import { pushDamage } from '../game/fx'
import {
  softDotTexture,
  softRingTexture,
  arcaneRuneTexture,
  vortexSpiralTexture,
  firePoolTexture,
  plasmaOrbTexture,
  magicalRuneCircleTexture,
  frostCrystalTexture,
  bloodSigilTexture,
  crescentSlashTexture,
} from '../game/textures'
import {
  abilities,
  hasSynergy,
  meteorDamage, meteorInterval,
  gravityDamage, gravityInterval,
  soulboltDamage, soulboltInterval, soulboltCount,
  bladestormDamage, bladestormCount,
  mineDamage, mineInterval,
  bloodnovaDamage, bloodnovaInterval,
  voidriftDamage, voidriftInterval,
  mirrorsDamage,
  wolfpackDamage, wolfpackCount,
  seismicDamage, seismicInterval,
  runeprisonDamage, runeprisonInterval,
  frostfireDamage, frostfireInterval,
  rollDamage,
} from '../game/abilities'

const _tmp = new THREE.Vector3()
const _dir = new THREE.Vector3()

function hit(e: Entity, dmg: number, player: Entity, opts: { flash?: boolean } = {}) {
  const roll = rollDamage(dmg, player)
  e.health -= Math.max(1, roll.value - e.armor)
  e.hitFlash = 1
  e.lastDmg = roll.value
  e.lastCrit = roll.crit
  if (opts.flash !== false && roll.crit) {
    sfx.crit()
    pushDamage(e.position.x, e.position.y, e.position.z, roll.value, true)
  }
  if (e.health <= 0) e.dead = true
  return roll.value
}

export default function ExtendedActiveAbilities() {
  const meteorTimer = useRef(2.5)
  const gravityTimer = useRef(3.0)
  const soulboltTimer = useRef(1.2)
  const mineTimer = useRef(2.0)
  const bloodnovaTimer = useRef(3.5)
  const voidriftTimer = useRef(4.0)
  const mirrorTimer = useRef(1.0)
  const wolfTimer = useRef(2.2)
  const seismicTimer = useRef(1.8)
  const prisonTimer = useRef(5.0)
  const frostfireTimer = useRef(1.6)

  const meteorActive = useRef(false)
  const meteorPos = useRef(new THREE.Vector3())
  const meteorTarget = useRef(new THREE.Vector3())
  const meteorProgress = useRef(0)
  const meteorMesh = useRef<THREE.Group>(null!)
  const meteorTelegraph = useRef<THREE.Mesh>(null!)
  const meteorCrater = useRef<THREE.Mesh>(null!)
  const meteorCraterLife = useRef(0)

  const gravityActive = useRef(false)
  const gravityPos = useRef(new THREE.Vector3())
  const gravityLife = useRef(0)
  const gravityMesh = useRef<THREE.Group>(null!)

  const BOLT_COUNT = 8
  const soulBolts = useRef(Array.from({ length: BOLT_COUNT }, () => ({ active: false, pos: new THREE.Vector3(), target: null as Entity | null, life: 0, speed: 16 })))
  const soulBoltGroups = useRef<(THREE.Group | null)[]>([])

  const bladeStormGroup = useRef<THREE.Group>(null!)

  const MINE_COUNT = 6
  const mines = useRef(Array.from({ length: MINE_COUNT }, () => ({ active: false, pos: new THREE.Vector3(), life: 0 })))
  const mineMeshes = useRef<(THREE.Group | null)[]>([])

  const bloodNovaMesh = useRef<THREE.Mesh>(null!)
  const bloodNovaAnim = useRef(0)

  const voidRiftActive = useRef(false)
  const voidRiftPos = useRef(new THREE.Vector3())
  const voidRiftLife = useRef(0)
  const voidRiftMesh = useRef<THREE.Group>(null!)

  const mirrorMesh = useRef<THREE.Group>(null!)

  const WOLF_COUNT = 4
  const wolves = useRef(Array.from({ length: WOLF_COUNT }, () => ({ pos: new THREE.Vector3(), target: null as Entity | null, leap: 0 })))
  const wolfGroups = useRef<(THREE.Group | null)[]>([])

  const seismicMesh = useRef<THREE.Group>(null!)
  const seismicAnim = useRef(0)

  const prisonMesh = useRef<THREE.Group>(null!)
  const prisonLife = useRef(0)
  const prisonTarget = useRef<Entity | null>(null)

  const frostfireMesh = useRef<THREE.Group>(null!)
  const frostfireAnim = useRef(0)
  const frostfireDir = useRef(new THREE.Vector3())

  const tex = useMemo(
    () => ({
      dot: softDotTexture(),
      ring: softRingTexture(),
      rune: magicalRuneCircleTexture(),
      arcane: arcaneRuneTexture(),
      vortex: vortexSpiralTexture(),
      fire: firePoolTexture(),
      plasma: plasmaOrbTexture(),
      frost: frostCrystalTexture(),
      blood: bloodSigilTexture(),
      slash: crescentSlashTexture(),
    }),
    []
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const player = getPlayer()
    if (gameState.phase !== 'playing' || !player) return
    const el = enemies.entities

    if (abilities.meteor > 0) {
      meteorTimer.current -= dt
      if (meteorTimer.current <= 0 && !meteorActive.current) {
        meteorTimer.current = meteorInterval()
        let bestTarget: Entity | null = null
        let maxCluster = 0
        for (const e of el) {
          if (e.dead) continue
          let cluster = 0
          for (const other of el) {
            if (!other.dead && _tmp.subVectors(other.position, e.position).lengthSq() < 36) cluster++
          }
          if (cluster > maxCluster) { maxCluster = cluster; bestTarget = e }
        }
        if (bestTarget) {
          meteorActive.current = true
          meteorProgress.current = 0
          meteorTarget.current.copy(bestTarget.position)
          meteorPos.current.set(meteorTarget.current.x - 8, 22, meteorTarget.current.z - 6)
          sfx.storm()
        }
      }
      if (meteorActive.current) {
        meteorProgress.current += dt * 1.3
        const p = meteorProgress.current
        if (meteorTelegraph.current) {
          meteorTelegraph.current.visible = true
          meteorTelegraph.current.position.set(meteorTarget.current.x, 0.06, meteorTarget.current.z)
          meteorTelegraph.current.scale.setScalar(4.5 * (0.8 + Math.sin(t * 16) * 0.2))
          ;(meteorTelegraph.current.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, p * 1.5)
        }
        if (meteorMesh.current) {
          meteorMesh.current.visible = true
          meteorMesh.current.position.lerpVectors(meteorPos.current, meteorTarget.current, Math.min(1, p))
          meteorMesh.current.rotation.x += dt * 8
          meteorMesh.current.rotation.z += dt * 6
          if (p > 0.02 && Math.floor(p * 120) % 3 === 0) spawnBurst(meteorMesh.current.position, 0xff5511, 2, 2.5, 0.25)
        }
        if (p >= 1) {
          meteorActive.current = false
          if (meteorTelegraph.current) meteorTelegraph.current.visible = false
          if (meteorMesh.current) meteorMesh.current.visible = false
          meteorCraterLife.current = 3.5
          sfx.die()
          gameState.shake = Math.min(1, gameState.shake + 0.65)
          spawnBurst(meteorTarget.current, 0xff4400, 36, 9.0, 0.8)
          spawnBurst(meteorTarget.current, 0xffdd44, 24, 7.0, 0.6)
          const hitR2 = 42.25
          for (const e of el) {
            if (e.dead) continue
            const offset = _tmp.subVectors(e.position, meteorTarget.current)
            const d2 = offset.lengthSq()
            if (d2 < hitR2) {
              hit(e, meteorDamage(), player)
              e.burn = Math.max(e.burn ?? 0, 3.5)
              const d = Math.sqrt(d2) || 1
              e.velocity.x += (offset.x / d) * 4.5
              e.velocity.z += (offset.z / d) * 4.5
            }
          }
        }
      }
      if (meteorCraterLife.current > 0) {
        meteorCraterLife.current -= dt
        if (meteorCrater.current) {
          meteorCrater.current.visible = meteorCraterLife.current > 0
          meteorCrater.current.position.set(meteorTarget.current.x, 0.05, meteorTarget.current.z)
          ;(meteorCrater.current.material as THREE.MeshBasicMaterial).opacity = (meteorCraterLife.current / 3.5) * 0.8
          meteorCrater.current.scale.setScalar(5.5)
        }
      }
    }

    if (abilities.gravitywell > 0) {
      gravityTimer.current -= dt
      if (gravityTimer.current <= 0 && !gravityActive.current) {
        gravityTimer.current = gravityInterval()
        let nearest: Entity | null = null
        let bd = 324
        for (const e of el) {
          if (e.dead) continue
          const d2 = _tmp.subVectors(e.position, player.position).lengthSq()
          if (d2 < bd) { bd = d2; nearest = e }
        }
        if (nearest) { gravityActive.current = true; gravityLife.current = 3.2; gravityPos.current.copy(nearest.position); sfx.vortex() }
      }
      if (gravityActive.current) {
        gravityLife.current -= dt
        if (gravityMesh.current) {
          gravityMesh.current.visible = gravityLife.current > 0
          gravityMesh.current.position.copy(gravityPos.current)
          gravityMesh.current.rotation.y += dt * 8
          gravityMesh.current.scale.setScalar(2.4 + Math.sin(t * 14) * 0.3)
        }
        const pullR2 = 72.25
        for (const e of el) {
          if (e.dead) continue
          const d = _tmp.subVectors(gravityPos.current, e.position)
          const d2 = d.lengthSq()
          if (d2 < pullR2 && d2 > 0.2) {
            const dist = Math.sqrt(d2)
            e.position.x += (d.x / dist) * dt * 4.5
            e.position.z += (d.z / dist) * dt * 4.5
            if (Math.floor((t + e.position.x * 0.13 + e.position.z * 0.17) * 30) % 7 === 0) hit(e, gravityDamage() * 0.35, player, { flash: false })
          }
        }
        if (gravityLife.current <= 0) {
          gravityActive.current = false
          if (gravityMesh.current) gravityMesh.current.visible = false
          spawnBurst(gravityPos.current, 0xa855f7, 28, 6.5, 0.65)
          for (const e of el) {
            if (!e.dead && _tmp.subVectors(e.position, gravityPos.current).lengthSq() < 81) hit(e, gravityDamage() * 1.5, player)
          }
        }
      }
    }

    if (abilities.soulbolts > 0) {
      soulboltTimer.current -= dt
      if (soulboltTimer.current <= 0) {
        soulboltTimer.current = soulboltInterval()
        const count = Math.min(BOLT_COUNT, soulboltCount())
        for (let i = 0; i < count; i++) {
          const bolt = soulBolts.current[i]
          let nearest: Entity | null = null
          let best = 20 * 20
          for (const e of el) {
            if (e.dead) continue
            const d2 = _tmp.subVectors(e.position, player.position).lengthSq()
            if (d2 < best) { best = d2; nearest = e }
          }
          if (nearest) { bolt.active = true; bolt.life = 1.2; bolt.pos.copy(player.position); bolt.target = nearest }
        }
      }
      for (let i = 0; i < soulBolts.current.length; i++) {
        const bolt = soulBolts.current[i]
        const group = soulBoltGroups.current[i]
        if (!bolt.active || !bolt.target || bolt.target.dead) { bolt.active = false; if (group) group.visible = false; continue }
        bolt.life -= dt
        const d = _tmp.subVectors(bolt.target.position, bolt.pos)
        const dist = d.length()
        if (dist > 0.15) bolt.pos.addScaledVector(d.normalize(), Math.min(dist, bolt.speed * dt))
        if (group) { group.visible = true; group.position.copy(bolt.pos); group.rotation.y = t * 8 }
        if (dist < 0.45 || bolt.life <= 0) {
          hit(bolt.target, soulboltDamage(), player)
          spawnBurst(bolt.target.position, 0x67e8f9, 6, 3.2, 0.3)
          bolt.active = false
          if (group) group.visible = false
        }
      }
    }

    if (abilities.bladestorm > 0) {
      const active = gameState.time % Math.max(0.8, 2.2 / Math.min(4, abilities.bladestorm * 0.35 + 1))
      if (bladeStormGroup.current) {
        bladeStormGroup.current.visible = true
        bladeStormGroup.current.position.copy(player.position)
        bladeStormGroup.current.rotation.y = t * (3.4 + abilities.bladestorm * 0.12)
        const count = bladestormCount()
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const radius = 3.0 + count * 0.15
          if (_tmp.subVectors(e.position, player.position).lengthSq() <= radius * radius && active < 0.22) hit(e, bladestormDamage() * dt * 6.5, player, { flash: false })
        }
      }
    } else if (bladeStormGroup.current) bladeStormGroup.current.visible = false

    if (abilities.arcanemine > 0) {
      mineTimer.current -= dt
      if (mineTimer.current <= 0) {
        mineTimer.current = mineInterval()
        const slot = mines.current.find((m) => !m.active)
        if (slot) {
          slot.active = true
          slot.life = 12
          const angle = t * 2.17 + abilities.arcanemine
          const radius = 2 + (abilities.arcanemine % 4) * 0.9
          slot.pos.set(player.position.x + Math.cos(angle) * radius, 0.06, player.position.z + Math.sin(angle) * radius)
        }
      }
      for (let i = 0; i < mines.current.length; i++) {
        const mine = mines.current[i]
        const mesh = mineMeshes.current[i]
        if (!mine.active) { if (mesh) mesh.visible = false; continue }
        mine.life -= dt
        if (mesh) { mesh.visible = true; mesh.position.copy(mine.pos); mesh.rotation.z += dt * 1.2; const s = 0.8 + Math.sin(t * 7 + i) * 0.08; mesh.scale.setScalar(s) }
        let triggered = mine.life <= 0
        let target: Entity | null = null
        for (const e of el) {
          if (e.dead) continue
          if (_tmp.subVectors(e.position, mine.pos).lengthSq() < 2.25) { triggered = true; target = e; break }
        }
        if (triggered) {
          mine.active = false
          if (mesh) mesh.visible = false
          spawnBurst(mine.pos, 0xc084fc, 18, 6, 0.5)
          for (const e of el) {
            if (!e.dead && _tmp.subVectors(e.position, mine.pos).lengthSq() < 16) {
              hit(e, mineDamage(), player)
              e.slow = Math.max(e.slow ?? 0, 1.25)
            }
          }
          if (target && hasSynergy('arcanemine', 'storm')) spawnBurst(target.position, 0xfacc15, 12, 4, 0.4)
        }
      }
    }

    if (abilities.bloodnova > 0) {
      bloodnovaTimer.current -= dt
      if (bloodnovaTimer.current <= 0) {
        bloodnovaTimer.current = bloodnovaInterval()
        bloodNovaAnim.current = 1
        sfx.hit()
        spawnBurst(player.position, 0xef4444, 24, 5.5, 0.5)
        const radius = 5.5
        for (const e of el) {
          if (!e.dead && _tmp.subVectors(e.position, player.position).lengthSq() < radius * radius) {
            hit(e, bloodnovaDamage(), player)
            e.bleed = Math.max(e.bleed ?? 0, 2)
          }
        }
      }
      if (bloodNovaAnim.current > 0) {
        bloodNovaAnim.current -= dt * 2.5
        if (bloodNovaMesh.current) { bloodNovaMesh.current.visible = bloodNovaAnim.current > 0; bloodNovaMesh.current.position.set(player.position.x, 0.04, player.position.z); bloodNovaMesh.current.scale.setScalar((1 - bloodNovaAnim.current) * 6); (bloodNovaMesh.current.material as THREE.MeshBasicMaterial).opacity = bloodNovaAnim.current * 0.8 }
      }
    }

    if (abilities.voidrift > 0) {
      voidriftDamage
      voidriftTimer.current -= dt
      if (voidriftTimer.current <= 0 && !voidRiftActive.current) {
        voidriftTimer.current = voidriftInterval()
        const target = el.find((e) => !e.dead)
        if (target) { voidRiftActive.current = true; voidRiftLife.current = 4.5; voidRiftPos.current.copy(target.position); sfx.vortex() }
      }
      if (voidRiftActive.current) {
        voidRiftLife.current -= dt
        if (voidRiftMesh.current) { voidRiftMesh.current.visible = true; voidRiftMesh.current.position.copy(voidRiftPos.current); voidRiftMesh.current.rotation.y += dt * 3.2; voidRiftMesh.current.scale.setScalar(1 + Math.sin(t * 9) * 0.1) }
        if (Math.floor(t * 12) % 4 === 0) for (const e of el) if (!e.dead && _tmp.subVectors(e.position, voidRiftPos.current).lengthSq() < 20) hit(e, voidriftDamage() * dt * 3, player, { flash: false })
        if (voidRiftLife.current <= 0) { voidRiftActive.current = false; if (voidRiftMesh.current) voidRiftMesh.current.visible = false; spawnBurst(voidRiftPos.current, 0x7c3aed, 32, 7, 0.6) }
      }
    }

    if (abilities.mirrors > 0) {
      mirrorTimer.current -= dt
      if (mirrorTimer.current <= 0) {
        mirrorTimer.current = Math.max(0.6, 2.8 - abilities.mirrors * 0.1)
        if (mirrorMesh.current) mirrorMesh.current.visible = true
        for (const e of el) if (!e.dead && _tmp.subVectors(e.position, player.position).lengthSq() < 24 * 24) { hit(e, mirrorsDamage(), player); e.hitFlash = Math.min(1, (e.hitFlash ?? 0) + 0.25) }
      }
      if (mirrorMesh.current) { mirrorMesh.current.position.copy(player.position); mirrorMesh.current.rotation.y = -t * 1.7; mirrorMesh.current.visible = mirrorMesh.current.visible && mirrorTimer.current > 0.15 }
    }

    if (abilities.wolfpack > 0) {
      wolfTimer.current -= dt
      if (wolfTimer.current <= 0) {
        wolfTimer.current = Math.max(0.7, 3.5 - abilities.wolfpack * 0.12)
        for (let i = 0; i < Math.min(WOLF_COUNT, wolfpackCount()); i++) {
          const wolf = wolves.current[i]
          wolf.pos.copy(player.position).add(new THREE.Vector3((i - 1.5) * 0.8, 0.25, 1.2))
          wolf.leap = 1.3
          let nearest: Entity | null = null
          let best = 18 * 18
          for (const e of el) { if (!e.dead) { const d2 = _tmp.subVectors(e.position, player.position).lengthSq(); if (d2 < best) { best = d2; nearest = e } } }
          wolf.target = nearest
        }
      }
      for (let i = 0; i < wolves.current.length; i++) {
        const wolf = wolves.current[i]
        const group = wolfGroups.current[i]
        if (wolf.leap <= 0 || !wolf.target || wolf.target.dead) { if (group) group.visible = false; continue }
        wolf.leap -= dt
        const d = _tmp.subVectors(wolf.target.position, wolf.pos)
        const dist = d.length()
        if (dist > 0.2) wolf.pos.addScaledVector(d.normalize(), Math.min(dist, dt * 10))
        if (group) { group.visible = true; group.position.copy(wolf.pos); group.rotation.y = Math.atan2(d.x, d.z) }
        if (dist < 0.55) { hit(wolf.target, wolfpackDamage(), player); spawnBurst(wolf.target.position, 0x4ade80, 6, 3.5, 0.25); wolf.leap = 0; if (group) group.visible = false }
      }
    }

    if (abilities.seismic > 0) {
      seismicTimer.current -= dt
      if (seismicTimer.current <= 0) {
        seismicTimer.current = seismicInterval()
        seismicAnim.current = 1
        sfx.storm()
        const nearest = el.find((e) => !e.dead)
        if (nearest) _dir.subVectors(nearest.position, player.position).setY(0).normalize()
        else _dir.set(1, 0, 0)
      }
      if (seismicAnim.current > 0) {
        seismicAnim.current -= dt * 1.8
        const travel = (1 - seismicAnim.current) * 14
        const center = _tmp.copy(player.position).addScaledVector(_dir, travel)
        if (seismicMesh.current) { seismicMesh.current.visible = seismicAnim.current > 0.01; seismicMesh.current.position.copy(player.position); seismicMesh.current.rotation.y = Math.atan2(_dir.x, _dir.z) }
        for (const e of el) if (!e.dead && _tmp.subVectors(e.position, center).lengthSq() < 6.25) { hit(e, seismicDamage(), player); e.velocity.y += 5.2 }
      }
    }

    if (abilities.runeprison > 0) {
      prisonTimer.current -= dt
      if (prisonTimer.current <= 0 && prisonLife.current <= 0) {
        prisonTimer.current = runeprisonInterval()
        let strongest: Entity | null = null
        let bestHp = -1
        for (const e of el) if (!e.dead && e.health > bestHp) { bestHp = e.health; strongest = e }
        if (strongest) { prisonTarget.current = strongest; prisonLife.current = 3.0; sfx.storm() }
      }
      if (prisonLife.current > 0) {
        prisonLife.current -= dt
        const tgt = prisonTarget.current
        if (tgt && !tgt.dead && prisonMesh.current) {
          prisonMesh.current.visible = true
          prisonMesh.current.position.copy(tgt.position)
          prisonMesh.current.rotation.y = t * 2.5
          tgt.speed = 0.2
          if (Math.floor(t * 20) % 5 === 0) { hit(tgt, runeprisonDamage() * 0.3, player, { flash: false }); spawnBurst(tgt.position, 0x818cf8, 3, 2.5, 0.25) }
        } else { prisonLife.current = 0; if (prisonMesh.current) prisonMesh.current.visible = false }
        if (prisonLife.current <= 0 && tgt && !tgt.dead) { hit(tgt, runeprisonDamage() * 1.8, player); spawnBurst(tgt.position, 0xc084fc, 20, 6, 0.5) }
      }
    }

    if (abilities.frostfire > 0) {
      frostfireTimer.current -= dt
      if (frostfireTimer.current <= 0) {
        frostfireTimer.current = frostfireInterval()
        frostfireAnim.current = 1
        sfx.frost()
        let nearest: Entity | null = null
        let bd = 256
        for (const e of el) { if (!e.dead) { const d2 = _tmp.subVectors(e.position, player.position).lengthSq(); if (d2 < bd) { bd = d2; nearest = e } } }
        frostfireDir.current.subVectors(nearest?.position ?? player.position, player.position).setY(0).normalize()
        if (frostfireDir.current.lengthSq() < 0.01) frostfireDir.current.set(1, 0, 0)
      }
      if (frostfireAnim.current > 0) {
        frostfireAnim.current -= dt * 1.5
        const f = 1 - Math.max(0, frostfireAnim.current)
        if (frostfireMesh.current) {
          frostfireMesh.current.visible = frostfireAnim.current > 0.01
          frostfireMesh.current.position.set(player.position.x + frostfireDir.current.x * f * 14, 0.8, player.position.z + frostfireDir.current.z * f * 14)
          frostfireMesh.current.rotation.z = t * 14
          const curPos = frostfireMesh.current.position
          for (const e of el) if (!e.dead && _tmp.subVectors(e.position, curPos).lengthSq() < 6.25) { hit(e, frostfireDamage(), player); e.slow = Math.max(e.slow ?? 0, 1.5); e.burn = Math.max(e.burn ?? 0, 2); spawnBurst(e.position, Math.floor(t * 10 + e.position.x) % 2 === 0 ? 0x38bdf8 : 0xf97316, 4, 3, 0.25) }
        }
      }
    }
  })

  return (
    <group>
      {/* METEOR */}
      <group ref={meteorMesh} visible={false}>
        <mesh>
          <dodecahedronGeometry args={[1.4, 1]} />
          <meshStandardMaterial color="#ea580c" emissive="#ff3300" emissiveIntensity={3.5} roughness={0.2} />
        </mesh>
        <mesh scale={2.0}>
          <sphereGeometry args={[1.2, 16, 16]} />
          <meshBasicMaterial color="#ff6600" map={tex.plasma} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={meteorTelegraph} visible={false} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex.rune} color="#ff3311" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={meteorCrater} visible={false} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex.fire} color="#ff4400" transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* GRAVITY WELL */}
      <group ref={gravityMesh} visible={false}>
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[3.2, 3.2]} />
          <meshBasicMaterial map={tex.vortex} color="#c084fc" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} scale={1.2}>
          <planeGeometry args={[2.8, 2.8]} />
          <meshBasicMaterial map={tex.rune} color="#9333ea" transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.7, 16, 16]} />
          <meshBasicMaterial color="#0f051d" />
        </mesh>
      </group>

      {/* SOUL BOLTS */}
      {Array.from({ length: BOLT_COUNT }, (_, i) => (
        <group key={`sb${i}`} ref={(el) => { soulBoltGroups.current[i] = el }} visible={false}>
          <mesh>
            <octahedronGeometry args={[0.3, 0]} />
            <meshBasicMaterial color="#a5f3fc" toneMapped={false} />
          </mesh>
          <mesh scale={2.4}>
            <planeGeometry args={[0.6, 0.6]} />
            <meshBasicMaterial color="#06b6d4" map={tex.plasma} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/* BLADESTORM */}
      <group ref={bladeStormGroup} visible={false}>
        {Array.from({ length: 6 }, (_, i) => {
          const angle = (i / 6) * Math.PI * 2
          return (
            <group key={`bs${i}`} position={[Math.cos(angle) * 2.4, 0.6, Math.sin(angle) * 2.4]} rotation={[0, -angle + Math.PI / 2, 0.4]}>
              <mesh>
                <boxGeometry args={[0.18, 0.04, 2.0]} />
                <meshBasicMaterial color="#e0f2fe" toneMapped={false} />
              </mesh>
              <mesh scale={[3.0, 1, 1.3]}>
                <planeGeometry args={[0.8, 2.2]} />
                <meshBasicMaterial color="#0284c7" map={tex.slash} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            </group>
          )
        })}
      </group>

      {/* ARCANE MINES */}
      {Array.from({ length: MINE_COUNT }, (_, i) => (
        <group key={`am${i}`} ref={(el) => { mineMeshes.current[i] = el }} visible={false} rotation-x={-Math.PI / 2}>
          <mesh>
            <planeGeometry args={[1.5, 1.5]} />
            <meshBasicMaterial map={tex.rune} color="#ec4899" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0, 0.2]}>
            <octahedronGeometry args={[0.22, 0]} />
            <meshBasicMaterial color="#fbcfe8" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* BLOOD NOVA */}
      <mesh ref={bloodNovaMesh} visible={false} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial color="#dc2626" map={tex.blood} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* VOID RIFT */}
      <group ref={voidRiftMesh} visible={false}>
        <mesh>
          <planeGeometry args={[0.9, 3.8]} />
          <meshBasicMaterial color="#c084fc" map={tex.vortex} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh scale={1.8}>
          <planeGeometry args={[0.9, 3.8]} />
          <meshBasicMaterial color="#7c3aed" map={tex.plasma} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* MIRROR ILLUSIONS */}
      <group ref={mirrorMesh} visible={false}>
        <mesh>
          <capsuleGeometry args={[0.3, 0.9, 8, 16]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.65} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.4, 0.7]} rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.1, 0.04, 1.4]} />
          <meshBasicMaterial color="#bae6fd" transparent opacity={0.85} />
        </mesh>
      </group>

      {/* WOLF PACK */}
      {Array.from({ length: WOLF_COUNT }, (_, i) => (
        <group key={`wolf${i}`} ref={(el) => { wolfGroups.current[i] = el }} visible={false}>
          <mesh>
            <boxGeometry args={[0.4, 0.35, 0.9]} />
            <meshBasicMaterial color="#4ade80" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.2, 0.4]}>
            <boxGeometry args={[0.28, 0.28, 0.35]} />
            <meshBasicMaterial color="#86efac" transparent opacity={0.9} />
          </mesh>
        </group>
      ))}

      {/* SEISMIC WAVE */}
      <group ref={seismicMesh} visible={false}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 3]}>
          <planeGeometry args={[4.2, 7.5]} />
          <meshBasicMaterial color="#f59e0b" map={tex.fire} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* RUNE PRISON */}
      <group ref={prisonMesh} visible={false}>
        {Array.from({ length: 4 }, (_, i) => {
          const a = (i / 4) * Math.PI * 2
          return (
            <mesh key={`p${i}`} position={[Math.cos(a) * 1.8, 1.8, Math.sin(a) * 1.8]}>
              <cylinderGeometry args={[0.16, 0.16, 3.6, 8]} />
              <meshBasicMaterial color="#38bdf8" map={tex.arcane} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          )
        })}
      </group>

      {/* FROSTFIRE CRUCIBLE */}
      <group ref={frostfireMesh} visible={false}>
        <mesh position={[-0.35, 0, 0]}>
          <sphereGeometry args={[0.42, 12, 12]} />
          <meshBasicMaterial color="#38bdf8" map={tex.frost} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0.35, 0, 0]}>
          <sphereGeometry args={[0.42, 12, 12]} />
          <meshBasicMaterial color="#f97316" map={tex.plasma} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}
