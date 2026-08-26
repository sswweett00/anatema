import { useEffect, useState } from 'react'
import { getBiome } from '../game/arena_director'
import { activeEvolutions } from '../game/weapon_evolution'
import { events } from '../game/events'

export default function WorldStatus() {
  const [biome, setBiome] = useState(getBiome())
  const [evolved, setEvolved] = useState(activeEvolutions())

  useEffect(() => {
    const offBiome = events.on('arena:biome', () => setBiome(getBiome()))
    const offEvolution = events.on('ability:evolve', () => setEvolved(activeEvolutions()))
    return () => {
      offBiome()
      offEvolution()
    }
  }, [])

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-40 flex max-w-[min(28rem,70vw)] flex-col items-end gap-1 text-right">
      <div className="rounded border border-white/10 bg-black/35 px-3 py-1.5 backdrop-blur-sm">
        <div className="font-display text-[10px] font-black tracking-[0.28em] text-white/50">BİYOM</div>
        <div className="font-display text-xs font-black tracking-[0.16em] text-[#ffd39a]">{biome.name}</div>
        <div className="text-[9px] tracking-[0.14em] text-white/45">TEHLİKE · {biome.hazard.toUpperCase()}</div>
      </div>
      {evolved.length > 0 && (
        <div className="rounded border border-[#d7a2ff]/20 bg-black/35 px-3 py-1.5 backdrop-blur-sm">
          <div className="font-display text-[10px] font-black tracking-[0.28em] text-[#d7a2ff]/70">EVRİMLER</div>
          <div className="flex max-w-64 flex-wrap justify-end gap-x-2 gap-y-0.5">
            {evolved.slice(-4).map((item) => (
              <span key={item.id} className="text-[9px] font-semibold text-[#eadbff]">{item.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
