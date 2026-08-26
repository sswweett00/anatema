import { gameState } from '../ecs/world'
import { startLootRuntime, stopLootRuntime, resetLootRuntime } from './loot_runtime'
import { startArenaDirector, stopArenaDirector, resetArenaDirector } from './arena_director'
import { evaluateEvolutions, resetEvolutions } from './weapon_evolution'
import { startAchievements, stopAchievements, resetAchievements, tickAchievements } from './achievements'
import { startAudioDirector, stopAudioDirector, resetAudioDirector, tickAudioDirector } from './audio_director'

type Stop = () => void
let frame = 0
let running = false
let last = 0

export function startGameServices(): Stop {
  if (running || typeof window === 'undefined') return stopGameServices
  running = true
  const stops = [startLootRuntime(), startArenaDirector(), startAchievements(), startAudioDirector()]
  last = performance.now()
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
    last = now
    if (gameState.phase === 'playing') {
      evaluateEvolutions()
      tickAchievements(gameState.time, gameState.combo)
      tickAudioDirector(dt)
    }
    frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)
  return () => {
    stops.forEach((stop) => stop())
    stopGameServices()
  }
}

export function stopGameServices() {
  running = false
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  last = 0
  stopLootRuntime()
  stopArenaDirector()
  stopAchievements()
  stopAudioDirector()
}

export function resetGameServices() {
  resetLootRuntime()
  resetArenaDirector()
  resetEvolutions()
  resetAchievements()
  resetAudioDirector()
}
