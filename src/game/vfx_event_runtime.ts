import { announce, gameState, getPlayer, spawnBurst } from '../ecs/world'
import { events } from './events'

let unsubscribers: Array<() => void> = []

export function startVfxEventRuntime() {
  if (unsubscribers.length) return stopVfxEventRuntime

  unsubscribers = [
    events.on('combat:execute', ({ damage }) => {
      announce(`İNFaz  ${Math.floor(damage).toLocaleString('tr-TR')}`, 0.9)
      const player = getPlayer()
      if (player) {
        gameState.shake = Math.min(1, gameState.shake + 0.16)
        spawnBurst(player.position, 0xffd27a, 12, 4.2, 0.5)
      }
    }),
    events.on('combat:reaction', ({ reaction, power }) => {
      announce(`${reaction.toUpperCase()}  ×${power.toFixed(1)}`, 0.75)
      const player = getPlayer()
      if (player) spawnBurst(player.position, 0xa9d9ff, 8, 3.1, 0.35)
    }),
    events.on('player:level', ({ level }) => {
      announce(`SEVİYE ${level}`, 1.15)
      gameState.levelFlash = 1
      gameState.shake = Math.min(1, gameState.shake + 0.08)
    }),
    events.on('relic:acquire', ({ relicId }) => {
      announce(`KALINTI  ${relicId.replaceAll('_', ' ').toUpperCase()}`, 1.2)
      const player = getPlayer()
      if (player) spawnBurst(player.position, 0xffd58a, 14, 3.8, 0.7)
    }),
    events.on('boss:phase', ({ phase }) => {
      announce(`BOSS FAZI ${phase}`, 1.1)
      gameState.shake = Math.min(1, gameState.shake + 0.22)
    }),
    events.on('run:ascend', ({ tier }) => {
      announce(`ASCENSION ${tier}`, 1.4)
      gameState.shake = Math.min(1, gameState.shake + 0.14)
    }),
  ]

  return stopVfxEventRuntime
}

export function stopVfxEventRuntime() {
  for (const unsubscribe of unsubscribers) unsubscribe()
  unsubscribers = []
}

export function resetVfxEventRuntime() {
  stopVfxEventRuntime()
}
