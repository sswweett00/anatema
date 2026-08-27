import { abilities } from './abilities'
import { events } from './events'
import { onSimulationTick } from './simulation_clock'
import { gameState, getPlayer, spawnBurst, type Entity } from '../ecs/world'

type Stop = () => void

const state = {
  running: false,
  unsubscribe: undefined as Stop | undefined,
  revenge: 0,
  elapsedSinceHit: 0,
  lastHitHp: 100,
  lastCombo: 0,
  frenzyAnnouncementAt: -Infinity,
}

function finite(value: number | undefined | null, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function playerSpeedMultiplier(player: Entity): number {
  const hp = clamp(finite(player.health) / Math.max(1, finite(player.maxHealth, 1)), 0, 1)
  const lowHp = hp < 0.28
    ? 1 + Math.min(0.4, (0.28 - hp) * 2.2) + Math.min(0.3, gameState.combo * 0.004)
    : 1
  const revenge = state.revenge > 0 ? 1.12 + abilities.rage * 0.01 : 1
  return lowHp * revenge
}

function tick(dt: number): void {
  if (gameState.phase !== 'playing') return
  const player = getPlayer()
  if (!player) return

  state.elapsedSinceHit += dt
  const hp = finite(player.health, 0)
  if (hp < state.lastHitHp - 0.1) {
    state.revenge = 2.4
    state.elapsedSinceHit = 0
  }
  state.lastHitHp = hp
  state.revenge = Math.max(0, state.revenge - dt)

  const hpRatio = clamp(hp / Math.max(1, finite(player.maxHealth, 1)), 0, 1)
  if (hpRatio < 0.28 && gameState.time - state.frenzyAnnouncementAt > 2.5) {
    state.frenzyAnnouncementAt = gameState.time
    gameState.shake = Math.min(1, gameState.shake + 0.06)
    spawnBurst(player.position, 0xff6955, 6, 2.6, 0.24)
    events.emit('run:mutator', { mutator: 'near-death-frenzy', level: Math.max(1, Math.ceil((0.28 - hpRatio) * 10)), active: true })
  }

  const speedMultiplier = playerSpeedMultiplier(player)
  if (speedMultiplier > 1) {
    player.velocity.multiplyScalar(Math.min(1.32, 1 + (speedMultiplier - 1) * dt * 6))
  }

  if (gameState.combo >= 25 && gameState.comboTimer > 0) {
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + dt * (0.014 + abilities.adrenaline * 0.001))
  }

  if (gameState.combo <= 0 && state.lastCombo > 0) {
    events.emit('run:mutator', { mutator: 'near-death-frenzy', level: 0, active: false })
  }
  state.lastCombo = gameState.combo

  if (state.elapsedSinceHit >= 26 && player.lastStandUsed) {
    player.lastStandUsed = false
    gameState.announceText = 'SON DİRENİŞ YENİDEN HAZIR'
    gameState.announceUntil = gameState.time + 1.5
  }
}

export function startAdvancedMechanicsV3Refinements(): Stop {
  if (state.running || typeof window === 'undefined') return stopAdvancedMechanicsV3Refinements
  state.running = true
  state.revenge = 0
  state.elapsedSinceHit = 0
  state.lastHitHp = finite(getPlayer()?.health, 100)
  state.lastCombo = gameState.combo
  state.frenzyAnnouncementAt = -Infinity
  state.unsubscribe = onSimulationTick((dt) => {
    try {
      tick(clamp(dt, 0, 0.1))
    } catch (error) {
      events.emit('runtime:error', { system: 'advanced-mechanics-v3-refinements', message: String(error) })
    }
  })
  return stopAdvancedMechanicsV3Refinements
}

export function stopAdvancedMechanicsV3Refinements(): void {
  if (!state.running) return
  state.running = false
  state.unsubscribe?.()
  state.unsubscribe = undefined
}

export function resetAdvancedMechanicsV3Refinements(): void {
  const wasRunning = state.running
  stopAdvancedMechanicsV3Refinements()
  state.revenge = 0
  state.elapsedSinceHit = 0
  state.lastHitHp = 100
  state.lastCombo = 0
  state.frenzyAnnouncementAt = -Infinity
  if (wasRunning) startAdvancedMechanicsV3Refinements()
}
