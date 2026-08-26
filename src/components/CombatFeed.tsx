import { useEffect, useState } from 'react'
import { events } from '../game/events'

interface FeedItem {
  id: number
  text: string
  tone: 'normal' | 'danger' | 'power' | 'loot'
}

let idCounter = 0

export default function CombatFeed() {
  const [items, setItems] = useState<FeedItem[]>([])

  useEffect(() => {
    const push = (text: string, tone: FeedItem['tone']) => {
      const item = { id: ++idCounter, text, tone }
      setItems((current) => [...current, item].slice(-4))
      window.setTimeout(() => setItems((current) => current.filter((entry) => entry.id !== item.id)), 2200)
    }

    const disposers = [
      events.on('combat:kill', ({ elite, boss }) => push(boss ? 'BOSS YIKILDI' : elite ? 'ELITE YIKILDI' : 'DÜŞMAN YOK EDİLDİ', 'normal')),
      events.on('combat:execute', () => push('EXECUTE', 'danger')),
      events.on('combat:reaction', ({ reaction }) => push(reaction.toUpperCase(), 'power')),
      events.on('player:level', ({ level }) => push(`SEVİYE ${level}`, 'power')),
      events.on('relic:acquire', ({ relicId }) => push(`RELIC: ${relicId.replace(/_/g, ' ').toUpperCase()}`, 'loot')),
      events.on('run:ascend', ({ tier }) => push(`ASCENSION ${tier}`, 'power')),
    ]

    return () => disposers.forEach((dispose) => dispose())
  }, [])

  return (
    <div className="pointer-events-none absolute right-4 top-24 z-30 flex w-64 flex-col gap-1.5">
      {items.map((item) => (
        <div
          key={item.id}
          className={`fade-rise rounded border px-3 py-1.5 font-display text-[10px] font-black tracking-[0.18em] shadow-lg ${
            item.tone === 'danger' ? 'border-red-400/50 bg-red-950/70 text-red-100' :
            item.tone === 'power' ? 'border-amber-300/40 bg-amber-950/70 text-amber-100' :
            item.tone === 'loot' ? 'border-emerald-300/40 bg-emerald-950/70 text-emerald-100' :
            'border-white/10 bg-black/65 text-white/80'
          }`}
        >
          {item.text}
        </div>
      ))}
    </div>
  )
}
