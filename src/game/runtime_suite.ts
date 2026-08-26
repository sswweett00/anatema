import { resetRunDirector, startRunDirector } from './mechanics'
import { resetAdvancedRuntime, startAdvancedRuntime } from './advanced_runtime'
import { resetMegaSystemsV2, startMegaSystemsV2 } from './mega_systems_v2'
import { resetMegaCompletion, startMegaCompletion } from './mega_completion'
import { resetCombatPolish, startCombatPolish } from './combat_polish'
import { resetRuntimeSafety, startRuntimeSafety } from './runtime_safety'

type Stop = () => void

type RuntimeSpec = {
  name: string
  start: () => Stop
  reset: () => void
}

const RUNTIMES: RuntimeSpec[] = [
  { name: 'run-director', start: startRunDirector, reset: resetRunDirector },
  { name: 'advanced-combat', start: startAdvancedRuntime, reset: resetAdvancedRuntime },
  { name: 'mega-systems', start: startMegaSystemsV2, reset: resetMegaSystemsV2 },
  { name: 'mega-completion', start: startMegaCompletion, reset: resetMegaCompletion },
  { name: 'combat-polish', start: startCombatPolish, reset: resetCombatPolish },
  { name: 'runtime-safety', start: startRuntimeSafety, reset: resetRuntimeSafety },
]

let mounted = false
let stops: Stop[] = []

function report(name: string, error: unknown): void {
  console.error(`[ANATHEMA] runtime '${name}' devre dışı bırakıldı`, error)
}

export function startRuntimeSuite(): Stop {
  if (mounted) return stopRuntimeSuite
  mounted = true
  stops = []

  for (const runtime of RUNTIMES) {
    try {
      const stop = runtime.start()
      stops.push(() => {
        try {
          stop()
        } catch (error) {
          report(`${runtime.name}:stop`, error)
        }
      })
    } catch (error) {
      report(runtime.name, error)
    }
  }

  return stopRuntimeSuite
}

export function stopRuntimeSuite(): void {
  if (!mounted) return
  mounted = false

  for (let i = stops.length - 1; i >= 0; i--) {
    try {
      stops[i]()
    } catch (error) {
      report('suite:stop', error)
    }
  }
  stops = []
}

export function resetRuntimeSuite(): void {
  for (const runtime of RUNTIMES) {
    try {
      runtime.reset()
    } catch (error) {
      report(`${runtime.name}:reset`, error)
    }
  }
}

export function runtimeSuiteStatus(): { mounted: boolean; runtimes: string[] } {
  return {
    mounted,
    runtimes: RUNTIMES.map(({ name }) => name),
  }
}
