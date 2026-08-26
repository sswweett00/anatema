import { abilities } from './abilities'
import { emitAbilityActivationSnapshot, validateAbilityActivation } from './ability_activation'
import { gameState } from '../ecs/world'

let running = false
let raf = 0
let last = 0
let accumulator = 0

function tick() {
  if (gameState.phase !== 'playing') return
  emitAbilityActivationSnapshot()
}

export function startAbilityActivationRuntime() {
  if (running || typeof window === 'undefined') return stopAbilityActivationRuntime
  const validation = validateAbilityActivation()
  if (!validation.valid) {
    console.error('[ANATHEMA] ability activation contract invalid', validation.errors)
  }

  running = true
  last = performance.now()
  accumulator = 0

  const loop = (now: number) => {
    if (!running) return
    accumulator += Math.min(0.1, (now - last) / 1000)
    last = now
    if (accumulator >= 0.25) {
      accumulator = 0
      tick()
    }
    raf = window.requestAnimationFrame(loop)
  }

  raf = window.requestAnimationFrame(loop)
  return stopAbilityActivationRuntime
}

export function stopAbilityActivationRuntime() {
  running = false
  if (raf) window.cancelAnimationFrame(raf)
  raf = 0
  last = 0
  accumulator = 0
}

export function resetAbilityActivationRuntime() {
  stopAbilityActivationRuntime()
  for (const id of Object.keys(abilities) as Array<keyof typeof abilities>) {
    if (!Number.isFinite(abilities[id]) || abilities[id] < 0) abilities[id] = 0
  }
}
