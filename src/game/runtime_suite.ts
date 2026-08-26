import { resetRunDirector, startRunDirector } from './mechanics'
import { resetCombatPolish, startCombatPolish } from './combat_polish'
import { resetProgressionRuntime, startProgressionRuntime } from './progression_runtime'
import { resetRuntimeSafety, startRuntimeSafety } from './runtime_safety'
import { resetEventBridge, startEventBridge } from './event_bridge'
import { resetStatusRuntime, startStatusRuntime } from './status_runtime'
import { resetBossAI, startBossAI } from './boss_ai'
import { resetInvariantRuntime, startInvariantRuntime } from './invariant_runtime'
import { resetVfxEventRuntime, startVfxEventRuntime } from './vfx_event_runtime'
import { resetWaveDirector, startWaveDirector } from './wave_director'
import { resetInputAssist, startInputAssist } from './input_assist'
import { resetPerformanceGovernor } from './performance_governor'
import { resetGameServices, startGameServices } from './game_services'
import { resetMotionRuntime, startMotionRuntime } from './motion_runtime'
import { resetExpandedAbilityRuntime, startExpandedAbilityRuntime } from './expanded_ability_runtime'
import { resetSystemIntegrity, startSystemIntegrity } from './system_integrity'
import { resetAbilityActivationRuntime, startAbilityActivationRuntime } from './ability_activation_runtime'
import { resetAbilityPassiveCompletion, startAbilityPassiveCompletion } from './ability_passive_completion'
import { resetQualityRuntime, startQualityRuntime } from './quality_runtime'
import { resetRunCheckpoint, startRunCheckpoint } from './run_checkpoint'
import { resetCheckpointPersistence, startCheckpointPersistence } from './checkpoint_persistence'
import { resetEnemyBehaviorRuntime, startEnemyBehaviorRuntime } from './enemy_behavior_runtime'
import { resetSimulationClock, startSimulationClock } from './simulation_clock'
import { resetBiomeRuntime, startBiomeRuntime } from './biome_runtime'
import { resetEnemyArchetypeRuntime, startEnemyArchetypeRuntime } from './enemy_archetype_runtime'
import { resetRelicEffectRuntime, startRelicEffectRuntime } from './relic_effect_runtime'
import { resetMetaProgression, startMetaProgression } from './meta_progression'
import { resetIntegrationGuard, startIntegrationGuard } from './integration_guard'
import { resetAbilityIntegrityGuard, startAbilityIntegrityGuard } from './ability_integrity_guard'
import { resetAdvancedMechanicsV3, startAdvancedMechanicsV3 } from './advanced_mechanics_v3'
import { resetAdvancedMechanicsV3Extensions, startAdvancedMechanicsV3Extensions } from './advanced_mechanics_v3_extensions'
import { resetAdvancedMechanicsV3Refinements, startAdvancedMechanicsV3Refinements } from './advanced_mechanics_v3_refinements'
import { resetSkillMasteryRuntimeV3, startSkillMasteryRuntimeV3 } from './skill_mastery_runtime_v3'
import { resetCombatDirectorV3, startCombatDirectorV3 } from './combat_director_v3'
import { validateContentContract } from './content_contract'

type Stop = () => void
type RuntimeSpec = { name: string; start: () => Stop; reset: () => void }

const RUNTIMES: RuntimeSpec[] = [
  { name: 'simulation-clock', start: startSimulationClock, reset: resetSimulationClock },
  { name: 'content-contract', start: () => { validateContentContract(); return () => undefined }, reset: () => undefined },
  { name: 'meta-progression', start: startMetaProgression, reset: resetMetaProgression },
  { name: 'integration-guard', start: startIntegrationGuard, reset: resetIntegrationGuard },
  { name: 'ability-integrity', start: startAbilityIntegrityGuard, reset: resetAbilityIntegrityGuard },
  { name: 'advanced-mechanics-v3', start: startAdvancedMechanicsV3, reset: resetAdvancedMechanicsV3 },
  { name: 'advanced-mechanics-v3-extensions', start: startAdvancedMechanicsV3Extensions, reset: resetAdvancedMechanicsV3Extensions },
  { name: 'advanced-mechanics-v3-refinements', start: startAdvancedMechanicsV3Refinements, reset: resetAdvancedMechanicsV3Refinements },
  { name: 'skill-mastery-v3', start: startSkillMasteryRuntimeV3, reset: resetSkillMasteryRuntimeV3 },
  { name: 'combat-director-v3', start: startCombatDirectorV3, reset: resetCombatDirectorV3 },
  { name: 'event-bridge', start: startEventBridge, reset: resetEventBridge },
  { name: 'input-assist', start: startInputAssist, reset: resetInputAssist },
  { name: 'motion', start: startMotionRuntime, reset: resetMotionRuntime },
  { name: 'run-director', start: startRunDirector, reset: resetRunDirector },
  { name: 'wave-director', start: startWaveDirector, reset: resetWaveDirector },
  { name: 'combat-polish', start: startCombatPolish, reset: resetCombatPolish },
  { name: 'expanded-abilities', start: startExpandedAbilityRuntime, reset: resetExpandedAbilityRuntime },
  { name: 'ability-activation', start: startAbilityActivationRuntime, reset: resetAbilityActivationRuntime },
  { name: 'ability-passive-completion', start: startAbilityPassiveCompletion, reset: resetAbilityPassiveCompletion },
  { name: 'status-effects', start: startStatusRuntime, reset: resetStatusRuntime },
  { name: 'boss-ai', start: startBossAI, reset: resetBossAI },
  { name: 'enemy-behavior', start: startEnemyBehaviorRuntime, reset: resetEnemyBehaviorRuntime },
  { name: 'enemy-archetypes', start: startEnemyArchetypeRuntime, reset: resetEnemyArchetypeRuntime },
  { name: 'biomes', start: startBiomeRuntime, reset: resetBiomeRuntime },
  { name: 'relic-effects', start: startRelicEffectRuntime, reset: resetRelicEffectRuntime },
  { name: 'progression', start: startProgressionRuntime, reset: resetProgressionRuntime },
  { name: 'vfx-events', start: startVfxEventRuntime, reset: resetVfxEventRuntime },
  { name: 'world-services', start: startGameServices, reset: resetGameServices },
  { name: 'runtime-safety', start: startRuntimeSafety, reset: resetRuntimeSafety },
  { name: 'invariants', start: startInvariantRuntime, reset: resetInvariantRuntime },
  { name: 'system-integrity', start: startSystemIntegrity, reset: resetSystemIntegrity },
  { name: 'quality-core', start: startQualityRuntime, reset: resetQualityRuntime },
  { name: 'run-checkpoint', start: startRunCheckpoint, reset: resetRunCheckpoint },
  { name: 'checkpoint-persistence', start: startCheckpointPersistence, reset: resetCheckpointPersistence },
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
        try { stop() } catch (error) { report(`${runtime.name}:stop`, error) }
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
    try { stops[i]() } catch (error) { report('suite:stop', error) }
  }
  stops = []
}

export function resetRuntimeSuite(): void {
  resetPerformanceGovernor()
  for (let i = RUNTIMES.length - 1; i >= 0; i--) {
    try { RUNTIMES[i].reset() } catch (error) { report(`${RUNTIMES[i].name}:reset`, error) }
  }
}

export function runtimeSuiteStatus(): { mounted: boolean; runtimes: string[] } {
  return { mounted, runtimes: RUNTIMES.map(({ name }) => name) }
}
