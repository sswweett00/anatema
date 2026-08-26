import { enemies, gameState, type Entity } from '../ecs/world'
import { events, type DamageElement } from './events'
import { resolveDamage } from './combat_math'

type StatusKind = 'burn' | 'poison' | 'shock' | 'bleed' | 'freeze' | 'armor_break'

type StatusState = {
  stacks: number
  remaining: number
  tick: number
  source: DamageElement
  intensity: number
}

const states = new WeakMap<Entity, Map<StatusKind, StatusState>>()
const TICK_INTERVAL: Record<StatusKind, number> = {
  burn: 0.45,
  poison: 0.6,
  shock: 0.8,
  bleed: 0.5,
  freeze: 0.3,
  armor_break: 0.5,
}

const DURATIONS: Record<StatusKind, number> = {
  burn: 3.2,
  poison: 4.5,
  shock: 2.5,
  bleed: 3.8,
  freeze: 1.4,
  armor_break: 3.4,
}

function mapFor(entity: Entity): Map<StatusKind, StatusState> {
  let map = states.get(entity)
  if (!map) {
    map = new Map()
    states.set(entity, map)
  }
  return map
}

export function applyStatus(entity: Entity, kind: StatusKind, intensity: number, source: DamageElement = 'physical'): void {
  if (entity.dead) return
  const map = mapFor(entity)
  const previous = map.get(kind)
  const maxStacks = kind === 'freeze' ? 1 : kind === 'armor_break' ? 3 : 8
  const stacks = Math.min(maxStacks, (previous?.stacks ?? 0) + Math.max(1, Math.round(intensity)))
  const remaining = Math.min(DURATIONS[kind] * 1.5, (previous?.remaining ?? 0) + DURATIONS[kind] * 0.35)
  map.set(kind, {
    stacks,
    remaining,
    tick: Math.min(previous?.tick ?? TICK_INTERVAL[kind], TICK_INTERVAL[kind]),
    source,
    intensity: Math.max(previous?.intensity ?? 0, intensity),
  })
  events.emit('combat:status', { status: kind, duration: remaining, stacks })
}

export function clearStatuses(entity: Entity): void {
  states.delete(entity)
}

function processStatus(entity: Entity, kind: StatusKind, state: StatusState, dt: number): void {
  state.remaining -= dt
  state.tick -= dt

  if (kind === 'freeze') {
    entity.slow = Math.max(entity.slow ?? 0, 0.42 + state.stacks * 0.08)
    entity.hitFlash = Math.max(entity.hitFlash ?? 0, 0.08)
  } else if (kind === 'armor_break') {
    entity.armor = Math.max(0, entity.armor - state.stacks * 0.6 * dt)
  } else if (state.tick <= 0) {
    state.tick += TICK_INTERVAL[kind]
    const base = Math.max(1, entity.maxHealth) * (kind === 'poison' ? 0.012 : kind === 'bleed' ? 0.016 : 0.009)
    const result = resolveDamage({
      base: base * state.stacks * Math.max(0.2, state.intensity),
      element: state.source,
      armor: entity.armor,
      critical: false,
      critMultiplier: 1,
      armorPenetration: kind === 'bleed' ? 0.15 : 0,
      flatBonus: 0,
      multiplier: 1,
      overdrive: 0,
    })
    entity.health = Math.max(0, entity.health - result.final)
    entity.lastDmg = result.final
    entity.lastCrit = false
    events.emit('combat:hit', { damage: result.final, element: state.source, critical: false })
    if (entity.health <= 0) entity.dead = true
  }

  if (state.remaining <= 0) {
    const map = states.get(entity)
    map?.delete(kind)
    if (kind === 'freeze') entity.slow = 0
  }
}

function tick(dt: number): void {
  if (gameState.phase !== 'playing') return
  for (const entity of enemies.entities) {
    const map = states.get(entity)
    if (!map) continue
    for (const [kind, state] of map) {
      processStatus(entity, kind, state, dt)
    }
    if (entity.dead) states.delete(entity)
  }
}

let running = false
let frame = 0
let last = 0

export function startStatusRuntime() {
  if (running || typeof window === 'undefined') return stopStatusRuntime
  running = true
  last = performance.now()
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000))
    last = now
    tick(dt)
    frame = window.requestAnimationFrame(loop)
  }
  frame = window.requestAnimationFrame(loop)
  return stopStatusRuntime
}

export function stopStatusRuntime() {
  running = false
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
}

export function resetStatusRuntime() {
  for (const entity of enemies.entities) states.delete(entity)
}
