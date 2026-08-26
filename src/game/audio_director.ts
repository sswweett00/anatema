import { events } from './events'
import { gameState } from '../ecs/world'
import { sfx } from './audio'

let disposers: Array<() => void> = []
let danger = 0
let lastComboTier = 0

export function startAudioDirector() {
  if (disposers.length) return stopAudioDirector
  disposers = [
    events.on('combat:execute', () => { sfx.crit() }),
    events.on('combat:reaction', () => { sfx.hit() }),
    events.on('boss:phase', () => { sfx.slash() }),
    events.on('relic:acquire', () => { sfx.start() }),
    events.on('ability:evolve', () => { sfx.start() }),
    events.on('arena:biome', () => { sfx.slash() }),
  ]
  return stopAudioDirector
}

export function stopAudioDirector() {
  for (const dispose of disposers.splice(0)) dispose()
}

export function resetAudioDirector() {
  danger = 0
  lastComboTier = 0
}

export function tickAudioDirector(dt: number) {
  const playerHealth = (window as Window & { __ANATEMA_PLAYER_HEALTH?: number }).__ANATEMA_PLAYER_HEALTH
  const maxHealth = (window as Window & { __ANATEMA_PLAYER_MAX_HEALTH?: number }).__ANATEMA_PLAYER_MAX_HEALTH ?? 100
  if (typeof playerHealth === 'number') {
    const healthDanger = 1 - Math.max(0, Math.min(1, playerHealth / Math.max(1, maxHealth)))
    danger += (healthDanger - danger) * Math.min(1, dt * 3)
  }
  const tier = gameState.combo >= 100 ? 5 : gameState.combo >= 60 ? 4 : gameState.combo >= 30 ? 3 : gameState.combo >= 20 ? 2 : gameState.combo >= 10 ? 1 : 0
  if (tier > lastComboTier && tier > 0) sfx.shoot()
  lastComboTier = tier
}

export function getAudioDanger(): number { return danger }
