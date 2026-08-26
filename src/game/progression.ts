import { RELICS, type Rarity } from './combat_registry'
import { events } from './events'

export interface RunProgress {
  seed: number
  wave: number
  xp: number
  level: number
  ascension: number
  comboBank: number
  damageMultiplier: number
  relics: string[]
  unlockedAbilities: string[]
}

const BASE_XP = 90
const state: RunProgress = {
  seed: 1,
  wave: 0,
  xp: 0,
  level: 1,
  ascension: 0,
  comboBank: 0,
  damageMultiplier: 1,
  relics: [],
  unlockedAbilities: [],
}

let rngState = 1

function normalizeSeed(seed: number): number {
  return (seed >>> 0) || 1
}

export function createRunSeed(input = Date.now()): number {
  let x = normalizeSeed(Number.isFinite(input) ? Math.floor(input) : 1)
  x ^= x >>> 16
  x = Math.imul(x, 0x45d9f3b)
  x ^= x >>> 16
  x = Math.imul(x, 0x45d9f3b)
  x ^= x >>> 16
  return normalizeSeed(x)
}

export function random(): number {
  let x = rngState || 1
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  rngState = x >>> 0 || 1
  return rngState / 0x100000000
}

export function resetProgress(seed = createRunSeed()): void {
  state.seed = normalizeSeed(seed)
  rngState = state.seed
  state.wave = 0
  state.xp = 0
  state.level = 1
  state.ascension = 0
  state.comboBank = 0
  state.damageMultiplier = 1
  state.relics.length = 0
  state.unlockedAbilities.length = 0
}

export function xpToNextLevel(level = state.level): number {
  const safeLevel = Math.max(1, Math.floor(level))
  return Math.max(1, Math.floor(BASE_XP * Math.pow(safeLevel, 1.33)))
}

export function addXp(amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false
  state.xp += amount
  let leveled = false
  while (state.xp >= xpToNextLevel()) {
    state.xp -= xpToNextLevel()
    state.level += 1
    leveled = true
    events.emit('player:level', { level: state.level })
  }
  return leveled
}

export function nextWave(): number {
  state.wave += 1
  const budget = Math.floor(25 + state.wave * 11 + Math.pow(state.wave, 1.35) * 5)
  events.emit('wave:start', { wave: state.wave, budget })
  return budget
}

export function endWave(elapsed: number): void {
  events.emit('wave:end', { wave: state.wave, elapsed: Math.max(0, elapsed) })
}

export function rarityRoll(): Rarity {
  const r = random()
  const asc = Math.max(0, state.ascension)
  if (r < Math.min(0.08, 0.005 + asc * 0.001)) return 'mythic'
  if (r < Math.min(0.2, 0.025 + asc * 0.002)) return 'legendary'
  if (r < Math.min(0.45, 0.085 + asc * 0.004)) return 'epic'
  if (r < 0.63) return 'rare'
  if (r < 0.83) return 'uncommon'
  return 'common'
}

export function acquireBestAvailableRelic(): string | undefined {
  const rarity = rarityRoll()
  const candidates = RELICS.filter((relic) => relic.rarity === rarity && !state.relics.includes(relic.id))
  const fallback = RELICS.filter((relic) => !state.relics.includes(relic.id))
  const pool = candidates.length ? candidates : fallback
  if (!pool.length) return undefined
  const selected = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]

  state.relics.push(selected.id)
  state.damageMultiplier = Math.min(8, state.damageMultiplier * (1 + selected.power / 1000))
  events.emit('relic:acquire', { relicId: selected.id })
  return selected.id
}

export function addAscension(): number {
  state.ascension = Math.min(100, state.ascension + 1)
  state.damageMultiplier = Math.min(8, state.damageMultiplier * 1.08)
  events.emit('run:ascend', { tier: state.ascension })
  return state.ascension
}

export function bankMomentum(amount: number): void {
  state.comboBank = Math.max(0, Math.min(1000, state.comboBank + Math.max(0, amount)))
}

export function spendMomentum(amount: number): boolean {
  const cost = Math.max(0, amount)
  if (state.comboBank < cost) return false
  state.comboBank -= cost
  return true
}

export function getProgress(): Readonly<RunProgress> {
  return state
}
