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
let stop: (() => void)[] = []

function init() {
  state.clear()
  for (const definition of definitions) state.set(definition.id, { ...definition, progress: 0, unlocked: false })
}

function update(id: string, value: number) {
  const item = state.get(id)
  if (!item || item.unlocked) return
  item.progress = Math.max(item.progress, value)
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
    const kills = Math.max(0, (window as Window & { __ANATEMA_KILLS?: number }).__ANATEMA_KILLS ?? 0) + 1
    ;(window as Window & { __ANATEMA_KILLS?: number }).__ANATEMA_KILLS = kills
    update('hundred', kills)
  }))
  stop.push(events.on('combat:reaction', () => update('stormborn', 1)))
  stop.push(events.on('combat:execute', () => {
    const value = Number(localStorage.getItem('anatema.ach.executes') ?? 0) + 1
    localStorage.setItem('anatema.ach.executes', String(value))
    update('executioner', value)
  }))
  stop.push(events.on('run:ascend', ({ tier }) => update('ascendant', tier)))
  stop.push(events.on('relic:acquire', () => {
    const value = Number(localStorage.getItem('anatema.ach.relics') ?? 0) + 1
    localStorage.setItem('anatema.ach.relics', String(value))
    update('collector', value)
  }))
  return stopAchievements
}

export function stopAchievements() {
  for (const dispose of stop.splice(0)) dispose()
}

export function resetAchievements() {
  init()
  if (typeof window !== 'undefined') delete (window as Window & { __ANATEMA_KILLS?: number }).__ANATEMA_KILLS
}

export function tickAchievements(time: number, combo: number) {
  update('survivor', time)
  update('apocalypse', combo)
}

export function achievements(): Achievement[] {
  return [...state.values()].map((item) => ({ ...item }))
}
