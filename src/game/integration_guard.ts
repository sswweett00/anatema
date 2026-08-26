import { events } from './events'
import { getSimulationTime } from './simulation_clock'
import { getMetaState } from './meta_progression'
import { currentBiome } from './biome_runtime'
import { abilities } from './abilities'
import { enemies, gameState, getPlayer, lootEntities } from '../ecs/world'

type GuardSnapshot = {
  simulationTime: number
  gameTime: number
  phase: string
  playerPresent: boolean
  enemyCount: number
  lootCount: number
  abilityCount: number
  biome: string
  metaSouls: number
}

let lastReport = -Infinity
let stop: (() => void) | undefined

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function validate(snapshot: GuardSnapshot): string[] {
  const errors: string[] = []
  if (!Number.isFinite(snapshot.simulationTime)) errors.push('simulation clock invalid')
  if (!Number.isFinite(snapshot.gameTime)) errors.push('game time invalid')
  if (snapshot.phase === 'playing' && !snapshot.playerPresent) errors.push('playing state has no player')
  if (snapshot.enemyCount > 1400) errors.push('enemy population cap exceeded')
  if (snapshot.abilityCount < 1) errors.push('ability catalog empty')
  if (!snapshot.biome) errors.push('biome unavailable')
  if (snapshot.metaSouls < 0) errors.push('meta currency negative')
  return errors
}

function report(): void {
  const meta = getMetaState()
  const snapshot: GuardSnapshot = {
    simulationTime: getSimulationTime(),
    gameTime: finite(gameState.time),
    phase: gameState.phase,
    playerPresent: Boolean(getPlayer()),
    enemyCount: enemies.entities.length,
    lootCount: lootEntities.entities.length,
    abilityCount: Object.keys(abilities).length,
    biome: currentBiome().id,
    metaSouls: Math.max(0, Math.floor(meta.souls)),
  }

  const errors = validate(snapshot)
  if (errors.length) {
    events.emit('runtime:error', {
      system: 'integration-guard',
      message: errors.join(' | '),
    })
  }
}

export function startIntegrationGuard(): () => void {
  if (stop) return stop
  stop = events.on('simulation:tick', ({ time }) => {
    if (time - lastReport < 2) return
    lastReport = time
    report()
  })
  return stopIntegrationGuard
}

export function stopIntegrationGuard(): void {
  stop?.()
  stop = undefined
}

export function resetIntegrationGuard(): void {
  stopIntegrationGuard()
  lastReport = -Infinity
}
