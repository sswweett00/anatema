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

function nextSeed(): number {
  const source = `${Date.now()}-${Math.random()}-${performance.now?.() ?? 0}`
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0 || 1
}

export function random(): number {
  let x = state.seed || 1
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  state.seed = x >>> 0
  return state.seed / 0xffffffff
}

export function resetProgress(seed = nextSeed()): void {
  state.seed = seed >>> 0 || 1
  state.wave = 0
  state.xp = 0
  state.level = 1
  state.ascension = 0
  state.comboBank = 0
  state.damageMultiplier = 1
  state.relics = []
  state.unlockedAbilities = []
}

export function xpToNextLevel(level = state.level): number {
  return Math.floor(BASE_XP * Math.pow(level, 1.33))
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
  events.emit('wave:end', { wave: state.wave, elapsed })
}

export function rarityRoll(): Rarity {
  const r = random()
  if (r < 0.005 + state.ascension * 0.001) return 'mythic'
  if (r < 0.025 + state.ascension * 0.002) return 'legendary'
  if (r < 0.085 + state.ascension * 0.004) return 'epic'
  if (r < 0.23) return 'rare'
  if (r < 0.52) return 'uncommon'
  return 'common'
}

export function acquireBestAvailableRelic(): string | undefined {
  const rarity = rarityRoll()
  const candidates = RELICS.filter((relic) => relic.rarity === rarity && !state.relics.includes(relic.id))
  const fallback = RELICS.filter((relic) => !state.relics.includes(relic.id))
  const selected = (candidates.length ? candidates : fallback)[Math.floor(random() * (candidates.length || fallback.length))]
  if (!selected) return undefined

  state.relics.push(selected.id)
  state.damageMultiplier *= 1 + selected.power / 1000
  events.emit('relic:acquire', { relicId: selected.id })
  return selected.id
}

export function addAscension(): number {
  state.ascension += 1
  state.damageMultiplier *= 1.08
  events.emit('run:ascend', { tier: state.ascension })
  return state.ascension
}

export function bankMomentum(amount: number): void {
  state.comboBank = Math.max(0, Math.min(1000, state.comboBank + Math.max(0, amount)))
}

export function spendMomentum(amount: number): boolean {
  if (state.comboBank < amount) return false
  state.comboBank -= amount
  return true
}

export function getProgress(): Readonly<RunProgress> {
  return state
}
