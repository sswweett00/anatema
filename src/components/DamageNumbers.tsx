import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { dmgEvents } from '../game/fx'
import { gameState } from '../ecs/world'

/*
 * UÇAN HASAR SAYILARI — dünya koordinatlarını izometrik kameradan
 * ekran uzayına izdüşürür. RAF ile çalışır, re-render yok.
 *   · normal vuruş: kemik rengi
 *   · kritik: büyük, altın
 *   · ruh (XP): küçük, yeşilimsi "+n"
 */

const _v = new THREE.Vector3()

export default function DamageNumbers() {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const now = performance.now() / 1000
      const cam = gameState.cam
      const w = window.innerWidth
      const h = window.innerHeight
      if (cam) {
        for (let i = 0; i < dmgEvents.length; i++) {
          const e = dmgEvents[i]
          const el = itemRefs.current[i]
          if (!el) continue
          const age = now - e.t
          if (age < 0 || age > 0.85) {
            el.style.opacity = '0'
            continue
          }
          _v.set(e.x, e.y + age * 1.6, e.z).project(cam)
          if (_v.z > 1) {
            el.style.opacity = '0'
            continue
          }
          const x = (_v.x * 0.5 + 0.5) * w
          const y = (-_v.y * 0.5 + 0.5) * h
          const fade = 1 - age / 0.85
          el.style.opacity = String(Math.min(1, fade * 2))
          const popIn = Math.min(1, age * 9)
          const base = e.crit ? 21 : e.soul ? 11 : 14
          const scale = e.crit ? 0.6 + popIn * 0.55 : 0.8 + popIn * 0.2
          el.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale})`
          el.style.fontSize = `${base}px`
          el.style.color = e.soul ? '#8fe0b8' : e.crit ? '#ffd24d' : '#f2e8d8'
          el.textContent = e.soul ? `+${e.val}` : `${e.val}`
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {dmgEvents.map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            itemRefs.current[i] = el
          }}
          className="font-display absolute left-0 top-0 font-black"
          style={{
            opacity: 0,
            willChange: 'transform,opacity',
            textShadow: '0 1px 2px #000, 0 0 10px rgba(0,0,0,0.7)',
          }}
        />
      ))}
    </div>
  )
}
