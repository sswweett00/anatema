import { useEffect, useRef, useState } from 'react'
import {
  Skull,
  Ghost,
  Flame,
  Shield,
  Volume2,
  VolumeX,
  HeartPulse,
  Zap,
  Swords,
  Crosshair,
  Orbit,
  Wind,
  Heart,
  CloudLightning,
  Snowflake,
  Tornado,
  Eye,
  Magnet,
  Angry,
  Axe,
  Footprints,
  Bug,
  Droplet,
  Mountain,
  Moon,
} from 'lucide-react'
import { clsx } from 'clsx'
import { enemies, getPlayer, gameState } from '../ecs/world'
import { abilities, ABILITIES, displayName, swordDamage, type AbilityId } from '../game/abilities'
import { isMuted, setMuted } from '../game/audio'

/*
 * HUD — transient DOM layer. Game state is read from ECS on RAF without
 * creating a React render on every frame.
 *
 * IMPORTANT: the ability icon table intentionally uses only the icon exports
 * already known to be present in the project's installed lucide-react build.
 * A final fallback guarantees that a future ability can never crash the HUD.
 */

type IconComponent = typeof Flame

const FALLBACK_ICON: IconComponent = Flame

const ABILITY_ICONS: Partial<Record<AbilityId, IconComponent>> = {
  steel: Swords,
  arrows: Crosshair,
  nova: Flame,
  orbit: Orbit,
  chain: Zap,
  storm: CloudLightning,
  frost: Snowflake,
  vortex: Tornado,
  spikes: Axe,
  pyre: Footprints,
  phantom: Ghost,
  venom: Bug,
  heart: HeartPulse,
  swift: Wind,
  armor: Shield,
  crit: Eye,
  magnet: Magnet,
  rage: Angry,
  vamp: Droplet,
  stone: Mountain,
  ghoststep: Moon,
  ferocity: Skull,
  /* semantic fallbacks for abilities whose newer icon names may be absent */
  thorns: Shield,
  laststand: Heart,
  focus: Eye,
  momentum: Zap,
  adrenaline: Wind,
  bulwark: Shield,
  greed: Magnet,
  harvest: Flame,
  scholar: Ghost,
  warlord: Skull,
  mend: Heart,
}

function getAbilityIcon(id: AbilityId): IconComponent {
  return ABILITY_ICONS[id] ?? FALLBACK_ICON
}

