import { ENEMIES } from './combat_registry'
import { gameState, enemies } from '../ecs/world'
import { events } from './events'
import { getProgress } from './progression'

export interface WaveComposition {
  wave: number
  budget: number
  composition: Record<string, number>
  eliteChance: number
  bossChance: number
  pressure: number
}

let lastWave = -1
let current: WaveComposition = {
  wave: 0,
  budget: 0,
  composition: {},
  eliteChance: 0,
  bossChance: 0,
  pressure: 0,
}

function buildComposition(wave: number): WaveComposition {
  const progress = getProgress()
  const budget = Math.floor(25 + wave * 11 + Math.pow(wave, 1.35) * 5)
  const pressure = Math.min(1, enemies.entities.length / 1400)
  const eliteChance = Math.min(0.42, 0.025 + wave * 0.006 + progress.ascension * 0.012)
  const bossChance = wave > 8 ? Math.min(0.24, 0.02 + (wave - 8) * 0.008) : 0
  const weights = ENEMIES.map((enemy) => {
    const speedBias = enemy.speed > 3.5 ? Math.min(2.2, 0.9 + wave * 0.03) : 1
    const heavyBias = enemy.hp > 100 ? Math.min(2.4, 0.7 + wave * 0.05) : 1
    return { id: enemy.id, value: Math.max(0.05, enemy.eliteWeight * speedBias * heavyBias) }
  })
  const total = weights.reduce((sum, item) => sum + item.value, 0)
  const composition: Record<string, number> = {}
  for (const item of weights) composition[item.id] = Math.max(0, Math.floor(budget * (item.value / total)))
  return { wave, budget, composition, eliteChance, bossChance, pressure }
}

function tick(): void {
  if (gameState.phase !== 'playing') return
  const wave = Math.max(0, gameState.wave)
  if (wave === lastWave) return
  lastWave = wave
  current = buildComposition(wave)
  events.emit('wave:start', { wave, budget: current.budget })
}

let running = false
let timer = 0
export function startWaveDirector() {
  if (running || typeof window === 'undefined') return stopWaveDirector
  running = true
  timer = window.setInterval(tick, 250)
  return stopWaveDirector
}

export function stopWaveDirector() {
  running = false
  if (timer) window.clearInterval(timer)
  timer = 0
}

export function resetWaveDirector() {
  lastWave = -1
  current = { wave: 0, budget: 0, composition: {}, eliteChance: 0, bossChance: 0, pressure: 0 }
}

export function getWaveComposition(): Readonly<WaveComposition> {
  return current
}
