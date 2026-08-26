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
  low: { fps: 45, frameMs: 22.2, pressure: 0, recommendedDpr: 0.85, particleScale: 0.45, enemyScale: 0.75 },
  balanced: { fps: 60, frameMs: 16.7, pressure: 0, recommendedDpr: 1, particleScale: 0.7, enemyScale: 0.9 },
  high: { fps: 60, frameMs: 16.7, pressure: 0, recommendedDpr: 1.5, particleScale: 1, enemyScale: 1 },
}

export class PerformanceController {
  private elapsed = 0
  private samples = 0
  private fps = 60
  private pressure = 0
  private lastAdjustment = 0
  private level: 0 | 1 | 2 = 1

  constructor(private readonly mode: QualityPreset = 'auto') {}

  sample(dt: number, enemyCount: number): PerformanceSnapshot {
    const safeDt = Math.max(0.001, Math.min(dt, 0.25))
    this.elapsed += safeDt
    this.samples++
    const instantFps = 1 / safeDt
    this.fps += (Math.min(120, instantFps) - this.fps) * 0.08

    const enemyPressure = Math.min(1, enemyCount / 1100)
    const framePressure = Math.max(0, Math.min(1, (this.fps - 60) / -30))
    this.pressure = this.pressure * 0.94 + Math.max(enemyPressure * 0.35, framePressure) * 0.06

    if (this.mode === 'auto' && this.elapsed - this.lastAdjustment > 2.5 && this.samples > 30) {
      if (this.fps < 42 && this.level > 0) {
        this.level--
        this.lastAdjustment = this.elapsed
      } else if (this.fps > 68 && this.level < 2 && enemyCount < 700) {
        this.level++
        this.lastAdjustment = this.elapsed
      }
    }

    const snapshot = this.snapshot()
    runtimeQuality.particleScale = snapshot.particleScale
    runtimeQuality.enemyScale = snapshot.enemyScale
    runtimeQuality.dpr = snapshot.recommendedDpr
    return snapshot
  }

  snapshot(): PerformanceSnapshot {
    if (this.mode !== 'auto') return PRESETS[this.mode]
    if (this.level === 0) return PRESETS.low
    if (this.level === 2) return PRESETS.high
    return PRESETS.balanced
  }

  get currentFps(): number {
    return this.fps
  }
}
