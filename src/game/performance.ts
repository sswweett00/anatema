import type { QualityPreset } from './profile'

export interface PerformanceSnapshot {
  fps: number
  frameMs: number
  pressure: number
  recommendedDpr: number
  particleScale: number
  enemyScale: number
}

export const runtimeQuality = {
  particleScale: 0.7,
  enemyScale: 0.9,
  dpr: 1,
  particleUpdateHz: 60,
}

const PRESETS: Record<Exclude<QualityPreset, 'auto'>, PerformanceSnapshot> = {
  low: { fps: 45, frameMs: 22.2, pressure: 0, recommendedDpr: 0.8, particleScale: 0.38, enemyScale: 0.72 },
  balanced: { fps: 60, frameMs: 16.7, pressure: 0, recommendedDpr: 1.1, particleScale: 0.74, enemyScale: 0.94 },
  high: { fps: 60, frameMs: 16.7, pressure: 0, recommendedDpr: 1.6, particleScale: 1, enemyScale: 1 },
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export class PerformanceController {
  private elapsed = 0
  private samples = 0
  private fps = 60
  private pressure = 0
  private lastAdjustment = -10
  private stableGood = 0
  private stableBad = 0
  private level: 0 | 1 | 2 = 1
  private frameTimeEma = 16.7

  constructor(private readonly mode: QualityPreset = 'auto') {}

  sample(dt: number, enemyCount: number): PerformanceSnapshot {
    const safeDt = clamp(dt, 0.001, 0.05)
    this.elapsed += safeDt
    this.samples++

    const instantFrameMs = safeDt * 1000
    const instantFps = clamp(1 / safeDt, 20, 165)
    this.fps += (instantFps - this.fps) * 0.12
    this.frameTimeEma += (instantFrameMs - this.frameTimeEma) * 0.1

    const enemyPressure = clamp(enemyCount / 1400, 0, 1)
    const framePressure = clamp((this.frameTimeEma - 14.5) / 10.5, 0, 1)
    const compositePressure = Math.max(enemyPressure * 0.82, framePressure)
    this.pressure += (compositePressure - this.pressure) * 0.08

    if (this.mode === 'auto' && this.samples > 20) {
      if (this.fps < 45 || this.pressure > 0.74) {
        this.stableBad += safeDt
        this.stableGood = 0
      } else if (this.fps > 69 && this.pressure < 0.28 && enemyCount < 950) {
        this.stableGood += safeDt
        this.stableBad = 0
      } else {
        this.stableGood = Math.max(0, this.stableGood - safeDt * 0.35)
        this.stableBad = Math.max(0, this.stableBad - safeDt * 0.35)
      }

      const cooldownPassed = this.elapsed - this.lastAdjustment >= 2.5
      if (cooldownPassed && this.stableBad >= 0.9 && this.level > 0) {
        this.level--
        this.lastAdjustment = this.elapsed
        this.stableBad = 0
      } else if (cooldownPassed && this.stableGood >= 3.5 && this.level < 2) {
        this.level++
        this.lastAdjustment = this.elapsed
        this.stableGood = 0
      }
    }

    const snapshot = this.snapshot()
    runtimeQuality.particleScale = snapshot.particleScale
    runtimeQuality.enemyScale = snapshot.enemyScale
    runtimeQuality.dpr = snapshot.recommendedDpr
    runtimeQuality.particleUpdateHz = this.mode === 'auto'
      ? this.pressure > 0.72 ? 30 : this.pressure > 0.48 ? 45 : 60
      : this.mode === 'low' ? 36 : 60
    return snapshot
  }

  snapshot(): PerformanceSnapshot {
    if (this.mode !== 'auto') {
      return {
        ...PRESETS[this.mode],
        pressure: this.pressure,
        fps: this.fps,
        frameMs: this.frameTimeEma,
      }
    }

    const base = this.level === 0 ? PRESETS.low : this.level === 2 ? PRESETS.high : PRESETS.balanced
    const pressurePenalty = clamp(this.pressure * 0.2, 0, 0.2)

    return {
      ...base,
      fps: this.fps,
      frameMs: this.frameTimeEma,
      pressure: this.pressure,
      recommendedDpr: clamp(base.recommendedDpr - pressurePenalty, 0.7, 1.75),
      particleScale: clamp(base.particleScale * (1 - this.pressure * 0.35), 0.3, 1),
      enemyScale: clamp(base.enemyScale * (1 - this.pressure * 0.16), 0.66, 1),
    }
  }

  get currentFps(): number {
    return this.fps
  }
}
