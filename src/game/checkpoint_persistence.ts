import { captureRunCheckpoint, getRunCheckpointChecksum, restoreRunCheckpoint, validateRunCheckpoint, type RunCheckpoint } from './run_checkpoint'

const STORAGE_KEY = 'anatema:last-checkpoint:v1'
const MAX_BYTES = 2_000_000
const INTERVAL_MS = 10_000

let running = false
let timer: number | undefined
let listener: ((event: Event) => void) | undefined

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function persist(): boolean {
  if (!storageAvailable()) return false
  try {
    const checkpoint = captureRunCheckpoint()
    const serialized = JSON.stringify(checkpoint)
    if (serialized.length > MAX_BYTES) return false
    window.localStorage.setItem(STORAGE_KEY, serialized)
    window.localStorage.setItem(`${STORAGE_KEY}:checksum`, getRunCheckpointChecksum())
    return true
  } catch {
    return false
  }
}

export function loadPersistedCheckpoint(): RunCheckpoint | null {
  if (!storageAvailable()) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw || raw.length > MAX_BYTES) return null
    const parsed: unknown = JSON.parse(raw)
    return validateRunCheckpoint(parsed) ? parsed : null
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

  listener = (event: Event) => {
    const custom = event as CustomEvent<unknown>
    const payload = custom.detail
    if (!payload || typeof payload !== 'object') return
    if (typeof (payload as { checkpoint?: unknown }).checkpoint !== 'object') return
    const checkpoint = (payload as { checkpoint: unknown }).checkpoint
    if (validateRunCheckpoint(checkpoint)) restoreRunCheckpoint(checkpoint)
  }

  window.addEventListener('anatema:restore-checkpoint', listener)
  persist()
  timer = window.setInterval(persist, INTERVAL_MS)

  return stopCheckpointPersistence
}

export function stopCheckpointPersistence(): void {
  running = false
  if (typeof window !== 'undefined' && listener) {
    window.removeEventListener('anatema:restore-checkpoint', listener)
  }
  listener = undefined
  if (typeof window !== 'undefined' && timer !== undefined) window.clearInterval(timer)
  timer = undefined
}

export function resetCheckpointPersistence(): void {
  stopCheckpointPersistence()
}
