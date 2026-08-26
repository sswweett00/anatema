import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { getPlayer } from '../ecs/world'

/*
 * IŞIK BİRİKİNTİLERİ — additif zemin parıltıları + hafif sinematik compositor.
 * Post-processing sahneye kontrollü bloom, vignette ve film grain ekler.
 * Geometry tabanlı glow'lar ise compositor çalışmasa bile temel görsel dili korur.
 */

function makeRadialTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Glow texture canvas context oluşturulamadı')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.32)')
  g.addColorStop(0.65, 'rgba(255,255,255,0.08)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

const TORCH_SPOTS: [number, number][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2
  return [Math.cos(a) * 10.5, Math.sin(a) * 10.5]
})

export default function Glows() {
  const torchRefs = useRef<(THREE.Mesh | null)[]>([])
  const playerGlow = useRef<THREE.Mesh>(null!)
  const centerGlow = useRef<THREE.Mesh>(null!)

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
    [tex]
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
    if (p && playerGlow.current) {
      playerGlow.current.position.set(p.position.x, 0.05, p.position.z)
      const pf = 1 + Math.sin(t * 5) * 0.08
      playerGlow.current.scale.setScalar(1.7 * pf)
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
          intensity={0.52}
          luminanceThreshold={0.78}
          luminanceSmoothing={0.22}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.2} darkness={0.46} />
        <Noise premultiply opacity={0.018} />
      </EffectComposer>
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
