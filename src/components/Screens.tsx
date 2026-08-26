import { useEffect, useMemo, useState } from 'react'
import {
  Flame,
  Skull,
  Swords,
  Zap,
  HeartPulse,
  Crosshair,
  Orbit,
  Wind,
  Shield,
  Heart,
  Sparkles,
  CloudLightning,
  Snowflake,
  Tornado,
  Eye,
  Magnet,
  Angry,
  Link2,
} from 'lucide-react'
import { gameState, setPhase } from '../ecs/world'
import {
  abilities,
  getDef,
  rollChoices,
  applyAbility,
  ownedSynergies,
  MAX_LVL,
  type AbilityId,
} from '../game/abilities'
import { sfx } from '../game/audio'

/* ---------------- kor tanecikleri (saf CSS) ---------------- */

function Embers({ count = 22 }: { count?: number }) {
  const embers = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        size: 2 + Math.random() * 4,
        dur: 5 + Math.random() * 7,
        delay: -Math.random() * 12,
        drift: (Math.random() - 0.5) * 120,
      })),
    [count]
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {embers.map((e) => (
        <span
          key={e.id}
          className="ember"
          style={{
            left: e.left,
            width: e.size,
            height: e.size,
            animationDuration: `${e.dur}s`,
            animationDelay: `${e.delay}s`,
            ['--drift' as string]: `${e.drift}px`,
          }}
        />
      ))}
    </div>
  )
}

function Keycap({ label }: { label: string }) {
  return <kbd className="kbd">{label}</kbd>
}

/* ---------------- başlangıç ekranı ---------------- */

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(11,8,6,0.55)_0%,rgba(11,8,6,0.92)_100%)]">
      <Embers />
      <div className="fade-rise relative mx-4 my-8 w-full max-w-3xl">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 text-[11px] font-bold tracking-[0.5em] text-ash">
            <span className="h-px w-10 bg-[#5a3a22]" />
            GRIMDARK AUTO-SHOOTER
            <span className="h-px w-10 bg-[#5a3a22]" />
          </div>
          <h1
            className="font-display mt-3 text-6xl font-black leading-none tracking-[0.08em] text-bone md:text-8xl"
            style={{
              textShadow:
                '0 0 60px rgba(209,102,42,0.45), 0 0 12px rgba(255,138,61,0.35), 0 4px 0 #1a0d06',
            }}
          >
            ANATHEMA
          </h1>
          <div className="font-display mt-2 text-lg font-bold tracking-[0.62em] text-rust md:text-xl">
            REQUIEM OF RUST
          </div>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ash md:text-[15px]">
            Pas, imparatorlukları yuttu; geriye goblinler, iskeletler ve balçıktan doğan
            dehşetler kaldı. Büyük kılıcın kendi savrulur — sen sadece hayatta kal. Seri
            kesimler <b className="text-ember">kombo</b> kurar, kombo tecrübeyi katlar; ruh
            kestikçe seviye atla, <b className="text-ember">14 yetenekten</b> üçünü seç, doğru
            ikililerle <b className="text-ember">sinerji</b> aç ve kendi kıyametini kur.
          </p>
        </div>

        {/* kumanda + özellikler levhası */}
        <div className="plate mt-7 grid grid-cols-1 gap-0 md:grid-cols-2">
          <div className="border-b border-[#3a2a1c] p-5 md:border-b-0 md:border-r">
            <div className="text-[10px] font-extrabold tracking-[0.34em] text-rust">KUMANDA</div>
            <div className="mt-3 space-y-2.5 text-[13px] text-bone/90">
              <div className="flex items-center gap-2">
                <Keycap label="W" />
                <Keycap label="A" />
                <Keycap label="S" />
                <Keycap label="D" />
                <span className="ml-1 text-ash">hareket</span>
              </div>
              <div className="flex items-center gap-2">
                <Keycap label="BOŞLUK" />
                <span className="ml-1 text-ash">atılma — kısa dokunulmazlık</span>
              </div>
              <div className="flex items-center gap-2">
                <Keycap label="P" />
                <span className="ml-1 text-ash">oyunu duraklat</span>
              </div>
              <div className="flex items-center gap-2">
                <Keycap label="1" />
                <Keycap label="2" />
                <Keycap label="3" />
                <span className="ml-1 text-ash">seviye atlayınca yetenek seç</span>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="text-[10px] font-extrabold tracking-[0.34em] text-rust">
              ŞÖVALYENİN YOLU
            </div>
            <ul className="mt-3 space-y-2.5 text-[13px] text-ash">
              <li className="flex items-start gap-2">
                <Swords size={14} className="mt-0.5 shrink-0 text-ember" />
                <span>
                  <b className="text-bone">Büyük Kılıç</b> en yakın canavara kendi savrulur,
                  çevresindekileri de biçer.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles size={14} className="mt-0.5 shrink-0 text-ember" />
                <span>
                  <b className="text-bone">Seviye atla:</b> aktif ve pasif 3 yetenekten birini
                  seç; aynı yeteneği üst üste seçip güçlendir, farklılarıyla kombinasyon kur.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Zap size={14} className="mt-0.5 shrink-0 text-ember" />
                <span>
                  <b className="text-bone">Atılma:</b> sürünün içinden dokunulmaz sıyrıl.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <HeartPulse size={14} className="mt-0.5 shrink-0 text-[#3fae8c]" />
                <span>
                  <b className="text-bone">Kan Bağı:</b> her kesimde küçük can ve duruş
                  yenilenir.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-7 text-center">
          <button
            onClick={onStart}
            className="btn-rust font-display group inline-flex items-center gap-3 px-12 py-4 text-lg font-black tracking-[0.3em] text-[#ffe9d2]"
          >
            <Flame size={20} className="transition-transform group-hover:scale-125" />
            OYUNA BAŞLA
          </button>
          <div className="mt-3 text-[10px] tracking-[0.3em] text-ash/70">
            SES İÇİN TIKLA · SÜRÜ BEKLİYOR
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- seviye atlama: yetenek seçimi ---------------- */

