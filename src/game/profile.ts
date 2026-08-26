export type QualityPreset = 'auto' | 'low' | 'balanced' | 'high'

export interface RunSummary {
  kills: number
  level: number
  maxCombo: number
  duration: number
  timestamp: number
}

export interface Profile {
  version: 1
  bestKills: number
  bestLevel: number
  bestCombo: number
  totalKills: number
  totalRuns: number
  totalPlayTime: number
  quality: QualityPreset
  reducedMotion: boolean
  runs: RunSummary[]
}

const STORAGE_KEY = 'anatema.profile.v1'
const MAX_RUNS = 24

const DEFAULT_PROFILE: Profile = {
  version: 1,
  bestKills: 0,
  bestLevel: 0,
  bestCombo: 0,
  totalKills: 0,
  totalRuns: 0,
  totalPlayTime: 0,
  quality: 'auto',
  reducedMotion: false,
  runs: [],
}

function sanitize(input: unknown): Profile {
  if (!input || typeof input !== 'object') return { ...DEFAULT_PROFILE, runs: [] }
  const value = input as Partial<Profile>
  const quality: QualityPreset = value.quality === 'low' || value.quality === 'balanced' || value.quality === 'high' || value.quality === 'auto'
    ? value.quality
    : 'auto'

  return {
    version: 1,
    bestKills: Math.max(0, Number(value.bestKills) || 0),
    bestLevel: Math.max(0, Number(value.bestLevel) || 0),
    bestCombo: Math.max(0, Number(value.bestCombo) || 0),
    totalKills: Math.max(0, Number(value.totalKills) || 0),
    totalRuns: Math.max(0, Number(value.totalRuns) || 0),
    totalPlayTime: Math.max(0, Number(value.totalPlayTime) || 0),
    quality,
    reducedMotion: Boolean(value.reducedMotion),
    runs: Array.isArray(value.runs)
      ? value.runs
          .filter((run): run is RunSummary => Boolean(run) && typeof run === 'object')
          .slice(-MAX_RUNS)
          .map((run) => ({
            kills: Math.max(0, Number(run.kills) || 0),
            level: Math.max(0, Number(run.level) || 0),
            maxCombo: Math.max(0, Number(run.maxCombo) || 0),
            duration: Math.max(0, Number(run.duration) || 0),
            timestamp: Math.max(0, Number(run.timestamp) || 0),
          }))
      : [],
  }
}

export function loadProfile(): Profile {
  if (typeof window === 'undefined') return { ...DEFAULT_PROFILE, runs: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? sanitize(JSON.parse(raw)) : { ...DEFAULT_PROFILE, runs: [] }
  } catch {
    return { ...DEFAULT_PROFILE, runs: [] }
  }
}

export function saveProfile(profile: Profile): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(profile)))
  } catch {
    // Storage can be unavailable in private/embedded browser contexts.
  }
}

export function updateProfile(mutator: (profile: Profile) => void): Profile {
  const profile = loadProfile()
  mutator(profile)
  saveProfile(profile)
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('anatema:profile', { detail: profile }))
    } catch {
      // CustomEvent/window can be unavailable in non-browser test environments.
    }
  }
  return profile
}

export function recordRun(summary: RunSummary): Profile {
  return updateProfile((profile) => {
    profile.bestKills = Math.max(profile.bestKills, summary.kills)
    profile.bestLevel = Math.max(profile.bestLevel, summary.level)
    profile.bestCombo = Math.max(profile.bestCombo, summary.maxCombo)
    profile.totalKills += summary.kills
    profile.totalRuns += 1
    profile.totalPlayTime += summary.duration
    profile.runs = [...profile.runs, summary].slice(-MAX_RUNS)
  })
}

export function setQuality(quality: QualityPreset): Profile {
  return updateProfile((profile) => {
    profile.quality = quality
  })
}

export function toggleReducedMotion(): Profile {
  return updateProfile((profile) => {
    profile.reducedMotion = !profile.reducedMotion
  })
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}
