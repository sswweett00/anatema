import { runtimeQuality } from './performance'
import { events } from './events'

export interface BudgetSnapshot {
  cpuBudget: number
  gpuBudget: number
  entityBudget: number
  particleBudget: number
  projectileBudget: number
  postFx: number
}

const state: BudgetSnapshot = {
  cpuBudget: 1,
  gpuBudget: 1,
  entityBudget: 1400,
  particleBudget: 900,
  projectileBudget: 320,
  postFx: 1,
}

let pressure = 0
let lastFps = 60

function updateFromPressure(dt: number): void {
  const safeDt = Math.max(0, Math.min(0.25, dt))
  const target = Math.max(0, Math.min(1, (58 - lastFps) / 35))
  pressure += (target - pressure) * Math.min(1, safeDt * 2.5)

  const quality = Math.max(0.35, 1 - pressure * 0.72)
  state.cpuBudget = quality
  state.gpuBudget = Math.max(0.3, quality * 0.94)
  state.entityBudget = Math.floor(500 + 900 * quality)
  state.particleBudget = Math.floor(180 + 720 * quality)
  state.projectileBudget = Math.floor(80 + 240 * quality)
  state.postFx = quality > 0.75 ? 1 : quality > 0.55 ? 0.65 : 0.35

  // A temporary frame-time spike must not permanently reduce runtime quality.
  runtimeQuality.enemyScale = Math.max(0.45, quality)
  runtimeQuality.particleScale = Math.max(0.25, quality)
  runtimeQuality.particleUpdateHz = quality < 0.58 ? 30 : quality < 0.78 ? 45 : 60

  if (pressure > 0.78) {
    events.emit('performance:pressure', { pressure, fps: lastFps })
  }
}

export function samplePerformance(fps: number, dt = 0.25): BudgetSnapshot {
  lastFps = Number.isFinite(fps) ? Math.max(1, Math.min(240, fps)) : 60
  updateFromPressure(dt)
  return state
}

export function getPerformanceBudget(): Readonly<BudgetSnapshot> {
  return state
}

export function resetPerformanceGovernor(): void {
  pressure = 0
  lastFps = 60
  Object.assign(state, {
    cpuBudget: 1,
    gpuBudget: 1,
    entityBudget: 1400,
    particleBudget: 900,
    projectileBudget: 320,
    postFx: 1,
  })
  Object.assign(runtimeQuality, {
    enemyScale: 0.9,
    particleScale: 0.7,
    dpr: 1,
    particleUpdateHz: 60,
  })
}
