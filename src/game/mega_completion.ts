/**
 * Legacy compatibility shim.
 * All 33 mechanics now live exclusively in mega_systems_v2.ts.
 * Keeping these exports preserves the existing App wiring without
 * allowing a second combat runtime to double-apply effects.
 */
let running = false

export function startMegaCompletion() {
  running = true
  return stopMegaCompletion
}

export function stopMegaCompletion() {
  running = false
}

export function resetMegaCompletion() {
  running = false
}
