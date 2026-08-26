import { useEffect, useRef, useState } from 'react'
import { Skull, Ghost, Flame, Shield, Volume2, VolumeX, HeartPulse, Zap, Swords } from 'lucide-react'
import { clsx } from 'clsx'
import { enemies, getPlayer, gameState } from '../ecs/world'
import { isMuted, setMuted } from '../game/audio'

/*
 * HUD — tamamen transient. requestAnimationFrame döngüsü ECS dünyasını
 * okur ve DOM'a ref'ler üzerinden yazar; tek bir React re-render yok.
 */

function fmtTime(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const PIP_COUNT = 7

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
  const flashRef = useRef<HTMLDivElement>(null)
  const lowHpRef = useRef<HTMLDivElement>(null)
  const toastRef = useRef<HTMLDivElement>(null)
  const toastTier = useRef<HTMLSpanElement>(null)
  const pipRefs = useRef<(HTMLSpanElement | null)[]>([])
  const dashFillRef = useRef<HTMLDivElement>(null)
  const novaFillRef = useRef<HTMLDivElement>(null)
  const novaSlotRef = useRef<HTMLDivElement>(null)
  const announceRef = useRef<HTMLDivElement>(null)
  const flashNovaRef = useRef<HTMLDivElement>(null)

  const [muted, setMutedState] = useState(isMuted())

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const p = getPlayer()
      if (p) {
        const pct = Math.max(0, Math.min(1, p.health / p.maxHealth))
        if (hpBar.current) hpBar.current.style.width = `${pct * 100}%`
        if (hpText.current) hpText.current.textContent = `${Math.ceil(p.health)}`
        if (poiseBar.current)
          poiseBar.current.style.width = `${(p.poise / p.maxPoise) * 100}%`
        if (armorText.current) armorText.current.textContent = String(p.armor)
        if (lowHpRef.current)
          lowHpRef.current.style.opacity = pct < 0.3 && gameState.phase === 'playing' ? '1' : '0'
        if (staggerText.current)
          staggerText.current.style.opacity = (p.stagger ?? 0) > 0 ? '1' : '0'
      }
      if (timerText.current) timerText.current.textContent = fmtTime(gameState.time)
      if (killsText.current) killsText.current.textContent = String(gameState.kills)
      if (aliveText.current) aliveText.current.textContent = String(enemies.entities.length)
      if (dmgText.current) dmgText.current.textContent = String(26 + gameState.tier * 10)

      for (let i = 0; i < PIP_COUNT; i++) {
        const el = pipRefs.current[i]
        if (el) {
          const on = i < gameState.tier
          el.style.opacity = on ? '1' : '0.15'
          el.style.background = on ? '#ff8a3d' : '#3a312b'
          el.style.boxShadow = on ? '0 0 8px rgba(255,138,61,0.8)' : 'none'
        }
      }
      if (flashRef.current)
        flashRef.current.style.opacity = String(gameState.damageFlash * 0.6)
      if (toastRef.current) {
        const o = Math.min(1, gameState.tierFlash * 1.6)
        toastRef.current.style.opacity = String(o)
        toastRef.current.style.transform = `translateX(-50%) translateY(${(1 - o) * 14}px)`
      }
      if (toastTier.current) toastTier.current.textContent = String(gameState.tier)

      /* yetenek dolumları */
      const p2 = getPlayer()
      if (dashFillRef.current && p2)
        dashFillRef.current.style.transform = `scaleY(${(p2.dashCooldown ?? 0) / 1.3})`
      if (novaFillRef.current && p2) {
        const locked = gameState.tier < 2
        novaFillRef.current.style.transform = `scaleY(${locked ? 1 : Math.max(0, (p2.novaCooldown ?? 0) / 8)})`
      }
      if (novaSlotRef.current)
        novaSlotRef.current.style.opacity = gameState.tier < 2 ? '0.35' : '1'
      if (announceRef.current) {
        const on = gameState.time < gameState.announceUntil && gameState.announceText
        announceRef.current.style.opacity = on ? '1' : '0'
        if (on && announceRef.current.textContent !== gameState.announceText)
          announceRef.current.textContent = gameState.announceText
      }
      if (flashNovaRef.current)
        flashNovaRef.current.style.opacity = String(gameState.flashNova * 0.5)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none font-body">
      {/* hasar flaşı */}
      <div
        ref={flashRef}
        className="absolute inset-0 opacity-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(194,46,31,0.12) 0%, rgba(122,31,20,0.55) 100%)',
        }}
      />
      {/* düşük can vinyeti */}
      <div ref={lowHpRef} className="absolute inset-0 opacity-0 transition-opacity duration-500">
        <div
          className="lowhp-pulse absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 48%, rgba(122,20,12,0.65) 100%)',
          }}
        />
      </div>

      {/* kül fırtınası flaşı */}
      <div
        ref={flashNovaRef}
        className="absolute inset-0 opacity-0"
        style={{
          background:
            'radial-gradient(circle at center, rgba(255,177,92,0.5) 0%, rgba(255,138,61,0.12) 45%, transparent 70%)',
        }}
      />

      {/* dalga bildirimi */}
      <div
        ref={announceRef}
        className="font-display absolute left-1/2 top-[13%] -translate-x-1/2 whitespace-nowrap text-sm font-bold tracking-[0.42em] text-ember opacity-0 transition-opacity duration-300 md:text-base"
        style={{ textShadow: '0 0 18px rgba(255,138,61,0.8), 0 2px 0 #000' }}
      >
        OYUN BAŞLADI — SÜRÜ GELİYOR
      </div>

      {/* ---- üst şerit ---- */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 md:p-6">
        {/* hayati değerler */}
        <div className="plate w-[290px] px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.28em] text-ash">
            <HeartPulse size={12} className="text-rust" />
            KÜL ŞÖVALYESİ
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="relative h-4 flex-1 border border-[#5a3a22] bg-black/70">
              <div
                ref={hpBar}
                className="h-full"
                style={{
                  width: '100%',
                  background: 'linear-gradient(90deg, #7a1f14 0%, #c22e1f 55%, #ff8a3d 100%)',
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'repeating-linear-gradient(90deg, transparent 0 9px, rgba(0,0,0,0.45) 9px 10px)',
                }}
              />
            </div>
            <span ref={hpText} className="font-display w-9 text-right text-lg font-bold text-bone">
              100
            </span>
          </div>

          {/* duruş (poise) */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 border border-[#2c4a3e] bg-black/70">
              <div ref={poiseBar} className="h-full bg-[#3fae8c]" style={{ width: '100%' }} />
            </div>
            <span className="text-[9px] font-bold tracking-[0.22em] text-[#5f9484]">DURUŞ</span>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-ash">
              <Shield size={13} className="text-rust" />
              ZIRH
              <span ref={armorText} className="font-display ml-1 text-base text-bone">
                3
              </span>
            </div>
            <div
              ref={staggerText}
              className="text-[10px] font-extrabold tracking-[0.22em] text-danger opacity-0"
            >
              DURUŞ KIRILDI
            </div>
          </div>
        </div>

        {/* zaman + skor */}
        <div className="flex flex-col items-center">
          <div
            ref={timerText}
            className="font-display text-4xl font-black tracking-[0.12em] text-bone md:text-5xl"
            style={{ textShadow: '0 0 22px rgba(209,102,42,0.55), 0 2px 0 #000' }}
          >
            00:00
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="plate flex items-center gap-1.5 px-3 py-1">
              <Skull size={13} className="text-ember" />
              <span ref={killsText} className="font-display text-base font-bold text-bone">
                0
              </span>
              <span className="text-[9px] tracking-[0.2em] text-ash">KESEN</span>
            </div>
            <div className="plate flex items-center gap-1.5 px-3 py-1">
              <Ghost size={13} className="text-[#5f9484]" />
              <span ref={aliveText} className="font-display text-base font-bold text-bone">
                0
              </span>
              <span className="text-[9px] tracking-[0.2em] text-ash">SÜRÜ</span>
            </div>
          </div>
        </div>

        {/* silah + ses */}
        <div className="flex flex-col items-end gap-2">
          <div className="plate w-[240px] px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.26em] text-ash">
                <Swords size={12} className="text-ember" />
                BÜYÜK KILIÇ
              </div>
              <div className="text-[9px] tracking-[0.18em] text-ash">
                HASAR{' '}
                <span ref={dmgText} className="font-display text-sm font-bold text-ember">
                  36
                </span>
              </div>
            </div>
            <div className="mt-1 text-[8px] tracking-[0.22em] text-ash/70">
              + KÜL OKLARI · İKİSİ DE KENDİ NİŞAN ALIR
            </div>
            <div className="mt-2.5 flex items-center justify-between px-1">
              {Array.from({ length: PIP_COUNT }, (_, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    pipRefs.current[i] = el
                  }}
                  className="h-2.5 w-2.5 rotate-45"
                  style={{ background: '#3a312b', opacity: 0.15 }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={() => {
              const next = !muted
              setMuted(next)
              setMutedState(next)
            }}
            className={clsx(
              'plate pointer-events-auto flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[0.22em] transition-colors',
              muted ? 'text-ash hover:text-bone' : 'text-ember hover:text-bone'
            )}
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            {muted ? 'SES KAPALI' : 'SES AÇIK'}
          </button>
        </div>
      </div>

      {/* ---- alt şerit ---- */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 md:p-6">
        <div className="plate hidden items-center gap-3 px-4 py-2.5 md:flex">
          <div className="flex items-center gap-1">
            <kbd className="kbd">W</kbd>
            <kbd className="kbd">A</kbd>
            <kbd className="kbd">S</kbd>
            <kbd className="kbd">D</kbd>
          </div>
          <span className="text-[10px] tracking-[0.2em] text-ash">HAREKET</span>
          <span className="h-4 w-px bg-[#3a312b]" />
          <kbd className="kbd">P</kbd>
          <span className="text-[10px] tracking-[0.2em] text-ash">DURAKLAT</span>
        </div>

        {/* yetenek paneli */}
        <div className="plate flex items-end gap-2.5 px-3.5 py-2.5">
          {/* Atılma */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-11 w-11 overflow-hidden border border-[#5a3a22] bg-black/70">
              <Zap size={19} className="absolute inset-0 m-auto text-ember" />
              <div
                ref={dashFillRef}
                className="absolute inset-0 origin-bottom bg-black/75"
                style={{ transform: 'scaleY(0)' }}
              />
            </div>
            <div className="flex items-center gap-1">
              <kbd className="kbd h-4 min-w-[16px] px-1 text-[8px]">␣</kbd>
              <span className="text-[8px] font-bold tracking-[0.14em] text-ash">ATILMA</span>
            </div>
          </div>
          {/* Kül Fırtınası */}
          <div className="flex flex-col items-center gap-1">
            <div
              ref={novaSlotRef}
              className="relative h-11 w-11 overflow-hidden border border-[#5a3a22] bg-black/70 transition-opacity duration-300"
            >
              <Flame size={19} className="absolute inset-0 m-auto text-rust" />
              <div
                ref={novaFillRef}
                className="absolute inset-0 origin-bottom bg-black/75"
                style={{ transform: 'scaleY(1)' }}
              />
            </div>
            <span className="text-[8px] font-bold tracking-[0.14em] text-ash">
              FIRTINA · K2+
            </span>
          </div>
          {/* Kan Bağı (pasif) */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-11 w-11 border border-[#2c4a3e] bg-black/70">
              <HeartPulse size={19} className="absolute inset-0 m-auto text-[#3fae8c]" />
            </div>
            <span className="text-[8px] font-bold tracking-[0.14em] text-[#5f9484]">
              KAN BAĞI
            </span>
          </div>
        </div>

        <div className="plate hidden items-center gap-2 px-4 py-2.5 text-[10px] tracking-[0.2em] text-ash/80 lg:flex">
          <Swords size={11} className="text-rust" />
          KILIÇ YAKINA, OKLAR UZAĞA VURUR
        </div>
      </div>

      {/* kademe bildirimi */}
      <div
        ref={toastRef}
        className="font-display absolute left-1/2 top-[22%] -translate-x-1/2 text-center opacity-0"
      >
        <div className="text-[11px] font-bold tracking-[0.4em] text-ember">SİLAH GÜÇLENDİ</div>
        <div
          className="mt-1 text-4xl font-black text-bone"
          style={{ textShadow: '0 0 26px rgba(255,138,61,0.7)' }}
        >
          KADRAN <span ref={toastTier}>2</span>
        </div>
      </div>
    </div>
  )
}
