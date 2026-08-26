import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { enemies, getPlayer, gameState, spawnBurst, type Entity } from '../ecs/world'
import { sfx } from '../game/audio'
import { pushDamage } from '../game/fx'
import { softDotTexture, softRingTexture, boltTexture, firePoolTexture } from '../game/textures'
import {
  abilities,
  hasSynergy,
  novaRadius,
  chainDamage, chainTargets, chainInterval,
  stormDamage, stormTargets, stormInterval,
  frostDamage, frostRadius, frostInterval, frostSlowDur,
  vortexDamage, vortexRadius, vortexInterval,
  spikesDamage, spikesCount, spikesInterval, spikesRadius,
  pyreDamage, pyreInterval, pyreRadius, pyreLife,
  phantomDamage, phantomInterval, phantomRange,
  venomDamage, venomInterval, venomRadius, venomDur,
  rollDamage,
} from '../game/abilities'

/*
 * AKTİF YETENEKLER — yalnızca seçilmişlerse çalışır.
 *   ZİNCİR KIVILCIM · GÖK YARGISI · BUZ NEFESİ · KÜL GIRDABI
 *   TOPRAK DİKENİ  · ALEV İZİ     · HAYALET KILIÇ · ZEHİR BULUTU
 * Görseller: çekirdek + ışıltı katmanlı mesh havuzları (compositor yok).
 */

const CHAIN_POOL = 22
const BOLT_POOL = 8
const SPIKE_POOL = 10
const PYRE_POOL = 26
const PHANTOM_POOL = 6
const VENOM_POOL = 4

const _tmp = new THREE.Vector3()
const _hitPos = new THREE.Vector3()

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

