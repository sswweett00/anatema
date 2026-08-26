import { abilities, type AbilityId } from './abilities'
import { events } from './events'
import { gameState, getPlayer, type Entity } from '../ecs/world'
import { onSimulationTick } from './simulation_clock'

let running = false
let unsubscribe: (() => void) | undefined
let accumulator = 0
const CHECK_INTERVAL = 0.5
const MAX_ABILITY_LEVEL = 999

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function sanitizeEntity(entity: Entity): void {
  entity.health = Math.max(0, finite(entity.health, 0))
  entity.maxHealth = Math.max(1, finite(entity.maxHealth, 1))
  if (entity.health > entity.maxHealth) entity.health = entity.maxHealth

  entity.velocity.x = finite(entity.velocity.x, 0)
  entity.velocity.y = finite(entity.velocity.y, 0)
  entity.velocity.z = finite(entity.velocity.z, 0)
  entity.poise = Math.max(0, finite(entity.poise, 0))
  entity.maxPoise = Math.max(0, finite(entity.maxPoise, 0))
  if (entity.poise > entity.maxPoise) entity.poise = entity.maxPoise
}

function check(): void {
  let repairedAbilities = 0
  for (const id of Object.keys(abilities) as AbilityId[]) {
    const value = abilities[id]
    const safe = finite(value, 0)
    const clamped = Math.min(MAX_ABILITY_LEVEL, Math.max(0, Math.floor(safe)))
    if (clamped !== value) {
      abilities[id] = clamped
      repairedAbilities++
    }
  }

  const player = getPlayer()
  if (player) sanitizeEntity(player)

  let repairedGameState = 0
  if (!Number.isFinite(gameState.time) || gameState.time < 0) {
    gameState.time = 0
    repairedGameState++
  }
  if (!Number.isFinite(gameState.combo) || gameState.combo < 0) {
    gameState.combo = 0
    repairedGameState++
  }
  if (!Number.isFinite(gameState.kills) || gameState.kills < 0) {
    gameState.kills = 0
    repairedGameState++
  }
  if (!Number.isFinite(gameState.level) || gameState.level < 1) {
    gameState.level = 1
    repairedGameState++
  }

  if (repairedAbilities || repairedGameState) {
    events.emit('runtime:warning', {
      system: 'ability-integrity-guard',
      message: `repaired abilities=${repairedAbilities}, gameState=${repairedGameState}`,
    })
  }
}

function tick(dt: number): void {
  if (!running) return
  accumulator += dt
  if (accumulator < CHECK_INTERVAL) return
  accumulator -= CHECK_INTERVAL
  check()
}

export function startAbilityIntegrityGuard() {
  if (running || typeof window === 'undefined') return stopAbilityIntegrityGuard
  running = true
  accumulator = 0
  check()
  unsubscribe = onSimulationTick(tick)
  return stopAbilityIntegrityGuard
}

export function stopAbilityIntegrityGuard(): void {
  running = false
  unsubscribe?.()
  unsubscribe = undefined
  accumulator = 0
}

export function resetAbilityIntegrityGuard(): void {
  accumulator = 0
}
