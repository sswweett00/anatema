import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { enemies, getPlayer } from '../ecs/world'

/*
 * IŞIK BİRİKİNTİLERİ — sinematik karakter okunabilirliği + kontrollü bloom.
 * Geometry tabanlı glow'lar korunur; ek ışıklar karakter silüetini, metal
 * kenarlarını ve elite/boss ayrışmasını güçlendirir. Dinamik ışıklar gölge
 * üretmez, böylece yüksek kalite görünümünü ağır shadow-pass maliyeti olmadan
 * korur.
 */

function makeRadialTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Glow texture canvas context oluşturulamadı')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.88)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.38)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.10)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

const TORCH_SPOTS: [number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2
  return [Math.cos(a) * 10.5, Math.sin(a) * 10.5]
})

const ENEMY_LIGHT_BUDGET = 4

export default function Glows() {
  const torchRefs = useRef<(THREE.Mesh | null)[]>([])
  const playerGlow = useRef<THREE.Mesh>(null!)
  const centerGlow = useRef<THREE.Mesh>(null!)
  const playerKey = useRef<THREE.PointLight>(null!)
  const playerRim = useRef<THREE.PointLight>(null!)
  const playerFill = useRef<THREE.PointLight>(null!)
  const enemyLights = useRef<(THREE.PointLight | null)[]>([])

  const tex = useMemo(makeRadialTexture, [])

  const mats = useMemo(
    () => ({
      torch: new THREE.MeshBasicMaterial({
        map: tex,
        color: '#ff8a3d',
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      player: new THREE.MeshBasicMaterial({
        map: tex,
        color: '#ff7a33',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      center: new THREE.MeshBasicMaterial({
        map: tex,
        color: '#d1662a',
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    }),
    [tex],
  )

  const seeds = useMemo(() => TORCH_SPOTS.map((_, i) => i * 1.7 + 0.4), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime

    for (let i = 0; i < torchRefs.current.length; i++) {
      const m = torchRefs.current[i]
      if (!m) continue
      const f = 0.8 + Math.sin(t * 11 + seeds[i]) * 0.14 + Math.sin(t * 23 + seeds[i] * 2.3) * 0.08
      m.scale.setScalar(3.1 * f)
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.42 * f + 0.12
    }

    const p = getPlayer()
    if (p) {
      const pf = 1 + Math.sin(t * 5) * 0.08
      if (playerGlow.current) {
        playerGlow.current.position.set(p.position.x, 0.05, p.position.z)
        playerGlow.current.scale.setScalar(1.7 * pf)
      }

      if (playerKey.current) {
        playerKey.current.position.set(p.position.x + 2.8, 3.8, p.position.z + 2.2)
        playerKey.current.intensity = 12 + Math.sin(t * 2.1) * 1.5
      }
      if (playerRim.current) {
        playerRim.current.position.set(p.position.x - 2.6, 2.1, p.position.z - 2.8)
        playerRim.current.intensity = 17 + Math.sin(t * 2.7 + 1.3) * 2.2
      }
      if (playerFill.current) {
        playerFill.current.position.set(p.position.x + 0.4, 1.5, p.position.z + 3.2)
        playerFill.current.intensity = 7 + Math.sin(t * 3.3) * 0.7
      }

      /* En yakın birkaç canlı düşmana düşük maliyetli rim light.
       * Her frame sort() yerine sabit boyutlu en-yakın seçimi kullanılır. */
      const nearest: Array<{ enemy: typeof enemies.entities[number]; d2: number }> = []
      const maxD2 = 13 * 13
      for (const enemy of enemies.entities) {
        if (enemy.dead) continue
        const d2 = enemy.position.distanceToSquared(p.position)
        if (d2 > maxD2) continue
        let insert = nearest.length
        for (let i = 0; i < nearest.length; i++) {
          if (d2 < nearest[i].d2) {
            insert = i
            break
          }
        }
        if (insert >= ENEMY_LIGHT_BUDGET) continue
        nearest.splice(insert, 0, { enemy, d2 })
        if (nearest.length > ENEMY_LIGHT_BUDGET) nearest.pop()
      }

      for (let i = 0; i < ENEMY_LIGHT_BUDGET; i++) {
        const light = enemyLights.current[i]
        if (!light) continue
        const item = nearest[i]
        if (!item) {
          light.intensity = 0
          continue
        }
        const enemy = item.enemy
        const elite = (enemy.scale ?? 1) >= 1.18 || enemy.maxHealth >= 400
        light.position.set(enemy.position.x, elite ? 1.5 : 1.0, enemy.position.z + 0.9)
        const pulse = 0.85 + Math.sin(t * (elite ? 5.5 : 3.8) + i * 1.7) * 0.15
        light.intensity = (elite ? 7.5 : 3.2) * pulse
        light.distance = elite ? 5.5 : 3.4
        light.decay = 2
        light.color.setHex(elite ? 0xff8d42 : 0x8fd0ff)
      }
    } else {
      for (const light of enemyLights.current) {
        if (light) light.intensity = 0
      }
    }

    if (centerGlow.current) {
      const cf = 1 + Math.sin(t * 1.6) * 0.06
      centerGlow.current.scale.setScalar(4.6 * cf)
    }
  })

  return (
    <>
      <EffectComposer>
        <Bloom
          intensity={0.58}
          luminanceThreshold={0.74}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.2} darkness={0.44} />
        <Noise premultiply opacity={0.014} />
      </EffectComposer>

      {/* Karakter ayrıştırma ışığı: gölge üretmez, yüksek entity sayısında güvenlidir. */}
      <pointLight ref={playerKey} color="#ffd3a3" distance={14} decay={2} />
      <pointLight ref={playerRim} color="#7faeff" distance={11} decay={2} />
      <pointLight ref={playerFill} color="#ffb06b" distance={10} decay={2} />
      {Array.from({ length: ENEMY_LIGHT_BUDGET }, (_, i) => (
        <pointLight
          key={`enemy-rim-${i}`}
          ref={(light) => {
            enemyLights.current[i] = light
          }}
          intensity={0}
          distance={4}
          decay={2}
        />
      ))}

      <group>
        {TORCH_SPOTS.map((pos, i) => (
          <mesh
            key={`t${i}`}
            ref={(el) => {
              torchRefs.current[i] = el
            }}
            rotation-x={-Math.PI / 2}
            position={[pos[0], 0.06, pos[1]]}
            material={mats.torch}
          >
            <circleGeometry args={[1, 32]} />
          </mesh>
        ))}
        <mesh ref={playerGlow} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} material={mats.player}>
          <circleGeometry args={[1, 32]} />
        </mesh>
        <mesh ref={centerGlow} rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} material={mats.center}>
          <circleGeometry args={[1, 32]} />
        </mesh>
      </group>
    </>
  )
}