import { getProgress, type RunProgress } from './progression'

const KEY = 'anatema.run.snapshot.v1'

type Snapshot = {
  version: 1
  timestamp: number
  progress: RunProgress
}

function sanitizeProgress(value: unknown): RunProgress | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<RunProgress>
  return {
    seed: Number.isFinite(input.seed) ? (Number(input.seed) >>> 0) || 1 : 1,
    wave: Math.max(0, Math.floor(Number(input.wave) || 0)),
    xp: Math.max(0, Number(input.xp) || 0),
    level: Math.max(1, Math.floor(Number(input.level) || 1)),
    ascension: Math.max(0, Math.floor(Number(input.ascension) || 0)),
    comboBank: Math.max(0, Math.min(1000, Number(input.comboBank) || 0)),
    damageMultiplier: Math.max(0.01, Number(input.damageMultiplier) || 1),
    relics: Array.isArray(input.relics) ? input.relics.filter((id): id is string => typeof id === 'string').slice(0, 64) : [],
    unlockedAbilities: Array.isArray(input.unlockedAbilities) ? input.unlockedAbilities.filter((id): id is string => typeof id === 'string').slice(0, 128) : [],
  }
}

export function saveRunSnapshot(): void {
  if (typeof window === 'undefined') return
  const snapshot: Snapshot = {
    version: 1,
    timestamp: Date.now(),
    progress: { ...getProgress(), relics: [...getProgress().relics], unlockedAbilities: [...getProgress().unlockedAbilities] },
  }
  localStorage.setItem(KEY, JSON.stringify(snapshot))
}

export function loadRunSnapshot(): Snapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Snapshot>
    const progress = sanitizeProgress(value.progress)
    if (!progress) return null
    return { version: 1, timestamp: Math.max(0, Number(value.timestamp) || 0), progress }
  } catch {
    return null
  }
}

export function clearRunSnapshot(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(KEY)
}
