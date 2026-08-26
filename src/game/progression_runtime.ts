import { gameState, enemies } from '../ecs/world'
import {
  addAscension,
  acquireBestAvailableRelic,
  addXp,
  bankMomentum,
  endWave,
  getProgress,
  nextWave,
  resetProgress,
  xpToNextLevel,
} from './progression'
import { events } from './events'
import { onSimulationTick } from './simulation_clock'

type Stop = () => void

let active = false
let unsubscribe: Stop | undefined
let accumulator = 0
let lastKills = 0
let lastProgressLevel = 1
let lastWaveMarker = 0
let lastTime = 0

const TICK_INTERVAL = 0.25

function syncProgressToWorld(): void {
  const progress = getProgress()
  gameState.xp = Math.max(0, progress.xp)
  gameState.xpNext = Math.max(1, xpToNextLevel(progress.level))
  gameState.level = Math.max(1, progress.level)
  gameState.wave = Math.max(0, progress.wave)
}

function applyLevelRewards(previousLevel: number, nextLevelValue: number): void {
  for (let level = previousLevel + 1; level <= nextLevelValue; level++) {
    if (level % 5 === 0) acquireBestAvailableRelic()
    if (level > 20 && level % 10 === 0) addAscension()
  }
}

function tick(dt: number): void {
  if (!active) return
  accumulator += Math.max(0, dt)
  if (accumulator < TICK_INTERVAL) return
  accumulator = 0

  const kills = Math.max(0, Math.floor(gameState.kills))
  const killDelta = kills - lastKills
  if (killDelta > 0) {
    addXp(killDelta * (1 + Math.min(4, Math.max(0, gameState.combo) / 25)))
    bankMomentum(killDelta * (gameState.combo >= 30 ? 1.4 : 0.7))
    lastKills = kills
  } else if (kills < lastKills) {
    lastKills = kills
  }

  const progressBefore = getProgress().level
  const currentLevel = Math.max(1, Math.floor(progressBefore))
  if (currentLevel > lastProgressLevel) {
    applyLevelRewards(lastProgressLevel, currentLevel)
    lastProgressLevel = currentLevel
  } else if (currentLevel < lastProgressLevel) {
    lastProgressLevel = currentLevel
  }

  const time = Number.isFinite(gameState.time) ? Math.max(0, gameState.time) : 0
  const waveMarker = Math.floor(time / 30)
  if (waveMarker > lastWaveMarker) {
    if (lastWaveMarker > 0) endWave(Math.max(0, time - lastTime))
    nextWave()
    lastWaveMarker = waveMarker
    lastTime = time
  }

  syncProgressToWorld()

  if (enemies.entities.length > 1400) {
    events.emit('runtime:error', {
      system: 'progression',
      message: 'Enemy cap exceeded; progression runtime observed overflow.',
    })
  }
}

export function startProgressionRuntime(): Stop {
  if (active || typeof window === 'undefined') return stopProgressionRuntime
  active = true
  accumulator = 0
  syncProgressToWorld()
  lastKills = Math.max(0, Math.floor(gameState.kills))
  lastProgressLevel = gameState.level
  lastWaveMarker = Math.floor(Math.max(0, gameState.time) / 30)
  lastTime = Math.max(0, gameState.time)
  unsubscribe = onSimulationTick(tick)
  return stopProgressionRuntime
}

export function stopProgressionRuntime(): void {
  active = false
  unsubscribe?.()
  unsubscribe = undefined
  accumulator = 0
}

export function resetProgressionRuntime(): void {
  stopProgressionRuntime()
  resetProgress()
  syncProgressToWorld()
  lastKills = Math.max(0, Math.floor(gameState.kills))
  lastProgressLevel = gameState.level
  lastWaveMarker = Math.floor(Math.max(0, gameState.time) / 30)
  lastTime = Math.max(0, gameState.time)
}