const ABILITY_ICONS: Record<AbilityId, typeof Flame> = {
  steel: Swords,
  arrows: Crosshair,
  nova: Flame,
  orbit: Orbit,
  chain: Zap,
  storm: CloudLightning,
  frost: Snowflake,
  vortex: Tornado,
  heart: HeartPulse,
  swift: Wind,
  armor: Shield,
  crit: Eye,
  magnet: Magnet,
  rage: Angry,
  mend: Heart,
}

function AbilityPips({ id }: { id: AbilityId }) {
  if (id === 'mend') return null
  const cur = abilities[id]
  return (
    <div className="mt-2 flex items-center justify-center gap-1">
      {Array.from({ length: MAX_LVL }, (_, i) => (
        <span
          key={i}
          className="h-1.5 w-3"
          style={{
            background: i < cur ? '#ff8a3d' : '#3a312b',
            boxShadow: i < cur ? '0 0 6px rgba(255,138,61,0.8)' : 'none',
          }}
        />
      ))}
    </div>
  )
}

export function LevelUpScreen() {
  const [choices, setChoices] = useState<AbilityId[]>(() => rollChoices())

  const pick = (id: AbilityId) => {
    applyAbility(id)
    sfx.pick()
    gameState.pendingLevelUps--
    if (gameState.pendingLevelUps > 0) {
      setChoices(rollChoices())
    } else {
      setPhase('playing')
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code)
      if (idx >= 0 && choices[idx]) pick(choices[idx])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices])

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(20,10,4,0.8)_0%,rgba(11,8,6,0.96)_100%)]">
      <Embers count={26} />
      <div className="fade-rise relative mx-4 my-8 w-full max-w-4xl text-center">
        <div className="text-[11px] font-bold tracking-[0.5em] text-ember">KÜLLER GÜÇLENİYOR</div>
        <h2
          className="font-display mt-2 text-5xl font-black tracking-[0.1em] text-bone md:text-6xl"
          style={{ textShadow: '0 0 40px rgba(255,138,61,0.5)' }}
        >
          SEVİYE {gameState.level}
        </h2>
        <p className="mt-2 text-sm text-ash">
          Bir güç seç
          {gameState.pendingLevelUps > 1 ? ` · ${gameState.pendingLevelUps} seçim kaldı` : ''} —
          kombinasyonunu kur
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {choices.map((id, i) => {
            const def = getDef(id)
            const Icon = ABILITY_ICONS[id]
            const cur = abilities[id]
            const active = def.type === 'AKTİF'
            return (
              <button
                key={`${id}-${i}`}
                onClick={() => pick(id)}
                className="group plate relative flex flex-col items-center px-5 pb-6 pt-7 text-center transition-all duration-150 hover:-translate-y-1.5 hover:brightness-125"
                style={{ cursor: 'pointer' }}
              >
                <div
                  className="font-display absolute left-3 top-2.5 text-sm font-black"
                  style={{ color: '#5a4632' }}
                >
                  {i + 1}
                </div>
                <div
                  className="absolute right-3 top-3 border px-1.5 py-0.5 text-[8px] font-extrabold tracking-[0.18em]"
                  style={{
                    color: active ? '#ff8a3d' : '#5f9484',
                    borderColor: active ? '#7a4a1a' : '#2c4a3e',
                  }}
                >
                  {def.type}
                </div>
                <Icon
                  size={40}
                  strokeWidth={1.6}
                  className="mt-2 transition-transform duration-150 group-hover:scale-110"
                  style={{ color: active ? '#ff8a3d' : '#8fae9c' }}
                />
                <div className="font-display mt-3 text-lg font-black tracking-[0.08em] text-bone">
                  {def.name.toUpperCase()}
                </div>
                {cur > 0 && id !== 'mend' && (
                  <div className="mt-0.5 text-[10px] font-bold tracking-[0.2em] text-ember">
                    SV. {cur} → {Math.min(MAX_LVL, cur + 1)}
                  </div>
                )}
                <AbilityPips id={id} />
                <p className="mt-3 min-h-[3.2em] text-[12.5px] leading-snug text-ash">
                  {def.desc}
                </p>
              </button>
            )
          })}
        </div>

        {/* sahip olunan sinerjiler */}
        {ownedSynergies().length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {ownedSynergies().map((s) => (
              <div
                key={s.id}
                className="plate flex items-center gap-2 px-3 py-1.5"
                style={{ borderColor: '#7a5a1a' }}
              >
                <Link2 size={12} className="text-ember" />
                <span className="text-[10px] font-extrabold tracking-[0.18em] text-ember">
                  {s.name.toUpperCase()}
                </span>
                <span className="text-[9px] tracking-[0.08em] text-ash">— {s.desc}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-[10px] tracking-[0.3em] text-ash/70">
          <kbd className="kbd">1</kbd> <kbd className="kbd">2</kbd> <kbd className="kbd">3</kbd>{' '}
          TUŞLARIYLA DA SEÇEBİLİRSİN
        </div>
      </div>
    </div>
  )
}

/* ---------------- ölüm levhası ---------------- */

function fmtTime(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function DeathScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(26,6,4,0.72)_0%,rgba(11,8,6,0.95)_100%)]">
      <Embers count={14} />
      <div className="fade-rise mx-4 w-full max-w-xl text-center">
        <Skull size={40} className="mx-auto text-danger" strokeWidth={1.4} />
        <h2
          className="font-display mt-4 text-5xl font-black tracking-[0.14em] text-danger md:text-6xl"
          style={{ textShadow: '0 0 40px rgba(194,46,31,0.6)' }}
        >
          DÜŞTÜN
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ash">
          Kor kalp söndü, zırh küle döndü. Sürü bir an durdu... ve yeniden yürümeye başladı.
        </p>

        <div className="plate mt-7 grid grid-cols-4 divide-x divide-[#3a2a1c]">
          <div className="p-4">
            <div className="text-[9px] font-bold tracking-[0.22em] text-ash">DAYANILAN</div>
            <div className="font-display mt-1 text-2xl font-black text-bone md:text-3xl">
              {fmtTime(gameState.time)}
            </div>
          </div>
          <div className="p-4">
            <div className="text-[9px] font-bold tracking-[0.22em] text-ash">KESİLEN</div>
            <div className="font-display mt-1 text-2xl font-black text-ember md:text-3xl">
              {gameState.kills}
            </div>
          </div>
          <div className="p-4">
            <div className="text-[9px] font-bold tracking-[0.22em] text-ash">SEVİYE</div>
            <div className="font-display mt-1 text-2xl font-black text-rust md:text-3xl">
              {gameState.level}
            </div>
          </div>
          <div className="p-4">
            <div className="text-[9px] font-bold tracking-[0.22em] text-ash">MAKS KOMBO</div>
            <div className="font-display mt-1 text-2xl font-black text-[#ff8a3d] md:text-3xl">
              ×{gameState.maxCombo}
            </div>
          </div>
        </div>

        <button
          onClick={onRestart}
          className="btn-rust font-display mt-8 inline-flex items-center gap-3 px-10 py-4 text-base font-black tracking-[0.28em] text-[#ffe9d2]"
        >
          <Flame size={18} />
          KÜLLERİNDEN DOĞ
        </button>
      </div>
    </div>
  )
}

/* ---------------- duraklatma ---------------- */

export function PauseScreen() {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="fade-rise text-center">
        <div className="font-display text-4xl font-black tracking-[0.3em] text-bone">
          OYUN DURDU
        </div>
        <div className="mt-3 text-[11px] tracking-[0.3em] text-ash">
          DEVAM İÇİN <kbd className="kbd">P</kbd> — SÜRÜ SABIRSIZLANIYOR
        </div>
      </div>
    </div>
  )
}
