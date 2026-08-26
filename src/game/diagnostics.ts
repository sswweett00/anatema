import { bullets, enemies, gameState, particles } from '../ecs/world'
import { getPerformanceBudget } from './performance_governor'
import { getProgress } from './progression'
import { runtimeSuiteStatus } from './runtime_suite'

export interface DiagnosticsSnapshot {
  phase: string
  time: number
  wave: number
  level: number
  kills: number
  combo: number
  enemies: number
  bullets: number
  particles: number
  ascension: number
  relicCount: number
  damageMultiplier: number
  budgets: ReturnType<typeof getPerformanceBudget>
  runtime: ReturnType<typeof runtimeSuiteStatus>
}

export function captureDiagnostics(): DiagnosticsSnapshot {
  const progress = getProgress()
  return {
    phase: gameState.phase,
    time: gameState.time,
    wave: gameState.wave,
    level: gameState.level,
    kills: gameState.kills,
    combo: gameState.combo,
    enemies: enemies.entities.length,
    bullets: bullets.entities.length,
    particles: particles.entities.length,
    ascension: progress.ascension,
    relicCount: progress.relics.length,
    damageMultiplier: progress.damageMultiplier,
    budgets: getPerformanceBudget(),
    runtime: runtimeSuiteStatus(),
  }
}

export function diagnosticsJson(): string {
  return JSON.stringify(captureDiagnostics(), (_key, value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) return 0
    return value
  })
}
