/*
 * ANATHEMA — prosedürel WebAudio motoru.
 * Tüm sesler sentezlenir; hiçbir ses dosyası kullanılmaz.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

export function initAudio() {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 0.5
      master.connect(ctx.destination)
      startDrone()
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch (err) {
    console.warn('WebAudio kullanılamıyor:', err)
  }
}

export function setMuted(m: boolean) {
  muted = m
  if (ctx && master) {
    master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.04)
  }
}

export const isMuted = () => muted

/* ---------- yardımcılar ---------- */

function tone(opts: {
  freq: number
  end?: number
  dur: number
  type?: OscillatorType
  vol?: number
  delay?: number
}) {
  if (!ctx || !master) return
  const t0 = ctx.currentTime + (opts.delay ?? 0)
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = opts.type ?? 'triangle'
  osc.frequency.setValueAtTime(opts.freq, t0)
  if (opts.end !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.end), t0 + opts.dur)
  }
  const v = opts.vol ?? 0.1
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + opts.dur + 0.05)
}

function noise(dur: number, vol: number, filterFreq: number, delay = 0) {
  if (!ctx || !master) return
  const t0 = ctx.currentTime + delay
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = filterFreq
  f.Q.value = 0.9
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t0)
}

/* yoğun otomatik ateş altında ses çamurlaşmasın diye throttle */
const lastPlay: Record<string, number> = {}
function gate(key: string, ms: number): boolean {
  const now = performance.now()
  if (lastPlay[key] !== undefined && now - lastPlay[key] < ms) return false
  lastPlay[key] = now
  return true
}

export const sfx = {
  slash() {
    if (!gate('slash', 130)) return
    tone({ freq: 1050 + Math.random() * 200, end: 220, dur: 0.13, type: 'sawtooth', vol: 0.06 })
    noise(0.09, 0.05, 2400)
  },
  shoot() {
    if (!gate('shoot', 75)) return
    tone({ freq: 760 + Math.random() * 260, end: 190, dur: 0.09, type: 'square', vol: 0.035 })
  },
  hit() {
    if (!gate('hit', 55)) return
    noise(0.06, 0.05, 1900)
    tone({ freq: 320, end: 140, dur: 0.05, type: 'triangle', vol: 0.04 })
  },
  kill(combo = 0) {
    if (!gate('kill', 60)) return
    /* kombo büyüdükçe perde yükselir — bağımlılık hissi */
    const m = 1 + Math.min(combo, 30) * 0.022
    tone({ freq: 165 * m, end: 46 * m, dur: 0.18, type: 'triangle', vol: 0.11 })
    noise(0.1, 0.04, 620 * m)
  },
  crit() {
    if (!gate('crit', 90)) return
    tone({ freq: 900, end: 1600, dur: 0.1, type: 'square', vol: 0.07 })
    tone({ freq: 1400, end: 2400, dur: 0.14, delay: 0.04, type: 'square', vol: 0.05 })
  },
  chain() {
    if (!gate('chain', 80)) return
    tone({ freq: 1300, end: 300, dur: 0.09, type: 'sawtooth', vol: 0.04 })
    noise(0.05, 0.04, 3200)
  },
  storm() {
    if (!gate('storm', 150)) return
    noise(0.5, 0.14, 300)
    tone({ freq: 70, end: 30, dur: 0.6, type: 'sawtooth', vol: 0.16 })
    tone({ freq: 2200, end: 400, dur: 0.12, type: 'square', vol: 0.05 })
  },
  frost() {
    if (!gate('frost', 200)) return
    tone({ freq: 1800, end: 700, dur: 0.3, type: 'sine', vol: 0.06 })
    noise(0.2, 0.05, 4200)
  },
  vortex() {
    if (!gate('vortex', 200)) return
    tone({ freq: 220, end: 60, dur: 0.5, type: 'sawtooth', vol: 0.1 })
    noise(0.4, 0.06, 500)
  },
  hurt() {
    if (!gate('hurt', 120)) return
    tone({ freq: 120, end: 52, dur: 0.28, type: 'sawtooth', vol: 0.16 })
    noise(0.2, 0.1, 420)
  },
  stagger() {
    tone({ freq: 90, end: 40, dur: 0.5, type: 'sawtooth', vol: 0.14 })
  },
  dash() {
    noise(0.16, 0.07, 1500)
    tone({ freq: 480, end: 940, dur: 0.13, type: 'triangle', vol: 0.05 })
  },
  nova() {
    tone({ freq: 230, end: 38, dur: 0.55, type: 'sawtooth', vol: 0.2 })
    noise(0.45, 0.13, 320)
    tone({ freq: 900, end: 120, dur: 0.3, type: 'triangle', vol: 0.06 })
  },
  wave() {
    tone({ freq: 132, end: 86, dur: 0.7, type: 'sawtooth', vol: 0.13 })
    tone({ freq: 198, end: 140, dur: 0.6, delay: 0.12, type: 'sawtooth', vol: 0.1 })
  },
  tier() {
    tone({ freq: 440, dur: 0.14, type: 'triangle', vol: 0.1 })
    tone({ freq: 660, dur: 0.16, delay: 0.09, type: 'triangle', vol: 0.1 })
    tone({ freq: 880, dur: 0.24, delay: 0.18, type: 'triangle', vol: 0.09 })
  },
  levelup() {
    tone({ freq: 392, dur: 0.12, type: 'triangle', vol: 0.1 })
    tone({ freq: 523.25, dur: 0.14, delay: 0.08, type: 'triangle', vol: 0.1 })
    tone({ freq: 659.25, dur: 0.16, delay: 0.16, type: 'triangle', vol: 0.1 })
    tone({ freq: 783.99, dur: 0.3, delay: 0.24, type: 'triangle', vol: 0.09 })
  },
  pick() {
    tone({ freq: 700, end: 1250, dur: 0.1, type: 'triangle', vol: 0.09 })
    noise(0.08, 0.04, 2400)
  },
  die() {
    tone({ freq: 100, end: 26, dur: 1.3, type: 'sawtooth', vol: 0.22 })
    noise(0.9, 0.12, 240)
  },
  start() {
    tone({ freq: 196, dur: 0.3, type: 'triangle', vol: 0.12 })
    tone({ freq: 294, dur: 0.34, delay: 0.14, type: 'triangle', vol: 0.12 })
    noise(0.5, 0.06, 900, 0.05)
  },
}

/* ---------- ambient drone (ayin uğultusu) ---------- */

function startDrone() {
  if (!ctx || !master) return
  const g = ctx.createGain()
  g.gain.value = 0.05
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 240
  const o1 = ctx.createOscillator()
  o1.type = 'sawtooth'
  o1.frequency.value = 55
  const o2 = ctx.createOscillator()
  o2.type = 'sawtooth'
  o2.frequency.value = 55.8
  const o3 = ctx.createOscillator()
  o3.type = 'sine'
  o3.frequency.value = 110.4
  const g3 = ctx.createGain()
  g3.gain.value = 0.35
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.06
  const lg = ctx.createGain()
  lg.gain.value = 110
  lfo.connect(lg)
  lg.connect(f.frequency)
  o1.connect(f)
  o2.connect(f)
  o3.connect(g3)
  g3.connect(f)
  f.connect(g)
  g.connect(master)
  o1.start()
  o2.start()
  o3.start()
  lfo.start()
}