function fmtTime(t: number) {
  const safe = Number.isFinite(t) ? Math.max(0, t) : 0
  const m = Math.floor(safe / 60)
  const s = Math.floor(safe % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

export default function HUD() {
  const hpBar = useRef<HTMLDivElement>(null)
  const hpText = useRef<HTMLSpanElement>(null)
  const poiseBar = useRef<HTMLDivElement>(null)
  const armorText = useRef<HTMLSpanElement>(null)
  const staggerText = useRef<HTMLDivElement>(null)
  const timerText = useRef<HTMLDivElement>(null)
  const killsText = useRef<HTMLSpanElement>(null)
  const aliveText = useRef<HTMLSpanElement>(null)
  const dmgText = useRef<HTMLSpanElement>(null)
  const levelText = useRef<HTMLDivElement>(null)
  const xpBar = useRef<HTMLDivElement>(null)
  const xpText = useRef<HTMLSpanElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const lowHpRef = useRef<HTMLDivElement>(null)
  const toastRef = useRef<HTMLDivElement>(null)
  const toastLevel = useRef<HTMLSpanElement>(null)
  const announceRef = useRef<HTMLDivElement>(null)
  const flashNovaRef = useRef<HTMLDivElement>(null)
  const dashFillRef = useRef<HTMLDivElement>(null)
  const novaFillRef = useRef<HTMLDivElement>(null)
  const novaSlotRef = useRef<HTMLDivElement>(null)
  const abilitySlotRefs = useRef<(HTMLDivElement | null)[]>([])
  const abilityLvlRefs = useRef<(HTMLSpanElement | null)[]>([])
  const comboWrapRef = useRef<HTMLDivElement>(null)
  const comboTextRef = useRef<HTMLSpanElement>(null)
  const comboBarRef = useRef<HTMLDivElement>(null)
  const comboPulse = useRef(0)
  const lastCombo = useRef(-1)
  const [muted, setMutedState] = useState(isMuted())

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const p = getPlayer()
      if (p) {
        const maxHealth = Math.max(1, Number.isFinite(p.maxHealth) ? p.maxHealth : 1)
        const health = Number.isFinite(p.health) ? Math.max(0, Math.min(maxHealth, p.health)) : 0
        const pct = clamp01(health / maxHealth)
        const maxPoise = Math.max(1, Number.isFinite(p.maxPoise) ? p.maxPoise : 1)
        const poise = Number.isFinite(p.poise) ? Math.max(0, Math.min(maxPoise, p.poise)) : 0

        if (hpBar.current) hpBar.current.style.width = `${pct * 100}%`
        if (hpText.current) hpText.current.textContent = String(Math.ceil(health))
        if (poiseBar.current) poiseBar.current.style.width = `${(poise / maxPoise) * 100}%`
        if (armorText.current) armorText.current.textContent = String(Math.max(0, p.armor | 0))
        if (lowHpRef.current) lowHpRef.current.style.opacity = pct < 0.3 && gameState.phase === 'playing' ? '1' : '0'
        if (staggerText.current) staggerText.current.style.opacity = (p.stagger ?? 0) > 0 ? '1' : '0'
        if (dashFillRef.current) dashFillRef.current.style.transform = `scaleY(${clamp01((p.dashCooldown ?? 0) / 1.3)})`

        if (novaFillRef.current) {
          const locked = abilities.nova === 0
          novaFillRef.current.style.transform = `scaleY(${locked ? 1 : clamp01((p.novaCooldown ?? 0) / 9)})`
        }
        if (novaSlotRef.current) novaSlotRef.current.style.opacity = abilities.nova === 0 ? '0.35' : '1'
      }

      if (timerText.current) timerText.current.textContent = fmtTime(gameState.time)
      if (killsText.current) killsText.current.textContent = String(Math.max(0, gameState.kills | 0))
      if (aliveText.current) aliveText.current.textContent = String(Math.max(0, enemies.entities.length | 0))
      if (dmgText.current) dmgText.current.textContent = String(Math.max(0, swordDamage() | 0))

      const xpNext = Math.max(1, Number.isFinite(gameState.xpNext) ? gameState.xpNext : 1)
      const xp = Math.max(0, Number.isFinite(gameState.xp) ? gameState.xp : 0)
      if (levelText.current) levelText.current.textContent = String(Math.max(1, gameState.level | 0))
      if (xpBar.current) xpBar.current.style.width = `${Math.min(100, (xp / xpNext) * 100)}%`
      if (xpText.current) xpText.current.textContent = `${Math.floor(xp)}/${Math.floor(xpNext)}`

      if (comboWrapRef.current) {
        const combo = Math.max(0, gameState.combo | 0)
        const visible = combo >= 3 && gameState.phase === 'playing'
        comboWrapRef.current.style.opacity = visible ? '1' : '0'
        if (visible) {
          if (lastCombo.current !== combo) {
            lastCombo.current = combo
            comboPulse.current = 1
          }
          if (comboTextRef.current) {
            comboTextRef.current.textContent = `×${combo}`
            comboTextRef.current.style.transform = `scale(${1 + comboPulse.current * 0.45})`
          }
          if (comboBarRef.current) comboBarRef.current.style.width = `${clamp01((gameState.comboTimer ?? 0) / 2.4) * 100}%`
        }
      }
      comboPulse.current = Math.max(0, comboPulse.current - 0.07)

      for (let i = 0; i < ABILITIES.length; i++) {
        const id = ABILITIES[i].id
        const lvl = Math.max(0, abilities[id] | 0)
        const slot = abilitySlotRefs.current[i]
        const lvlEl = abilityLvlRefs.current[i]
        if (slot) {
          slot.style.opacity = lvl > 0 ? '1' : '0.28'
          const dn = displayName(id)
          slot.title = dn.syn ? `${dn.label} · SV ${dn.synLvl} (${dn.syn.desc})` : `${dn.label}${lvl > 0 ? ` · SV ${lvl}` : ''}`
        }
        if (lvlEl) lvlEl.textContent = lvl > 0 ? String(lvl) : '·'
      }

      if (flashRef.current) flashRef.current.style.opacity = String(clamp01(gameState.damageFlash) * 0.6)
      if (flashNovaRef.current) flashNovaRef.current.style.opacity = String(clamp01(gameState.flashNova) * 0.5)
      if (toastRef.current) {
        const o = clamp01((gameState.levelFlash ?? 0) * 1.6)
        toastRef.current.style.opacity = String(o)
        toastRef.current.style.transform = `translateX(-50%) translateY(${(1 - o) * 14}px)`
      }
      if (toastLevel.current) toastLevel.current.textContent = String(Math.max(1, gameState.level | 0))
      if (announceRef.current) {
        const on = gameState.time < gameState.announceUntil && Boolean(gameState.announceText)
        announceRef.current.style.opacity = on ? '1' : '0'
        if (on && announceRef.current.textContent !== gameState.announceText) announceRef.current.textContent = gameState.announceText
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none font-body">
      <div ref={flashRef} className="absolute inset-0 opacity-0" style={{ background: 'radial-gradient(ellipse at center, rgba(194,46,31,0.12) 0%, rgba(122,31,20,0.55) 100%)' }} />
      <div ref={flashNovaRef} className="absolute inset-0 opacity-0" style={{ background: 'radial-gradient(ellipse at center, rgba(255,138,61,0.2) 0%, rgba(209,102,42,0.35) 100%)' }} />
      <div ref={lowHpRef} className="absolute inset-0 opacity-0 transition-opacity duration-500">
        <div className="lowhp-pulse absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 48%, rgba(122,20,12,0.65) 100%)' }} />
      </div>

      <div className="absolute inset-x-0 top-0 z-30">
        <div className="relative h-3 w-full border-b border-[#5a3a22] bg-black/70">
          <div ref={xpBar} className="h-full" style={{ width: '0%', background: 'linear-gradient(90deg, #7a4a12 0%, #d1662a 60%, #ff8a3d 100%)', boxShadow: '0 0 12px rgba(255,138,61,0.7)' }} />
        </div>
      </div>

      <div className="absolute inset-x-0 top-3 flex items-start justify-between gap-4 p-4 md:p-6">
        <div className="plate w-[290px] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.28em] text-ash"><HeartPulse size={12} className="text-rust" />KÜL ŞÖVALYESİ</div>
            <div className="flex items-center gap-1.5"><span className="text-[9px] tracking-[0.18em] text-ash">SV.</span><div ref={levelText} className="font-display flex h-6 w-6 items-center justify-center border border-[#d1662a] bg-[#2a1608] text-sm font-black text-ember">1</div></div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="relative h-4 flex-1 border border-[#5a3a22] bg-black/70"><div ref={hpBar} className="h-full" style={{ width: '100%', background: 'linear-gradient(90deg, #7a1f14 0%, #c22e1f 55%, #ff8a3d 100%)' }} /><div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, transparent 0 9px, rgba(0,0,0,0.45) 9px 10px)' }} /></div>
            <span ref={hpText} className="font-display w-9 text-right text-lg font-bold text-bone">100</span>
          </div>

          <div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 flex-1 border border-[#2c4a3e] bg-black/70"><div ref={poiseBar} className="h-full bg-[#3fae8c]" style={{ width: '100%' }} /></div><span className="text-[9px] font-bold tracking-[0.22em] text-[#5f9484]">DURUŞ</span></div>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-ash"><Shield size={13} className="text-rust" />ZIRH<span ref={armorText} className="font-display ml-1 text-base text-bone">3</span></div>
            <div className="text-[9px] tracking-[0.14em] text-ash/70">XP <span ref={xpText} className="font-display text-ember">0/9</span></div>
            <div ref={staggerText} className="text-[10px] font-extrabold tracking-[0.22em] text-danger opacity-0">DURUŞ KIRILDI</div>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div ref={timerText} className="font-display text-4xl font-black tracking-[0.12em] text-bone md:text-5xl" style={{ textShadow: '0 0 22px rgba(209,102,42,0.55), 0 2px 0 #000' }}>00:00</div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="plate flex items-center gap-1.5 px-3 py-1"><Skull size={13} className="text-ember" /><span ref={killsText} className="font-display text-base font-bold text-bone">0</span><span className="text-[9px] tracking-[0.2em] text-ash">KESEN</span></div>
            <div className="plate flex items-center gap-1.5 px-3 py-1"><Ghost size={13} className="text-[#5f9484]" /><span ref={aliveText} className="font-display text-base font-bold text-bone">0</span><span className="text-[9px] tracking-[0.2em] text-ash">SÜRÜ</span></div>
          </div>
          <div ref={comboWrapRef} className="mt-2 flex flex-col items-center opacity-0 transition-opacity duration-200">
            <span ref={comboTextRef} className="font-display text-3xl font-black leading-none text-ember" style={{ textShadow: '0 0 18px rgba(255,138,61,0.8), 0 2px 0 #000' }}>×0</span>
            <span className="text-[9px] font-bold tracking-[0.34em] text-rust">KOMBO</span>
            <div className="mt-1 h-1 w-20 overflow-hidden bg-black/60"><div ref={comboBarRef} className="h-full bg-gradient-to-r from-rust to-ember" style={{ width: '0%' }} /></div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="plate w-[240px] px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.26em] text-ash"><Swords size={12} className="text-ember" />BÜYÜK KILIÇ</div>
              <div className="text-[9px] tracking-[0.18em] text-ash">HASAR <span ref={dmgText} className="font-display text-sm font-bold text-ember">26</span></div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              {ABILITIES.map((a, i) => {
                const Icon = getAbilityIcon(a.id)
                return (
                  <div key={a.id} ref={(el) => { abilitySlotRefs.current[i] = el }} className="flex flex-col items-center gap-0.5" style={{ opacity: 0.28 }} title={a.name}>
                    <Icon size={15} className="text-ember" />
                    <span ref={(el) => { abilityLvlRefs.current[i] = el }} className="font-display text-[10px] font-bold leading-none text-bone">·</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="plate flex items-center gap-2 px-2.5 py-1.5"><div className="relative h-8 w-8 overflow-hidden border border-[#5a3a22] bg-black/70"><Zap size={15} className="absolute inset-0 m-auto text-ember" /><div ref={dashFillRef} className="absolute inset-0 origin-bottom bg-black/75" style={{ transform: 'scaleY(0)' }} /></div><div className="text-[8px] leading-tight tracking-[0.14em] text-ash">ATILMA<br /><kbd className="kbd mt-0.5 h-3.5 min-w-[14px] px-1 text-[7px]">␣</kbd></div></div>
            <div className="plate flex items-center gap-2 px-2.5 py-1.5"><div ref={novaSlotRef} className="relative h-8 w-8 overflow-hidden border border-[#5a3a22] bg-black/70 transition-opacity duration-300" style={{ opacity: 0.35 }}><Flame size={15} className="absolute inset-0 m-auto text-rust" /><div ref={novaFillRef} className="absolute inset-0 origin-bottom bg-black/75" style={{ transform: 'scaleY(1)' }} /></div><div className="text-[8px] leading-tight tracking-[0.14em] text-ash">FIRTINA<br /><span className="text-rust">OTOMATİK</span></div></div>
            <button onClick={() => { const next = !muted; setMuted(next); setMutedState(next) }} className={clsx('plate pointer-events-auto flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[0.22em] transition-colors', muted ? 'text-ash hover:text-bone' : 'text-ember hover:text-bone')}>
              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 md:p-6">
        <div className="plate hidden items-center gap-3 px-4 py-2.5 md:flex"><div className="flex items-center gap-1"><kbd className="kbd">W</kbd><kbd className="kbd">A</kbd><kbd className="kbd">S</kbd><kbd className="kbd">D</kbd></div><span className="text-[10px] tracking-[0.2em] text-ash">HAREKET</span><span className="h-4 w-px bg-[#3a312b]" /><kbd className="kbd">P</kbd><span className="text-[10px] tracking-[0.2em] text-ash">DURAKLAT</span></div>
        <div className="hidden items-center gap-2 text-[10px] tracking-[0.24em] text-ash/80 lg:flex"><Swords size={11} className="text-rust" />KILIÇ KENDİ SAVRULUR · SEVİYE ATLA, YETENEK SEÇ</div>
      </div>

      <div ref={toastRef} className="font-display absolute left-1/2 top-[22%] -translate-x-1/2 text-center opacity-0"><div className="text-[11px] font-bold tracking-[0.4em] text-ember">GÜÇLENİYORSUN</div><div className="mt-1 text-4xl font-black text-bone" style={{ textShadow: '0 0 26px rgba(255,138,61,0.7)' }}>SEVİYE <span ref={toastLevel}>2</span></div></div>
      <div ref={announceRef} className="font-display absolute left-1/2 top-[34%] -translate-x-1/2 text-center text-lg font-bold tracking-[0.3em] text-rust opacity-0 transition-opacity duration-300" style={{ textShadow: '0 0 18px rgba(209,102,42,0.6)' }} />
    </div>
  )
}
