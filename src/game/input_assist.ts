import { getPlayer, gameState } from '../ecs/world'
import { events } from './events'

type InputState = {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  dashQueued: boolean
  dashAge: number
  attackQueued: boolean
}

const state: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  dashQueued: false,
  dashAge: 0,
  attackQueued: false,
}

const held = new Set<string>()
let initialized = false
let frame = 0
let last = 0

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])

function setKey(code: string, value: boolean): void {
  if (code === 'KeyA' || code === 'ArrowLeft') state.left = value
  if (code === 'KeyD' || code === 'ArrowRight') state.right = value
  if (code === 'KeyW' || code === 'ArrowUp') state.up = value
  if (code === 'KeyS' || code === 'ArrowDown') state.down = value
}

function onKeyDown(event: KeyboardEvent): void {
  held.add(event.code)
  setKey(event.code, true)
  if (event.code === 'Space') state.dashQueued = true
  if (event.code === 'Enter') state.attackQueued = true
  if (MOVEMENT_KEYS.has(event.code)) event.preventDefault()
}

function onKeyUp(event: KeyboardEvent): void {
  held.delete(event.code)
  setKey(event.code, false)
}

export function startInputAssist(): () => void {
  if (initialized || typeof window === 'undefined') return stopInputAssist
  initialized = true
  window.addEventListener('keydown', onKeyDown, { passive: false })
  window.addEventListener('keyup', onKeyUp)
  last = performance.now()
  frame = window.requestAnimationFrame(loop)
  return stopInputAssist
}

function loop(now: number): void {
  if (!initialized) return
  const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000))
  last = now
  assistPlayerIntent(dt)
  state.dashAge = state.dashQueued ? Math.min(0.18, state.dashAge + dt) : 0
  if (state.dashAge >= 0.18) state.dashQueued = false
  frame = window.requestAnimationFrame(loop)
}

export function stopInputAssist(): void {
  if (!initialized || typeof window === 'undefined') return
  initialized = false
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
  held.clear()
  state.left = state.right = state.up = state.down = false
  state.dashQueued = state.attackQueued = false
  state.dashAge = 0
}

export function resetInputAssist(): void {
  state.dashQueued = false
  state.attackQueued = false
  state.dashAge = 0
}

export function sampleMovement(): { x: number; z: number } {
  const x = Number(state.right) - Number(state.left)
  const z = Number(state.down) - Number(state.up)
  const length = Math.hypot(x, z)
  return length > 0 ? { x: x / length, z: z / length } : { x: 0, z: 0 }
}

export function consumeDash(): boolean {
  if (!state.dashQueued || gameState.phase !== 'playing') return false
  state.dashQueued = false
  state.dashAge = 0
  events.emit('player:dodge', { perfect: false })
  return true
}

export function consumeAttack(): boolean {
  if (!state.attackQueued || gameState.phase !== 'playing') return false
  state.attackQueued = false
  return true
}

export function inputState(): Readonly<InputState> {
  return state
}

export function assistPlayerIntent(dt: number): void {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return
  const move = sampleMovement()
  const smoothing = 1 - Math.exp(-dt * 14)
  player.velocity.x += (move.x * player.speed - player.velocity.x) * smoothing
  player.velocity.z += (move.z * player.speed - player.velocity.z) * smoothing
  if (consumeDash()) {
    player.dashTime = 0.16
    player.dashCooldown = Math.max(0, player.dashCooldown ?? 0)
    player.invuln = Math.max(player.invuln ?? 0, 0.22)
  }
}