export default function ActiveAbilities() {
  const chainTimer = useRef(0)
  const stormTimer = useRef(2)
  const frostTimer = useRef(1)
  const vortexTimer = useRef(3)
  const spikesTimer = useRef(1.4)
  const pyreTimer = useRef(0)
  const phantomTimer = useRef(2.5)
  const venomTimer = useRef(2)

  /* zincir: grup[çekirdek kutu, ışıltı kutusu] */
  const chainGroups = useRef<(THREE.Group | null)[]>([])
  const chainLife = useMemo(() => new Float32Array(CHAIN_POOL), [])
  /* yıldırım: grup[çekirdek düzlem, ışıltı düzlem, zemin flaşı] */
  const boltGroups = useRef<(THREE.Group | null)[]>([])
  const boltLife = useMemo(() => new Float32Array(BOLT_POOL), [])
  /* dikenler: grup[koni, çatlak ışıltısı] */
  const spikeGroups = useRef<(THREE.Group | null)[]>([])
  const spikeLife = useMemo(() => new Float32Array(SPIKE_POOL), [])
  /* alev izi havuzu */
  const pyreRefs = useRef<(THREE.Mesh | null)[]>([])
  const pyreState = useMemo(() => new Float32Array(PYRE_POOL), [])
  /* hayalet kavis */
  const phantomRefs = useRef<(THREE.Mesh | null)[]>([])
  const phantomLife = useMemo(() => new Float32Array(PHANTOM_POOL), [])
  /* zehir bulutu */
  const venomRefs = useRef<(THREE.Mesh | null)[]>([])
  const venomState = useMemo(() => new Float32Array(VENOM_POOL), [])

  const rings = useRef<{ frost: THREE.Group | null; vortex: THREE.Group | null; nova: THREE.Group | null }>({
    frost: null,
    vortex: null,
    nova: null,
  })
  const ringAnim = useRef({ frost: 0, vortex: 0, nova: 0 })

  const tex = useMemo(
    () => ({
      dot: softDotTexture(),
      ring: softRingTexture(),
      bolt: boltTexture(),
      fire: firePoolTexture(),
    }),
    []
  )

  const mats = useMemo(
    () => ({
      chainCore: new THREE.MeshBasicMaterial({ color: '#cfeeff', toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      chainGlow: new THREE.MeshBasicMaterial({ color: '#3d9fd6', toneMapped: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      boltCore: new THREE.MeshBasicMaterial({ color: '#eaf6ff', map: tex.bolt, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      boltGlow: new THREE.MeshBasicMaterial({ color: '#7db8ff', map: tex.dot, toneMapped: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
      groundFlash: new THREE.MeshBasicMaterial({ color: '#bfe4ff', map: tex.dot, toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      frostRing: new THREE.MeshBasicMaterial({ color: '#8fd8ff', map: tex.ring, toneMapped: false, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      frostFill: new THREE.MeshBasicMaterial({ color: '#4a9fd0', map: tex.dot, toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      vortexRing: new THREE.MeshBasicMaterial({ color: '#ff9a4d', map: tex.ring, toneMapped: false, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      vortexFill: new THREE.MeshBasicMaterial({ color: '#d1662a', map: tex.dot, toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      novaRing: new THREE.MeshBasicMaterial({ color: '#ff8a3d', map: tex.ring, toneMapped: false, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      novaFill: new THREE.MeshBasicMaterial({ color: '#d1662a', map: tex.dot, toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      spike: new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 0.95, flatShading: true }),
      spikeGlow: new THREE.MeshBasicMaterial({ color: '#ff9a4d', map: tex.dot, toneMapped: false, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
      pyre: new THREE.MeshBasicMaterial({ color: '#ff8a3d', map: tex.fire, toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      phantom: new THREE.MeshBasicMaterial({ color: '#cfe4ff', map: tex.dot, toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      venom: new THREE.MeshBasicMaterial({ color: '#5fd068', map: tex.dot, toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    }),
    [tex]
  )

  const spawnChain = (from: THREE.Vector3, to: THREE.Vector3) => {
    for (let i = 0; i < CHAIN_POOL; i++) {
      if (chainLife[i] <= 0) {
        chainLife[i] = 1
        const g = chainGroups.current[i]
        if (g) {
          const d = _tmp.subVectors(to, from)
          const len = Math.hypot(d.x, d.z) || 0.01
          g.position.set((from.x + to.x) / 2, 0.55, (from.z + to.z) / 2)
          g.rotation.y = Math.atan2(d.x, d.z)
          g.scale.set(1, 1, len)
          g.visible = true
        }
        return
      }
    }
  }

  const spawnBolt = (at: THREE.Vector3) => {
    for (let i = 0; i < BOLT_POOL; i++) {
      if (boltLife[i] <= 0) {
        boltLife[i] = 1
        const g = boltGroups.current[i]
        if (g) {
          g.position.set(at.x, 0, at.z)
          g.visible = true
        }
        return
      }
    }
  }

  const spawnSpike = (at: THREE.Vector3) => {
    for (let i = 0; i < SPIKE_POOL; i++) {
      if (spikeLife[i] <= 0) {
        spikeLife[i] = 1
        const g = spikeGroups.current[i]
        if (g) {
          g.position.set(at.x + (Math.random() - 0.5) * 0.8, 0, at.z + (Math.random() - 0.5) * 0.8)
          g.rotation.y = Math.random() * Math.PI
          g.visible = true
        }
        return
      }
    }
  }

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    const player = getPlayer()
    if (gameState.phase !== 'playing' || !player) return
    const el = enemies.entities

    /* ---------------- ZİNCİR KIVILCIM ---------------- */
    if (abilities.chain > 0) {
      chainTimer.current -= dt
      if (chainTimer.current <= 0) {
        chainTimer.current = chainInterval()
        let cur: Entity | null = null
        let bd = 20 * 20
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const d2 = _tmp.subVectors(e.position, player.position).lengthSq()
          if (d2 < bd) { bd = d2; cur = e }
        }
        if (cur) {
          const seen = new Set<Entity>()
          let from = player.position
          let node: Entity | null = cur
          for (let hop = 0; hop < chainTargets() && node; hop++) {
            hit(node, chainDamage(), player)
            spawnBurst(node.position, 0x7ad7ff, 4, 3, 0.3)
            spawnChain(from, node.position)
            seen.add(node)
            from = node.position
            let next: Entity | null = null
            let nd = 8 * 8
            for (let i = 0; i < el.length; i++) {
              const e = el[i]
              if (e.dead || seen.has(e)) continue
              const d2 = _tmp.subVectors(e.position, from).lengthSq()
              if (d2 < nd) { nd = d2; next = e }
            }
            node = next
          }
          sfx.chain()
        }
      }
    }

    /* ---------------- GÖK YARGISI ---------------- */
    if (abilities.storm > 0) {
      stormTimer.current -= dt
      if (stormTimer.current <= 0) {
        stormTimer.current = stormInterval()
        const inRange: Entity[] = []
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (!e.dead && _tmp.subVectors(e.position, player.position).lengthSq() < 18 * 18) inRange.push(e)
        }
        const n = Math.min(stormTargets(), inRange.length)
        for (let i = 0; i < n; i++) {
          const target = inRange[Math.floor(Math.random() * inRange.length)]
          if (!target || target.dead) continue
          hit(target, stormDamage(), player)
          spawnBolt(target.position)
          spawnBurst(target.position, 0xbfe9ff, 10, 5, 0.5)
        }
        if (n > 0) {
          sfx.storm()
          gameState.shake = Math.min(1, gameState.shake + 0.4)
        }
      }
    }

    /* ---------------- BUZ NEFESİ ---------------- */
    if (abilities.frost > 0) {
      frostTimer.current -= dt
      if (frostTimer.current <= 0) {
        frostTimer.current = frostInterval()
        const R = frostRadius()
        const R2 = R * R
        ringAnim.current.frost = 1
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const d2 = _tmp.subVectors(e.position, player.position).lengthSq()
          if (d2 < R2) {
            hit(e, frostDamage(), player)
            e.slow = frostSlowDur()
            spawnBurst(e.position, 0x8fd8ff, 3, 3, 0.35)
          }
        }
        sfx.frost()
      }
    }

    /* ---------------- KÜL GIRDABI ---------------- */
    if (abilities.vortex > 0) {
      vortexTimer.current -= dt
      if (vortexTimer.current <= 0) {
        vortexTimer.current = vortexInterval()
        const R = vortexRadius()
        const R2 = R * R
        ringAnim.current.vortex = 1
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const dx = e.position.x - player.position.x
          const dz = e.position.z - player.position.z
          const d2 = dx * dx + dz * dz
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1
            e.velocity.x -= (dx / d) * 14
            e.velocity.z -= (dz / d) * 14
            hit(e, vortexDamage(), player)
          }
        }
        spawnBurst(player.position, 0xff9a4d, 22, 5, 0.6)
        sfx.vortex()
        gameState.shake = Math.min(1, gameState.shake + 0.3)
      }
    }

    /* ---------------- TOPRAK DİKENİ ---------------- */
    if (abilities.spikes > 0) {
      spikesTimer.current -= dt
      if (spikesTimer.current <= 0) {
        spikesTimer.current = spikesInterval()
        const inRange: Entity[] = []
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (!e.dead && _tmp.subVectors(e.position, player.position).lengthSq() < 16 * 16) inRange.push(e)
        }
        const n = Math.min(spikesCount(), inRange.length)
        for (let i = 0; i < n; i++) {
          const target = inRange[Math.floor(Math.random() * inRange.length)]
          if (!target || target.dead) continue
          spawnSpike(target.position)
          const R2 = spikesRadius() * spikesRadius()
          for (let j = 0; j < el.length; j++) {
            const e = el[j]
            if (e.dead) continue
            const d2 = _tmp.subVectors(e.position, target.position).lengthSq()
            if (d2 < R2) {
              hit(e, spikesDamage(), player)
              e.velocity.y = 0 /* yere sabitlen */
              spawnBurst(e.position, 0x8a7458, 4, 3.4, 0.4)
            }
          }
        }
        if (n > 0) {
          sfx.nova()
          gameState.shake = Math.min(1, gameState.shake + 0.25)
        }
      }
    }

    /* ---------------- ALEV İZİ ---------------- */
    if (abilities.pyre > 0) {
      const speedAmt = Math.hypot(player.velocity.x, player.velocity.z)
      pyreTimer.current -= dt
      if (pyreTimer.current <= 0 && speedAmt > 1.2) {
        pyreTimer.current = pyreInterval()
        /* en eskisini devşir */
        let oldest = 0
        let minLife = Infinity
        for (let i = 0; i < PYRE_POOL; i++) {
          if (pyreState[i] <= 0) { oldest = i; break }
          if (pyreState[i] < minLife) { minLife = pyreState[i]; oldest = i }
        }
        pyreState[oldest] = pyreLife()
        const m = pyreRefs.current[oldest]
        if (m) {
          m.position.set(player.position.x, 0.05, player.position.z)
          m.scale.setScalar(pyreRadius() * 2)
          m.visible = true
        }
      }
      /* yanma hasarı */
      const tickR2 = pyreRadius() * pyreRadius()
      for (let i = 0; i < PYRE_POOL; i++) {
        if (pyreState[i] <= 0) continue
        pyreState[i] -= dt
        const m = pyreRefs.current[i]
        if (m) {
          const f = pyreState[i] / pyreLife()
          m.visible = f > 0
          ;(m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, f * 2.4) * (0.75 + Math.sin(t * 17 + i) * 0.2)
        }
        if (Math.floor((pyreState[i] + dt) * 3) !== Math.floor(pyreState[i] * 3)) {
          const mp = pyreRefs.current[i]
          if (!mp) continue
          for (let j = 0; j < el.length; j++) {
            const e = el[j]
            if (e.dead) continue
            const d2 = _tmp.subVectors(e.position, mp.position).lengthSq()
            if (d2 < tickR2) hit(e, pyreDamage(), player, { flash: false })
          }
          spawnBurst(mp.position, 0xff8a3d, 2, 1.6, 0.3)
        }
      }
    }

    /* ---------------- HAYALET KILIÇ ---------------- */
    if (abilities.phantom > 0) {
      phantomTimer.current -= dt
      if (phantomTimer.current <= 0) {
        phantomTimer.current = phantomInterval()
        /* en yakın düşman yönüne kavis */
        let best: Entity | null = null
        let bd = 14 * 14
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const d2 = _tmp.subVectors(e.position, player.position).lengthSq()
          if (d2 < bd) { bd = d2; best = e }
        }
        if (best) {
          const yaw = Math.atan2(best.position.x - player.position.x, best.position.z - player.position.z)
          for (let i = 0; i < PHANTOM_POOL; i++) {
            if (phantomLife[i] <= 0) {
              phantomLife[i] = 1
              const m = phantomRefs.current[i]
              if (m) {
                m.position.set(player.position.x, 0.65, player.position.z)
                m.rotation.set(0, yaw, 0)
                m.visible = true
              }
              break
            }
          }
          /* sektör hasarı */
          const R = phantomRange()
          const R2 = R * R
          const cosT = Math.cos(0.85)
          const dirX = Math.sin(yaw)
          const dirZ = Math.cos(yaw)
          for (let i = 0; i < el.length; i++) {
            const e = el[i]
            if (e.dead) continue
            const dx = e.position.x - player.position.x
            const dz = e.position.z - player.position.z
            const d2 = dx * dx + dz * dz
            if (d2 < R2) {
              const d = Math.sqrt(d2) || 1
              const dot = (dx / d) * dirX + (dz / d) * dirZ
              if (dot > cosT) {
                hit(e, phantomDamage(), player)
                spawnBurst(e.position, 0xcfe4ff, 3, 2.6, 0.3)
              }
            }
          }
          sfx.slash()
        }
      }
    }

    /* ---------------- ZEHİR BULUTU ---------------- */
    if (abilities.venom > 0) {
      venomTimer.current -= dt
      if (venomTimer.current <= 0) {
        venomTimer.current = venomInterval()
        let best: Entity | null = null
        let bd = 16 * 16
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const d2 = _tmp.subVectors(e.position, player.position).lengthSq()
          if (d2 < bd) { bd = d2; best = e }
        }
        if (best) {
          _hitPos.copy(best.position)
          for (let i = 0; i < VENOM_POOL; i++) {
            if (venomState[i] <= 0) {
              venomState[i] = venomDur()
              const m = venomRefs.current[i]
              if (m) {
                m.position.set(_hitPos.x, 0.06, _hitPos.z)
                m.scale.setScalar(venomRadius() * 2)
                m.visible = true
              }
              break
            }
          }
          spawnBurst(_hitPos, 0x5fd068, 12, 3, 0.5)
          sfx.frost()
        }
      }
      /* zehir DoT */
      const toxic = hasSynergy('toxicfrost')
      for (let i = 0; i < VENOM_POOL; i++) {
        if (venomState[i] <= 0) continue
        venomState[i] -= dt
        const m = venomRefs.current[i]
        if (m) {
          const f = venomState[i] / venomDur()
          m.visible = f > 0
          ;(m.material as THREE.MeshBasicMaterial).opacity = Math.min(0.75, f * 2.2) * (0.85 + Math.sin(t * 9 + i) * 0.15)
          m.rotation.z += dt * 0.6
        }
        if (Math.floor((venomState[i] + dt) * 2) !== Math.floor(venomState[i] * 2)) {
          const mp = venomRefs.current[i]
          if (!mp) continue
          const R2 = venomRadius() * venomRadius()
          for (let j = 0; j < el.length; j++) {
            const e = el[j]
            if (e.dead) continue
            const d2 = _tmp.subVectors(e.position, mp.position).lengthSq()
            if (d2 < R2) {
              const doubled = toxic && e.slow !== undefined && e.slow > 0
              hit(e, venomDamage() * (doubled ? 2 : 1), player, { flash: false })
              if (Math.random() < 0.3) spawnBurst(e.position, 0x5fd068, 2, 1.4, 0.3)
            }
          }
        }
      }
    }

    /* ---------------- geçici görsellerin ömrü ---------------- */
    for (let i = 0; i < CHAIN_POOL; i++) {
      if (chainLife[i] > 0) {
        chainLife[i] -= dt * 4.5
        const g = chainGroups.current[i]
        if (g) {
          g.visible = chainLife[i] > 0
          const core = g.children[0] as THREE.Mesh
          const glow = g.children[1] as THREE.Mesh
          ;(core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, chainLife[i])
          ;(glow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, chainLife[i]) * 0.4
        }
      }
    }
    for (let i = 0; i < BOLT_POOL; i++) {
      if (boltLife[i] > 0) {
        boltLife[i] -= dt * 3.2
        const g = boltGroups.current[i]
        if (g) {
          g.visible = boltLife[i] > 0
          const core = g.children[0] as THREE.Mesh
          const glow = g.children[1] as THREE.Mesh
          const flash = g.children[2] as THREE.Mesh
          ;(core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, boltLife[i])
          ;(glow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, boltLife[i]) * 0.55
          ;(flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, boltLife[i]) * 0.8
          const wob = 1 + Math.sin(t * 60 + i) * 0.25
          core.scale.x = wob
        }
      }
    }
    for (let i = 0; i < SPIKE_POOL; i++) {
      if (spikeLife[i] > 0) {
        spikeLife[i] -= dt * 1.8
        const g = spikeGroups.current[i]
        if (g) {
          const p = 1 - spikeLife[i]
          const rise = p < 0.22 ? p / 0.22 : p > 0.75 ? Math.max(0, (1 - p) / 0.25) : 1
          g.visible = rise > 0.01
          g.position.y = -(1 - rise) * 1.1
          const glow = g.children[1] as THREE.Mesh
          ;(glow.material as THREE.MeshBasicMaterial).opacity = rise * 0.8 * (0.7 + Math.sin(t * 20 + i) * 0.3)
        }
      }
    }
    for (let i = 0; i < PHANTOM_POOL; i++) {
      if (phantomLife[i] > 0) {
        phantomLife[i] -= dt * 3
        const m = phantomRefs.current[i]
        if (m) {
          m.visible = phantomLife[i] > 0
          ;(m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, phantomLife[i]) * 0.7
          const s = 1 + (1 - phantomLife[i]) * 0.5
          m.scale.set(s, s, s)
        }
      }
    }

    /* halkalar */
    ringAnim.current.frost = Math.max(0, ringAnim.current.frost - dt * 1.6)
    ringAnim.current.vortex = Math.max(0, ringAnim.current.vortex - dt * 1.6)
    /* kül fırtınası halkası — tetik gameState.flashNova'dan gelir */
    ringAnim.current.nova = Math.max(ringAnim.current.nova - dt * 1.9, gameState.flashNova)
    if (rings.current.nova) {
      const f = ringAnim.current.nova
      const pr = 1 - f
      rings.current.nova.visible = f > 0.001
      rings.current.nova.scale.setScalar(Math.max(0.01, pr * novaRadius() * 2))
      mats.novaRing.opacity = f * 0.95
      mats.novaFill.opacity = f * 0.4
      const icy = hasSynergy('glacier')
      mats.novaRing.color.set(icy ? '#9fdcff' : '#ff8a3d')
      mats.novaFill.color.set(icy ? '#4a9fd0' : '#d1662a')
      rings.current.nova.position.set(player.position.x, 0.12, player.position.z)
    }
    if (rings.current.frost) {
      const f = ringAnim.current.frost
      const pr = 1 - f
      rings.current.frost.visible = f > 0
      rings.current.frost.scale.setScalar(Math.max(0.01, pr * frostRadius() * 2))
      mats.frostRing.opacity = f * 0.9
      mats.frostFill.opacity = f * 0.35
      rings.current.frost.position.set(player.position.x, 0.1, player.position.z)
    }
    if (rings.current.vortex) {
      const f = ringAnim.current.vortex
      const pr = 1 - f
      rings.current.vortex.visible = f > 0
      rings.current.vortex.scale.setScalar(Math.max(0.01, pr * vortexRadius() * 2))
      mats.vortexRing.opacity = f * 0.95
      mats.vortexFill.opacity = f * 0.4
      rings.current.vortex.position.set(player.position.x, 0.1, player.position.z)
      rings.current.vortex.rotation.y += dt * 6
    }
  })

  return (
    <group>
      {/* zincir segmentleri: çekirdek + ışıltı */}
      {Array.from({ length: CHAIN_POOL }, (_, i) => (
        <group
          key={`c${i}`}
          visible={false}
          ref={(el) => { chainGroups.current[i] = el }}
        >
          <mesh material={mats.chainCore}>
            <boxGeometry args={[0.09, 0.09, 1]} />
          </mesh>
          <mesh material={mats.chainGlow} scale={[3.4, 3.4, 1]}>
            <boxGeometry args={[0.09, 0.09, 1]} />
          </mesh>
        </group>
      ))}

      {/* yıldırım: çekirdek + ışıltı + zemin flaşı */}
      {Array.from({ length: BOLT_POOL }, (_, i) => (
        <group
          key={`b${i}`}
          visible={false}
          ref={(el) => { boltGroups.current[i] = el }}
        >
          <mesh position={[0, 7, 0]} material={mats.boltCore}>
            <planeGeometry args={[0.5, 14]} />
          </mesh>
          <mesh position={[0, 7, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.boltCore}>
            <planeGeometry args={[0.5, 14]} />
          </mesh>
          <mesh position={[0, 0.08, 0]} rotation-x={-Math.PI / 2} material={mats.groundFlash} scale={3.2}>
            <planeGeometry args={[1.6, 1.6]} />
          </mesh>
        </group>
      ))}

      {/* dikenler */}
      {Array.from({ length: SPIKE_POOL }, (_, i) => (
        <group
          key={`s${i}`}
          visible={false}
          ref={(el) => { spikeGroups.current[i] = el }}
        >
          <mesh material={mats.spike} castShadow>
            <coneGeometry args={[0.22, 1.5, 7]} />
          </mesh>
          <mesh position={[0, -0.6, 0]} rotation-x={-Math.PI / 2} material={mats.spikeGlow} scale={1.6}>
            <planeGeometry args={[1.4, 1.4]} />
          </mesh>
        </group>
      ))}

      {/* alev izi */}
      {Array.from({ length: PYRE_POOL }, (_, i) => (
        <mesh
          key={`p${i}`}
          visible={false}
          rotation-x={-Math.PI / 2}
          material={mats.pyre}
          ref={(el) => { pyreRefs.current[i] = el }}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}

      {/* hayalet kavis */}
      {Array.from({ length: PHANTOM_POOL }, (_, i) => (
        <mesh
          key={`h${i}`}
          visible={false}
          material={mats.phantom}
          ref={(el) => { phantomRefs.current[i] = el }}
        >
          <planeGeometry args={[phantomRange() * 2.2, phantomRange() * 2.2]} />
        </mesh>
      ))}

      {/* zehir bulutu */}
      {Array.from({ length: VENOM_POOL }, (_, i) => (
        <mesh
          key={`v${i}`}
          visible={false}
          rotation-x={-Math.PI / 2}
          material={mats.venom}
          ref={(el) => { venomRefs.current[i] = el }}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}

      {/* ayaz halkası */}
      <group
        visible={false}
        ref={(el) => { rings.current.frost = el }}
      >
        <mesh rotation-x={-Math.PI / 2} material={mats.frostRing}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} material={mats.frostFill} scale={0.82}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </group>

      {/* girdap halkası */}
      <group
        visible={false}
        ref={(el) => { rings.current.vortex = el }}
      >
        <mesh rotation-x={-Math.PI / 2} material={mats.vortexRing}>
          <planeGeometry args={[1, 1]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} material={mats.vortexFill} scale={0.7}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      </group>
    </group>
  )
}
