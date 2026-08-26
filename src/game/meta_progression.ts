import { events } from './events'

export type MetaUpgradeId = 'vitality' | 'might' | 'celerity' | 'fortune' | 'mastery'

export interface MetaState {
  souls: number
  upgrades: Record<MetaUpgradeId, number>
  discoveredBiomes: string[]
  discoveredRelics: string[]
  bestWave: number
  bestKills: number
  runs: number
}

const STORAGE_KEY = 'anatema.meta.v1'
const MAX_LEVEL = 20

const state: MetaState = {
  souls: 0,
  upgrades: { vitality: 0, might: 0, celerity: 0, fortune: 0, mastery: 0 },
  discoveredBiomes: [],
  discoveredRelics: [],
  bestWave: 0,
  bestKills: 0,
  runs: 0,
}

function safeLoad(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<MetaState>
    state.souls = Math.max(0, Math.floor(Number(parsed.souls) || 0))
    state.bestWave = Math.max(0, Math.floor(Number(parsed.bestWave) || 0))
    state.bestKills = Math.max(0, Math.floor(Number(parsed.bestKills) || 0))
    state.runs = Math.max(0, Math.floor(Number(parsed.runs) || 0))
    for (const key of Object.keys(state.upgrades) as MetaUpgradeId[]) {
      state.upgrades[key] = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(parsed.upgrades?.[key]) || 0)))
    }
    state.discoveredBiomes = Array.isArray(parsed.discoveredBiomes) ? parsed.discoveredBiomes.filter((x): x is string => typeof x === 'string').slice(0, 64) : []
    state.discoveredRelics = Array.isArray(parsed.discoveredRelics) ? parsed.discoveredRelics.filter((x): x is string => typeof x === 'string').slice(0, 256) : []
  } catch {
    // Corrupt meta-save is ignored; a fresh normalized state remains playable.
  }
}

function persist(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* storage unavailable */ }
}

function cost(id: MetaUpgradeId): number {
  const level = state.upgrades[id]
  return 25 + level * level * 15
}

export function metaMultiplier(id: MetaUpgradeId): number {
  return 1 + state.upgrades[id] * 0.025
}

export function startMetaProgression(): () => void {
  safeLoad()
  const disposers = [
    events.on('combat:kill', ({ boss, elite }) => {
      const gain = boss ? 12 : elite ? 4 : 1
      state.souls = Math.min(9_999_999, state.souls + gain)
      state.bestKills = Math.max(state.bestKills, 1)
      persist()
    }),
    events.on('wave:start', ({ wave }) => {
      state.bestWave = Math.max(state.bestWave, wave)
      persist()
    }),
    events.on('arena:biome', ({ biome }) => {
      if (!state.discoveredBiomes.includes(biome)) state.discoveredBiomes.push(biome)
      persist()
    }),
    events.on('relic:acquire', ({ relicId }) => {
      if (!state.discoveredRelics.includes(relicId)) state.discoveredRelics.push(relicId)
      persist()
    }),
  ]
  return () => disposers.forEach((dispose) => dispose())
}

export function resetMetaProgression(): void {
  // Meta progression persists across runs. Runtime reset deliberately does not wipe it.
}

export function getMetaState(): Readonly<MetaState> {
  return {
    ...state,
    upgrades: { ...state.upgrades },
    discoveredBiomes: [...state.discoveredBiomes],
    discoveredRelics: [...state.discoveredRelics],
  }
}

export function buyMetaUpgrade(id: MetaUpgradeId): boolean {
  const level = state.upgrades[id]
  const price = cost(id)
  if (level >= MAX_LEVEL || state.souls < price) return false
  state.souls -= price
  state.upgrades[id] = level + 1
  persist()
  return true
}

export function recordRunEnd(kills: number, wave: number): void {
  state.runs = Math.min(1_000_000, state.runs + 1)
  state.bestKills = Math.max(state.bestKills, Math.floor(Math.max(0, kills)))
  state.bestWave = Math.max(state.bestWave, Math.floor(Math.max(0, wave)))
  persist()
}
