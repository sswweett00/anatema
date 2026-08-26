import { useEffect, useState } from 'react'
import { BarChart3, Gauge, Sparkles, Trophy } from 'lucide-react'
import {
  formatDuration,
  loadProfile,
  setQuality,
  toggleReducedMotion,
  type Profile,
  type QualityPreset,
} from '../game/profile'

const QUALITY: QualityPreset[] = ['auto', 'low', 'balanced', 'high']

export default function ProfilePanel() {
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onProfile = (event: Event) => {
      const detail = (event as CustomEvent<Profile>).detail
      setProfile(detail)
    }
    window.addEventListener('anatema:profile', onProfile)
    return () => window.removeEventListener('anatema:profile', onProfile)
  }, [])

  const chooseQuality = (quality: QualityPreset) => setProfile(setQuality(quality))
  const reduceMotion = () => setProfile(toggleReducedMotion())

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-50 w-[min(92vw,360px)]">
      <div className="pointer-events-auto plate overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-[10px] font-extrabold tracking-[0.24em] text-rust">
            <Trophy size={14} /> KÜL ARŞİVİ
          </span>
          <span className="text-[10px] tracking-[0.18em] text-ash">{open ? 'KAPAT' : 'AÇ'}</span>
        </button>

        <div className="grid grid-cols-3 gap-2 px-3 pb-3">
          <Stat icon={<Trophy size={13} />} label="EN İYİ" value={String(profile.bestKills)} />
          <Stat icon={<Sparkles size={13} />} label="SEVİYE" value={String(profile.bestLevel)} />
          <Stat icon={<BarChart3 size={13} />} label="KOMBO" value={String(profile.bestCombo)} />
        </div>

        {open && (
          <div className="border-t border-[#3a2a1c] px-4 py-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-ash">
              <span>Toplam kesim</span><b className="text-right text-bone">{profile.totalKills}</b>
              <span>Run sayısı</span><b className="text-right text-bone">{profile.totalRuns}</b>
              <span>Toplam süre</span><b className="text-right text-bone">{formatDuration(profile.totalPlayTime)}</b>
            </div>

            <div className="mt-4 text-[9px] font-extrabold tracking-[0.24em] text-rust">GÖRSEL KALİTE</div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {QUALITY.map((quality) => (
                <button
                  type="button"
                  key={quality}
                  onClick={() => chooseQuality(quality)}
                  className={`px-2 py-1.5 text-[9px] font-bold tracking-[0.12em] transition ${profile.quality === quality ? 'bg-[#7a2c12] text-[#ffe9d2]' : 'bg-black/25 text-ash hover:text-bone'}`}
                >
                  {quality.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={reduceMotion}
              className="mt-3 flex w-full items-center justify-between bg-black/20 px-2.5 py-2 text-[10px] text-ash hover:text-bone"
            >
              <span className="flex items-center gap-2"><Gauge size={13} /> Az hareket</span>
              <span className={profile.reducedMotion ? 'text-ember' : 'text-ash'}>{profile.reducedMotion ? 'AÇIK' : 'KAPALI'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-black/20 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[8px] font-bold tracking-[0.16em] text-ash">{icon}{label}</div>
      <div className="font-display mt-0.5 text-lg font-black text-bone">{value}</div>
    </div>
  )
}
