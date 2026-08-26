import { useMemo } from 'react'
import { Flame, Skull, Swords, Zap, HeartPulse } from 'lucide-react'
import { gameState } from '../ecs/world'

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
            dehşetler kaldı. Son Kül Şövalyesi olarak halkanı savun — okların kendi nişan
            alır, sürü ise her saniye büyür.
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
                <Flame size={14} className="shrink-0 text-ember" />
                <span className="ml-1 text-ash">kül okları en yakın canavara otomatik uçar</span>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="text-[10px] font-extrabold tracking-[0.34em] text-rust">
              ŞÖVALYENİN GÜÇLERİ
            </div>
            <ul className="mt-3 space-y-2.5 text-[13px] text-ash">
              <li className="flex items-start gap-2">
                <Zap size={14} className="mt-0.5 shrink-0 text-ember" />
                <span>
                  <b className="text-bone">Atılma:</b> sürünün içinden dokunulmaz sıyrıl.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Flame size={14} className="mt-0.5 shrink-0 text-ember" />
                <span>
                  <b className="text-bone">Kül Fırtınası:</b> 2. kademeden sonra otomatik halka
                  dalgası savurur.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <HeartPulse size={14} className="mt-0.5 shrink-0 text-[#3fae8c]" />
                <span>
                  <b className="text-bone">Kan Bağı:</b> her kesimde küçük can ve duruş
                  yenilenir.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Swords size={14} className="mt-0.5 shrink-0 text-ember" />
                <span>
                  Her <b className="text-bone">30 kesim</b> kademe atlatır: daha çok ok, daha
                  çok hasar, daha kalın zırh.
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

        <div className="plate mt-7 grid grid-cols-3 divide-x divide-[#3a2a1c]">
          <div className="p-4">
            <div className="text-[9px] font-bold tracking-[0.28em] text-ash">DAYANILAN</div>
            <div className="font-display mt-1 text-3xl font-black text-bone">
              {fmtTime(gameState.time)}
            </div>
          </div>
          <div className="p-4">
            <div className="text-[9px] font-bold tracking-[0.28em] text-ash">KESİLEN CANAVAR</div>
            <div className="font-display mt-1 text-3xl font-black text-ember">
              {gameState.kills}
            </div>
          </div>
          <div className="p-4">
            <div className="text-[9px] font-bold tracking-[0.28em] text-ash">KADRAN</div>
            <div className="font-display mt-1 text-3xl font-black text-rust">
              {gameState.tier}
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
