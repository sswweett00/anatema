import { abilities } from './abilities'
import { emitAbilityActivationSnapshot, validateAbilityActivation } from './ability_activation'
import { onSimulationTick } from './simulation_clock'
import { gameState } from '../ecs/world'

let running = false
let unsubscribe: (() => void) | undefined
let accumulator = 0
const SNAPSHOT_INTERVAL = 0.25

function tick(dt: number): void {
  if (gameState.phase !== 'playing') return
  accumulator += dt
  if (accumulator < SNAPSHOT_INTERVAL) return
  accumulator = 0
  emitAbilityActivationSnapshot()
}

export function startAbilityActivationRuntime() {
  if (running || typeof window === 'undefined') return stopAbilityActivationRuntime
  const validation = validateAbilityActivation()
  if (!validation.valid) console.error('[ANATHEMA] ability activation contract invalid', validation.errors)
  running = true
  accumulator = 0
  unsubscribe = onSimulationTick(tick)
  return stopAbilityActivationRuntime
}

export function stopAbilityActivationRuntime(): void {
  running = false
  unsubscribe?.()
  unsubscribe = undefined
  accumulator = 0
}

export function resetAbilityActivationRuntime(): void {
  stopAbilityActivationRuntime()
  for (const id of Object.keys(abilities) as Array<keyof typeof abilities>) {
    if (!Number.isFinite(abilities[id]) || abilities[id] < 0) abilities[id] = 0
  }
}
