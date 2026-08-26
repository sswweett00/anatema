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
}

const PRESETS: Record<Exclude<QualityPreset, 'auto'>, PerformanceSnapshot> = {
  low: { fps: 45, frameMs: 22.2, pressure: 0, recommendedDpr: 0.8, particleScale: 0.38, enemyScale: 0.72 },
  balanced: { fps: 60, frameMs: 16.7, pressure: 0, recommendedDpr: 1, particleScale: 0.68, enemyScale: 0.9 },
  high: { fps: 60, frameMs: 16.7, pressure: 0, recommendedDpr: 1.45, particleScale: 1, enemyScale: 1 },
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

  constructor(private readonly mode: QualityPreset = 'auto') {}

  sample(dt: number, enemyCount: number): PerformanceSnapshot {
    const safeDt = clamp(dt, 0.001, 0.1)
    this.elapsed += safeDt
    this.samples++

    const instantFps = clamp(1 / safeDt, 20, 144)
    this.fps += (instantFps - this.fps) * 0.08

    const enemyPressure = clamp(enemyCount / 1200, 0, 1)
    const framePressure = clamp((55 - this.fps) / 25, 0, 1)
    this.pressure += (Math.max(enemyPressure, framePressure) - this.pressure) * 0.06

    if (this.mode === 'auto' && this.samples > 20) {
      if (this.fps < 43 || this.pressure > 0.72) {
        this.stableBad += safeDt
        this.stableGood = 0
      } else if (this.fps > 66 && this.pressure < 0.34 && enemyCount < 900) {
        this.stableGood += safeDt
        this.stableBad = 0
      } else {
        this.stableGood = Math.max(0, this.stableGood - safeDt * 0.5)
        this.stableBad = Math.max(0, this.stableBad - safeDt * 0.5)
      }

      const cooldownPassed = this.elapsed - this.lastAdjustment >= 3
      if (cooldownPassed && this.stableBad >= 1.2 && this.level > 0) {
        this.level--
        this.lastAdjustment = this.elapsed
        this.stableBad = 0
      } else if (cooldownPassed && this.stableGood >= 4 && this.level < 2) {
        this.level++
        this.lastAdjustment = this.elapsed
        this.stableGood = 0
      }
    }

    const snapshot = this.snapshot()
    runtimeQuality.particleScale = snapshot.particleScale
    runtimeQuality.enemyScale = snapshot.enemyScale
    runtimeQuality.dpr = snapshot.recommendedDpr
    return snapshot
  }

  snapshot(): PerformanceSnapshot {
    if (this.mode !== 'auto') return { ...PRESETS[this.mode], pressure: this.pressure, fps: this.fps, frameMs: 1000 / this.fps }

    const base = this.level === 0 ? PRESETS.low : this.level === 2 ? PRESETS.high : PRESETS.balanced
    const pressurePenalty = clamp(this.pressure * 0.18, 0, 0.18)

    return {
      ...base,
      fps: this.fps,
      frameMs: 1000 / Math.max(1, this.fps),
      pressure: this.pressure,
      recommendedDpr: clamp(base.recommendedDpr - pressurePenalty, 0.65, 1.5),
      particleScale: clamp(base.particleScale * (1 - this.pressure * 0.45), 0.28, 1),
      enemyScale: clamp(base.enemyScale * (1 - this.pressure * 0.2), 0.65, 1),
    }
  }

  get currentFps(): number {
    return this.fps
  }
}
