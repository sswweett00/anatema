import { gameState } from '../ecs/world'
import { captureRunCheckpoint, checksumCheckpoint, restoreRunCheckpoint, validateRunCheckpoint, type RunCheckpoint } from './run_checkpoint'
import { onSimulationTick } from './simulation_clock'

const STORAGE_KEY = 'anatema:last-checkpoint:v1'
const MAX_BYTES = 2_000_000
const INTERVAL_MS = 10_000
const SAVE_STEPS = Math.max(1, Math.round(INTERVAL_MS / (1000 / 60)))

let running = false
let restoreListener: ((event: Event) => void) | undefined
let unsubscribeSimulation: (() => void) | undefined
let saveStepAccumulator = 0

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function persist(): boolean {
  if (!storageAvailable()) return false
  if (gameState.phase !== 'playing' && gameState.phase !== 'dead') return false

  try {
    const checkpoint = captureRunCheckpoint()
    const serialized = JSON.stringify(checkpoint)
    if (serialized.length > MAX_BYTES) return false

    const checksum = checksumCheckpoint(checkpoint)
    window.localStorage.setItem(STORAGE_KEY, serialized)
    window.localStorage.setItem(`${STORAGE_KEY}:checksum`, checksum)
    return true
  } catch {
    return false
  }
}

export function loadPersistedCheckpoint(): RunCheckpoint | null {
  if (!storageAvailable()) return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const storedChecksum = window.localStorage.getItem(`${STORAGE_KEY}:checksum`)
    if (!raw || raw.length > MAX_BYTES || !storedChecksum) return null

    const parsed: unknown = JSON.parse(raw)
    if (!validateRunCheckpoint(parsed)) return null

    if (checksumCheckpoint(parsed) !== storedChecksum) {
      clearPersistedCheckpoint()
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function clearPersistedCheckpoint(): void {
  if (!storageAvailable()) return

  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(`${STORAGE_KEY}:checksum`)
  } catch {
    // Storage may be blocked by privacy mode; persistence is optional.
  }
}

export function startCheckpointPersistence(): () => void {
  if (running || typeof window === 'undefined') return stopCheckpointPersistence
  running = true
  saveStepAccumulator = 0

  restoreListener = (event: Event) => {
    const custom = event as CustomEvent<unknown>
    const payload = custom.detail
    if (!payload || typeof payload !== 'object') return

    const checkpoint = (payload as { checkpoint?: unknown }).checkpoint
    if (!checkpoint || !validateRunCheckpoint(checkpoint)) return

    const result = restoreRunCheckpoint(checkpoint)
    if (result.ok) saveStepAccumulator = 0
  }

  window.addEventListener('anatema:restore-checkpoint', restoreListener)
  unsubscribeSimulation = onSimulationTick((_, steps) => {
    if (!running) return
    saveStepAccumulator += steps
    if (saveStepAccumulator < SAVE_STEPS) return
    saveStepAccumulator %= SAVE_STEPS
    persist()
  })

  return stopCheckpointPersistence
}

export function stopCheckpointPersistence(): void {
  running = false
  unsubscribeSimulation?.()
  unsubscribeSimulation = undefined
  saveStepAccumulator = 0

  if (typeof window !== 'undefined' && restoreListener) {
    window.removeEventListener('anatema:restore-checkpoint', restoreListener)
  }
  restoreListener = undefined
}

export function resetCheckpointPersistence(): void {
  stopCheckpointPersistence()
}
