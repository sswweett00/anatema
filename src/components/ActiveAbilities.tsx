import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  enemies,
  getPlayer,
  gameState,
  spawnBurst,
  type Entity,
} from '../ecs/world'
import { sfx } from '../game/audio'
import {
  abilities,
  chainDamage,
  chainTargets,
  chainInterval,
  stormDamage,
  stormTargets,
  stormInterval,
  frostDamage,
  frostRadius,
  frostInterval,
  frostSlowDur,
  vortexDamage,
  vortexRadius,
  vortexInterval,
  rollDamage,
} from '../game/abilities'

/*
 * AKTİF YETENEKLER — yalnızca seçilmişlerse çalışır.
 *   ZİNCİR KIVILCIM  → hedefler arası atlayan elektrik
 *   GÖK YARGISI      → yukarıdan inen yıldırım sütunları
 *   BUZ NEFESİ       → yavaşlatan ayaz halkası
 *   KÜL GIRDABI      → içe çeken ve öğüten hortum
 * Hepsi mutatif ECS üzerinde çalışır; görseller geçici mesh havuzlarıdır.
 */

const CHAIN_POOL = 24
const BOLT_POOL = 8

const _tmp = new THREE.Vector3()
const _to = new THREE.Vector3()

export default function ActiveAbilities() {
  const chainTimer = useRef(0)
  const stormTimer = useRef(2)
  const frostTimer = useRef(1)
  const vortexTimer = useRef(3)

  /* zincir segmentleri (iki nokta arası ince kutu) */
  const chainRefs = useRef<(THREE.Mesh | null)[]>([])
  const chainLife = useMemo(() => new Float32Array(CHAIN_POOL), [])
  /* yıldırım sütunları */
  const boltRefs = useRef<(THREE.Mesh | null)[]>([])
  const boltLife = useMemo(() => new Float32Array(BOLT_POOL), [])

  const rings = useRef<{
    frost: THREE.Mesh | null
    vortex: THREE.Mesh | null
    nova: THREE.Mesh | null
    aura: THREE.Mesh | null
  }>({
    frost: null,
    vortex: null,
    nova: null,
    aura: null,
  })
  const ringAnim = useRef({ frost: 0, vortex: 0 })

  const mats = useMemo(
    () => ({
      chain: new THREE.MeshBasicMaterial({
        color: '#7ad7ff',
        toneMapped: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      bolt: new THREE.MeshBasicMaterial({
        color: '#bfe9ff',
        toneMapped: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      frostRing: new THREE.MeshBasicMaterial({
        color: '#8fd8ff',
        toneMapped: false,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      vortexRing: new THREE.MeshBasicMaterial({
        color: '#ff9a4d',
        toneMapped: false,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    }),
    []
  )

  const spawnChain = (from: THREE.Vector3, to: THREE.Vector3) => {
    for (let i = 0; i < CHAIN_POOL; i++) {
      if (chainLife[i] <= 0) {
        chainLife[i] = 1
        const m = chainRefs.current[i]
        if (m) {
          m.position.copy(from).lerp(to, 0.5)
          m.position.y = 0.5
          m.lookAt(to.x, 0.5, to.z)
          m.scale.set(from.distanceTo(to), 1, 1)
          m.visible = true
        }
        return
      }
    }
  }

  const spawnBolt = (at: THREE.Vector3) => {
    for (let i = 0; i < BOLT_POOL; i++) {
      if (boltLife[i] <= 0) {
        boltLife[i] = 1
        const m = boltRefs.current[i]
        if (m) {
          m.position.set(at.x, 7, at.z)
          m.visible = true
        }
        return
      }
    }
  }

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const player = getPlayer()
    if (gameState.phase !== 'playing' || !player) return
    const el = enemies.entities

    /* ---------------- ZİNCİR KIVILCIM ---------------- */
    if (abilities.chain > 0) {
      chainTimer.current -= dt
      if (chainTimer.current <= 0) {
        chainTimer.current = chainInterval()
        /* en yakın düşmandan başla, oradan sek */
        let cur: Entity | null = null
        let bd = 20 * 20
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const d2 = _tmp.subVectors(e.position, player.position).lengthSq()
          if (d2 < bd) {
            bd = d2
            cur = e
          }
        }
        if (cur) {
          const hit = new Set<Entity>()
          let from = player.position
          let node: Entity | null = cur
          const dmg = chainDamage()
          for (let hop = 0; hop < chainTargets() && node; hop++) {
            const roll = rollDamage(dmg, player)
            node.health -= Math.max(1, roll.value - node.armor)
            node.hitFlash = 1
            if (roll.crit) sfx.crit()
            if (node.health <= 0) node.dead = true
            spawnBurst(node.position, 0x7ad7ff, 4, 3, 0.3)
            spawnChain(from, node.position)
            hit.add(node)
            /* sonraki en yakın (vurulmamış) düşman */
            from = node.position
            let next: Entity | null = null
            let nd = 8 * 8
            for (let i = 0; i < el.length; i++) {
              const e = el[i]
              if (e.dead || hit.has(e)) continue
              const d2 = _tmp.subVectors(e.position, from).lengthSq()
              if (d2 < nd) {
                nd = d2
                next = e
              }
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
        const inRange = el.filter((e) => {
          if (e.dead) return false
          return _tmp.subVectors(e.position, player.position).lengthSq() < 18 * 18
        })
        const n = Math.min(stormTargets(), inRange.length)
        for (let i = 0; i < n; i++) {
          const target = inRange[Math.floor(Math.random() * inRange.length)]
          if (!target || target.dead) continue
          const roll = rollDamage(stormDamage(), player)
          target.health -= Math.max(2, roll.value - target.armor)
          target.hitFlash = 1
          if (roll.crit) sfx.crit()
          if (target.health <= 0) target.dead = true
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
        const roll = rollDamage(frostDamage(), player)
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const d2 = _tmp.subVectors(e.position, player.position).lengthSq()
          if (d2 < R2) {
            e.health -= Math.max(1, roll.value - e.armor)
            e.hitFlash = 1
            e.slow = frostSlowDur()
            if (roll.crit) sfx.crit()
            if (e.health <= 0) e.dead = true
            spawnBurst(e.position, 0x8fd8ff, 4, 3, 0.4)
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
        const roll = rollDamage(vortexDamage(), player)
        for (let i = 0; i < el.length; i++) {
          const e = el[i]
          if (e.dead) continue
          const dx = e.position.x - player.position.x
          const dz = e.position.z - player.position.z
          const d2 = dx * dx + dz * dz
          if (d2 < R2) {
            /* içe çek */
            const d = Math.sqrt(d2) || 1
            e.velocity.x -= (dx / d) * 14
            e.velocity.z -= (dz / d) * 14
            e.health -= Math.max(1, roll.value - e.armor)
            e.hitFlash = 1
            if (roll.crit) sfx.crit()
            if (e.health <= 0) e.dead = true
          }
        }
        spawnBurst(player.position, 0xff9a4d, 22, 5, 0.6)
        sfx.vortex()
        gameState.shake = Math.min(1, gameState.shake + 0.3)
      }
    }

    /* ---------------- geçici görsellerin ömrü ---------------- */
    for (let i = 0; i < CHAIN_POOL; i++) {
      if (chainLife[i] > 0) {
        chainLife[i] -= dt * 4
        const m = chainRefs.current[i]
        if (m) {
          m.visible = chainLife[i] > 0
          ;(m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, chainLife[i])
        }
      }
    }
    for (let i = 0; i < BOLT_POOL; i++) {
      if (boltLife[i] > 0) {
        boltLife[i] -= dt * 3
        const m = boltRefs.current[i]
        if (m) {
          m.visible = boltLife[i] > 0
          const s = 0.4 + (1 - boltLife[i]) * 0.8
          m.scale.set(s, 1, s)
          ;(m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, boltLife[i])
        }
      }
    }
    /* halkalar: genişleyip sön */
    ringAnim.current.frost = Math.max(0, ringAnim.current.frost - dt * 1.6)
    ringAnim.current.vortex = Math.max(0, ringAnim.current.vortex - dt * 1.6)
    if (rings.current.frost) {
      const f = ringAnim.current.frost
      const pr = 1 - f
      rings.current.frost.visible = f > 0
      rings.current.frost.scale.setScalar(Math.max(0.01, pr * frostRadius() * 2))
      mats.frostRing.opacity = f * 0.8
      rings.current.frost.position.copy(player.position)
      rings.current.frost.position.y = 0.1
    }
    if (rings.current.vortex) {
      const f = ringAnim.current.vortex
      const pr = 1 - f
      rings.current.vortex.visible = f > 0
      rings.current.vortex.scale.setScalar(Math.max(0.01, pr * vortexRadius() * 2))
      mats.vortexRing.opacity = f * 0.9
      rings.current.vortex.position.copy(player.position)
      rings.current.vortex.position.y = 0.1
      rings.current.vortex.rotation.z += dt * 6
    }
  })

  return (
    <group>
      {/* zincir segmentleri */}
      {Array.from({ length: CHAIN_POOL }, (_, i) => (
        <mesh
          key={`c${i}`}
          ref={(m) => {
            chainRefs.current[i] = m
          }}
          visible={false}
          material={mats.chain}
        >
          <boxGeometry args={[1, 0.05, 0.05]} />
        </mesh>
      ))}
      {/* yıldırım sütunları */}
      {Array.from({ length: BOLT_POOL }, (_, i) => (
        <mesh
          key={`b${i}`}
          ref={(m) => {
            boltRefs.current[i] = m
          }}
          visible={false}
          material={mats.bolt}
        >
          <cylinderGeometry args={[0.14, 0.3, 14, 8]} />
        </mesh>
      ))}
      {/* ayaz halkası */}
      <mesh
        ref={(m) => {
          rings.current.frost = m
        }}
        rotation-x={-Math.PI / 2}
        visible={false}
        material={mats.frostRing}
      >
        <ringGeometry args={[0.92, 1, 48]} />
      </mesh>
      {/* girdap halkası */}
      <mesh
        ref={(m) => {
          rings.current.vortex = m
        }}
        rotation-x={-Math.PI / 2}
        visible={false}
        material={mats.vortexRing}
      >
        <ringGeometry args={[0.7, 1, 48]} />
      </mesh>
    </group>
  )
}
