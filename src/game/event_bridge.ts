import { enemies, gameState, getPlayer } from '../ecs/world'
import { events } from './events'

type Stop = () => void

let active = false
let timer: number | undefined
let lastKills = 0
let lastHealth = 100
let lastLevel = 1
let lastPhase = gameState.phase
let lastEnemyCount = 0

function tick(): void {
  if (!active || typeof window === 'undefined') return

  if (gameState.kills > lastKills) {
    const count = gameState.kills - lastKills
    for (let i = 0; i < Math.min(count, 8); i++) {
      events.emit('combat:kill', {
        damage: 0,
        element: 'physical',
        overkill: 0,
        elite: false,
        boss: false,
      })
    }
    lastKills = gameState.kills
  } else if (gameState.kills < lastKills) {
    lastKills = gameState.kills
  }

  if (gameState.level !== lastLevel) {
    if (gameState.level > lastLevel) {
      for (let level = lastLevel + 1; level <= gameState.level; level++) {
        events.emit('player:level', { level })
      }
    }
    lastLevel = gameState.level
  }

  const player = getPlayer()
  if (player) {
    const health = Math.max(0, player.health)
    if (health < lastHealth) events.emit('player:damage', { amount: lastHealth - health })
    if (health > lastHealth) events.emit('player:heal', { amount: health - lastHealth })
    lastHealth = health
  }

  if (gameState.phase !== lastPhase) lastPhase = gameState.phase

  const enemyCount = enemies.entities.length
  if (Math.abs(enemyCount - lastEnemyCount) > 20) {
    lastEnemyCount = enemyCount
  }
}

export function startEventBridge(): Stop {
  if (active || typeof window === 'undefined') return stopEventBridge
  active = true
  const player = getPlayer()
  lastHealth = player?.health ?? 100
  lastKills = gameState.kills
  lastLevel = gameState.level
  lastPhase = gameState.phase
  lastEnemyCount = enemies.entities.length
  timer = window.setInterval(tick, 100)
  return stopEventBridge
}

export function stopEventBridge(): void {
  active = false
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
}

export function resetEventBridge(): void {
  lastKills = gameState.kills
  lastLevel = gameState.level
  lastHealth = getPlayer()?.health ?? 100
  lastPhase = gameState.phase
  lastEnemyCount = enemies.entities.length
}
