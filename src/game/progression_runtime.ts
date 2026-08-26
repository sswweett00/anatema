import { gameState, enemies } from '../ecs/world'
import { addAscension, acquireBestAvailableRelic, addXp, bankMomentum, endWave, getProgress, nextWave, resetProgress } from './progression'
import { events } from './events'

type Stop = () => void

let active = false
let timer: number | undefined
let lastKills = 0
let lastLevel = 1
let lastWaveMarker = 0
let lastTime = 0

function tick(): void {
  if (!active || typeof window === 'undefined') return

  const kills = Math.max(0, gameState.kills)
  const killDelta = kills - lastKills
  if (killDelta > 0) {
    addXp(killDelta * (1 + Math.min(4, gameState.combo / 25)))
    bankMomentum(killDelta * (gameState.combo >= 30 ? 1.4 : 0.7))
    lastKills = kills
  } else if (kills < lastKills) {
    lastKills = kills
  }

  if (gameState.level > lastLevel) {
    for (let level = lastLevel + 1; level <= gameState.level; level++) {
      if (level % 5 === 0) acquireBestAvailableRelic()
      if (level > 20 && level % 10 === 0) addAscension()
    }
    lastLevel = gameState.level
  } else if (gameState.level < lastLevel) {
    lastLevel = gameState.level
  }

  const time = Math.max(0, gameState.time)
  const waveMarker = Math.floor(time / 30)
  if (waveMarker > lastWaveMarker) {
    if (lastWaveMarker > 0) endWave(time - lastTime)
    nextWave()
    lastWaveMarker = waveMarker
    lastTime = time
  }

  if (!Number.isFinite(time) || time < 0) lastTime = 0
  if (enemies.entities.length > 1400) {
    events.emit('runtime:error', { system: 'progression', message: 'Enemy cap exceeded; progression runtime observed overflow.' })
  }
}

export function startProgressionRuntime(): Stop {
  if (active || typeof window === 'undefined') return stopProgressionRuntime
  active = true
  const progress = getProgress()
  resetProgress(progress.seed)
  lastKills = gameState.kills
  lastLevel = gameState.level
  lastWaveMarker = Math.floor(gameState.time / 30)
  lastTime = gameState.time
  timer = window.setInterval(tick, 250)
  return stopProgressionRuntime
}

export function stopProgressionRuntime(): void {
  active = false
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
}

export function resetProgressionRuntime(): void {
  resetProgress()
  lastKills = gameState.kills
  lastLevel = gameState.level
  lastWaveMarker = Math.floor(gameState.time / 30)
  lastTime = gameState.time
}
