export interface SaveV1 {
  version: 1
  profile: {
    bestKills: number
    bestLevel: number
    bestCombo: number
    totalKills: number
    totalRuns: number
    totalPlayTime: number
    quality: 'auto' | 'low' | 'balanced' | 'high'
    reducedMotion: boolean
  }
}

export interface SaveV2 extends Omit<SaveV1, 'version'> {
  version: 2
  settings: {
    quality: SaveV1['profile']['quality']
    reducedMotion: boolean
    screenShake: number
    damageNumbers: boolean
  }
  achievements: string[]
}

export type SaveData = SaveV2

function finiteInt(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback
}

export function migrateSave(input: unknown): SaveData {
  const value = input && typeof input === 'object' ? input as Partial<SaveV1 & SaveV2> : {}
  const profile = value.profile ?? {}
  const settings = value.settings ?? {}
  const quality = profile.quality === 'low' || profile.quality === 'balanced' || profile.quality === 'high' || profile.quality === 'auto' ? profile.quality : 'auto'
  const reducedMotion = Boolean(profile.reducedMotion)

  return {
    version: 2,
    profile: {
      bestKills: finiteInt(profile.bestKills),
      bestLevel: finiteInt(profile.bestLevel, 1),
      bestCombo: finiteInt(profile.bestCombo),
      totalKills: finiteInt(profile.totalKills),
      totalRuns: finiteInt(profile.totalRuns),
      totalPlayTime: Math.max(0, Number(profile.totalPlayTime) || 0),
      quality,
      reducedMotion,
    },
    settings: {
      quality: settings.quality === 'low' || settings.quality === 'balanced' || settings.quality === 'high' || settings.quality === 'auto' ? settings.quality : quality,
      reducedMotion: Boolean(settings.reducedMotion ?? reducedMotion),
      screenShake: Math.max(0, Math.min(1, Number(settings.screenShake ?? 1) || 0)),
      damageNumbers: settings.damageNumbers !== false,
    },
    achievements: Array.isArray(value.achievements) ? value.achievements.filter((x): x is string => typeof x === 'string').slice(0, 500) : [],
  }
}

export function encodeSave(data: SaveData): string {
  return JSON.stringify(data)
}

export function decodeSave(raw: string): SaveData {
  try {
    return migrateSave(JSON.parse(raw))
  } catch {
    return migrateSave(undefined)
  }
}
