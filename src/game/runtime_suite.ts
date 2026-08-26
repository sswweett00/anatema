import { resetRunDirector, startRunDirector } from './mechanics'
import { resetAdvancedRuntime, startAdvancedRuntime } from './advanced_runtime'
import { resetMegaSystemsV2, startMegaSystemsV2 } from './mega_systems_v2'
import { resetMegaCompletion, startMegaCompletion } from './mega_completion'
import { resetCombatPolish, startCombatPolish } from './combat_polish'
import { resetProgressionRuntime, startProgressionRuntime } from './progression_runtime'
import { resetRuntimeSafety, startRuntimeSafety } from './runtime_safety'
import { resetEventBridge, startEventBridge } from './event_bridge'
import { resetStatusRuntime, startStatusRuntime } from './status_runtime'
import { resetBossAI, startBossAI } from './boss_ai'
import { resetInvariantRuntime, startInvariantRuntime } from './invariant_runtime'
import { resetVfxEventRuntime, startVfxEventRuntime } from './vfx_event_runtime'
import { resetWaveDirector, startWaveDirector } from './wave_director'

type Stop = () => void
type RuntimeSpec = { name: string; start: () => Stop; reset: () => void }

const RUNTIMES: RuntimeSpec[] = [
  { name: 'event-bridge', start: startEventBridge, reset: resetEventBridge },
  { name: 'run-director', start: startRunDirector, reset: resetRunDirector },
  { name: 'wave-director', start: startWaveDirector, reset: resetWaveDirector },
  { name: 'advanced-combat', start: startAdvancedRuntime, reset: resetAdvancedRuntime },
  { name: 'mega-systems', start: startMegaSystemsV2, reset: resetMegaSystemsV2 },
  { name: 'mega-completion', start: startMegaCompletion, reset: resetMegaCompletion },
  { name: 'combat-polish', start: startCombatPolish, reset: resetCombatPolish },
  { name: 'status-effects', start: startStatusRuntime, reset: resetStatusRuntime },
  { name: 'boss-ai', start: startBossAI, reset: resetBossAI },
  { name: 'progression', start: startProgressionRuntime, reset: resetProgressionRuntime },
  { name: 'vfx-events', start: startVfxEventRuntime, reset: resetVfxEventRuntime },
  { name: 'runtime-safety', start: startRuntimeSafety, reset: resetRuntimeSafety },
  { name: 'invariants', start: startInvariantRuntime, reset: resetInvariantRuntime },
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
  for (let i = RUNTIMES.length - 1; i >= 0; i--) {
    try {
      RUNTIMES[i].reset()
    } catch (error) {
      report(`${RUNTIMES[i].name}:reset`, error)
    }
  }
}

export function runtimeSuiteStatus(): { mounted: boolean; runtimes: string[] } {
  return { mounted, runtimes: RUNTIMES.map(({ name }) => name) }
}
