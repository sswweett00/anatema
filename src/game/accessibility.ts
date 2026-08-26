export interface AccessibilitySettings {
  reducedMotion: boolean
  screenShake: number
  damageNumbers: boolean
  flashEffects: boolean
  colorAssist: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'
  audioCues: boolean
}

const KEY = 'anatema.accessibility.v1'
const DEFAULTS: AccessibilitySettings = {
  reducedMotion: false,
  screenShake: 1,
  damageNumbers: true,
  flashEffects: true,
  colorAssist: 'none',
  audioCues: true,
}

function sanitize(value: unknown): AccessibilitySettings {
  if (!value || typeof value !== 'object') return { ...DEFAULTS }
  const input = value as Partial<AccessibilitySettings>
  const colorAssist = input.colorAssist === 'deuteranopia' || input.colorAssist === 'protanopia' || input.colorAssist === 'tritanopia'
    ? input.colorAssist
    : 'none'
  return {
    reducedMotion: Boolean(input.reducedMotion),
    screenShake: Number.isFinite(input.screenShake) ? Math.max(0, Math.min(1, Number(input.screenShake))) : DEFAULTS.screenShake,
    damageNumbers: input.damageNumbers !== false,
    flashEffects: input.flashEffects !== false,
    colorAssist,
    audioCues: input.audioCues !== false,
  }
}

export function loadAccessibility(): AccessibilitySettings {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? sanitize(JSON.parse(raw)) : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAccessibility(settings: AccessibilitySettings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(sanitize(settings)))
}

export function accessibility(): AccessibilitySettings {
  return loadAccessibility()
}
