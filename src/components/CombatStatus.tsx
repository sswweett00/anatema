import { useEffect, useRef } from 'react'
import { gameState, getPlayer, enemies } from '../ecs/world'
import { abilities } from '../game/abilities'

function resonance(): string {
  const values = [
    ['PYRO', abilities.pyre + abilities.nova * 0.8],
    ['CRYO', abilities.frost + abilities.orbit * 0.6],
    ['STORM', abilities.storm + abilities.chain * 0.6],
    ['VENOM', abilities.venom + abilities.harvest * 0.3],
    ['VOID', abilities.vortex + abilities.phantom * 0.6],
    ['IRON', abilities.armor + abilities.stone * 0.8],
    ['BLOOD', abilities.rage + abilities.vamp * 0.8],
  ] as const
  return values.reduce((best, current) => current[1] > best[1] ? current : best, values[0])[1] > 0
    ? values.reduce((best, current) => current[1] > best[1] ? current : best, values[0])[0]
    : '—'
}

function comboTier(combo: number): string {
  if (combo >= 100) return 'APOKALİPS'
  if (combo >= 60) return 'YIKIM'
  if (combo >= 30) return 'SAVAŞ MAKİNESİ'
  if (combo >= 20) return 'FIRTINA'
  if (combo >= 10) return 'RİTİM'
  return 'HAZIR'
}

export default function CombatStatus() {
  const root = useRef<HTMLDivElement>(null)
  const resonanceRef = useRef<HTMLSpanElement>(null)
  const tierRef = useRef<HTMLSpanElement>(null)
  const pressureRef = useRef<HTMLSpanElement>(null)
  const riskRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const player = getPlayer()
      if (root.current) root.current.style.opacity = gameState.phase === 'playing' ? '1' : '0'
      if (resonanceRef.current) resonanceRef.current.textContent = resonance()
      if (tierRef.current) tierRef.current.textContent = comboTier(gameState.combo)
      if (pressureRef.current) pressureRef.current.textContent = `${enemies.entities.length}`
      if (riskRef.current && player) {
        const hpRisk = 1 - player.health / Math.max(1, player.maxHealth)
        const comboRisk = Math.min(1, gameState.combo / 120)
        const risk = Math.round(Math.min(1, hpRisk * 0.7 + comboRisk * 0.3) * 100)
        riskRef.current.textContent = `${risk}%`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={root} className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-2 opacity-0 transition-opacity duration-200">
      <div className="plate px-3 py-1.5 text-[9px] tracking-[0.16em] text-ash">REZONANS <span ref={resonanceRef} className="ml-1 font-bold text-ember">—</span></div>
      <div className="plate px-3 py-1.5 text-[9px] tracking-[0.16em] text-ash">RİTİM <span ref={tierRef} className="ml-1 font-bold text-bone">HAZIR</span></div>
      <div className="plate px-3 py-1.5 text-[9px] tracking-[0.16em] text-ash">SÜRÜ <span ref={pressureRef} className="ml-1 font-bold text-bone">0</span></div>
      <div className="plate px-3 py-1.5 text-[9px] tracking-[0.16em] text-ash">RİSK <span ref={riskRef} className="ml-1 font-bold text-rust">0%</span></div>
    </div>
  )
}
