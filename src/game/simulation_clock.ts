import { events } from './events'

type ClockListener = (dt: number, time: number) => void

const listeners = new Set<ClockListener>()
let running = false
let frame = 0
let last = 0
let accumulator = 0
let simulationTime = 0

const STEP = 1 / 60
const MAX_FRAME = 0.1
const MAX_STEPS = 6

function reportListenerFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  events.emit('runtime:error', {
    system: 'simulation-clock',
    message: `simulation listener failed: ${message}`,
  })
}

function loop(nowMs: number): void {
  if (!running) return
  const now = nowMs / 1000
  const raw = last === 0 ? 0 : now - last
  last = now
  accumulator = Math.min(MAX_FRAME, Math.max(0, accumulator + Math.min(MAX_FRAME, raw)))

  let steps = 0
  while (accumulator >= STEP && steps < MAX_STEPS) {
    simulationTime += STEP
    accumulator -= STEP

    for (const listener of [...listeners]) {
      try {
        listener(STEP, simulationTime)
      } catch (error) {
        reportListenerFailure(error)
      }
    }

    steps++
  }

  if (steps > 0) events.emit('simulation:tick', { dt: STEP * steps, time: simulationTime, steps })
  frame = window.requestAnimationFrame(loop)
}

export function onSimulationTick(listener: ClockListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function startSimulationClock(): () => void {
  if (running || typeof window === 'undefined') return stopSimulationClock
  running = true
  last = 0
  accumulator = 0
  frame = window.requestAnimationFrame(loop)
  return stopSimulationClock
}

export function stopSimulationClock(): void {
  running = false
  if (typeof window !== 'undefined' && frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
  accumulator = 0
}

export function resetSimulationClock(): void {
  stopSimulationClock()
  simulationTime = 0
}

export function getSimulationTime(): number {
  return simulationTime
}
