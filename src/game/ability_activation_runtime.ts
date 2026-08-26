import { abilities } from './abilities'
import { emitAbilityActivationSnapshot, resetAbilityActivationSnapshot, validateAbilityActivation } from './ability_activation'
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
  accumulator -= SNAPSHOT_INTERVAL
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
  const wasRunning = running
  if (wasRunning) stopAbilityActivationRuntime()

  resetAbilityActivationSnapshot()

  for (const id of Object.keys(abilities) as Array<keyof typeof abilities>) {
    const level = abilities[id]
    abilities[id] = Number.isFinite(level) && level > 0 ? Math.min(999, level) : 0
  }

  if (wasRunning) startAbilityActivationRuntime()
}
