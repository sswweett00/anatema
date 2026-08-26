import { events } from './events'

export interface Achievement {
  id: string
  title: string
  description: string
  target: number
  progress: number
  unlocked: boolean
}

const definitions: readonly Omit<Achievement, 'progress' | 'unlocked'>[] = [
  { id: 'first_blood', title: 'İlk Kan', description: 'İlk düşmanı alt et.', target: 1 },
  { id: 'hundred', title: 'Kızıl Yüz', description: 'Tek koşuda 100 düşman öldür.', target: 100 },
  { id: 'stormborn', title: 'Fırtınanın Çocuğu', description: 'Bir elemental reaction gerçekleştir.', target: 1 },
  { id: 'executioner', title: 'Cellat', description: '50 execute gerçekleştir.', target: 50 },
  { id: 'survivor', title: 'Küller İçinden', description: '10 dakika hayatta kal.', target: 600 },
  { id: 'ascendant', title: 'Yükselen', description: '5 ascension seviyesine ulaş.', target: 5 },
  { id: 'collector', title: 'Koleksiyoncu', description: '6 relic edin.', target: 6 },
  { id: 'apocalypse', title: 'Apokalips', description: '100 combo gör.', target: 100 },
]

const state = new Map<string, Achievement>()
let stop: Array<() => void> = []

function storageGet(key: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const value = Number(window.localStorage.getItem(key) ?? 0)
    return Number.isFinite(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

function storageSet(key: string, value: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, String(Math.max(0, Math.floor(value))))
  } catch {
    // Storage can be unavailable in private/embedded browser contexts.
  }
}

function init() {
  state.clear()
  for (const definition of definitions) {
    const persisted = definition.id === 'executioner'
      ? storageGet('anatema.ach.executes')
      : definition.id === 'collector'
        ? storageGet('anatema.ach.relics')
        : 0
    state.set(definition.id, {
      ...definition,
      progress: Math.min(definition.target, persisted),
      unlocked: persisted >= definition.target,
    })
  }
}

function update(id: string, value: number) {
  const item = state.get(id)
  if (!item || item.unlocked) return
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
  item.progress = Math.max(item.progress, safeValue)
  if (item.progress >= item.target) {
    item.progress = item.target
    item.unlocked = true
    events.emit('achievement:unlock', { id: item.id, title: item.title })
  }
}

export function startAchievements() {
  if (stop.length) return stopAchievements
  init()
  stop.push(events.on('combat:kill', () => update('first_blood', 1)))
  stop.push(events.on('combat:kill', () => {
    const kills = storageGet('anatema.ach.runKills') + 1
    storageSet('anatema.ach.runKills', kills)
    update('hundred', kills)
  }))
  stop.push(events.on('combat:reaction', () => update('stormborn', 1)))
  stop.push(events.on('combat:execute', () => {
    const value = storageGet('anatema.ach.executes') + 1
    storageSet('anatema.ach.executes', value)
    update('executioner', value)
  }))
  stop.push(events.on('run:ascend', ({ tier }) => update('ascendant', tier)))
  stop.push(events.on('relic:acquire', () => {
    const value = storageGet('anatema.ach.relics') + 1
    storageSet('anatema.ach.relics', value)
    update('collector', value)
  }))
  return stopAchievements
}

export function stopAchievements() {
  for (const dispose of stop.splice(0)) dispose()
}

export function resetAchievements() {
  init()
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem('anatema.ach.runKills') } catch { /* ignore unavailable storage */ }
  }
}

export function tickAchievements(time: number, combo: number) {
  update('survivor', Number.isFinite(time) ? Math.max(0, time) : 0)
  update('apocalypse', Number.isFinite(combo) ? Math.max(0, combo) : 0)
}

export function achievements(): Achievement[] {
  return [...state.values()].map((item) => ({ ...item }))
}
