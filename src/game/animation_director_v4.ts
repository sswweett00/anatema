import * as THREE from 'three'
import { enemies, gameState, getPlayer, type Entity } from '../ecs/world'
import { onSimulationTick } from './simulation_clock'
import { getCombatAnimationV4 } from './combat_animation_v4'
import { getEnemyAnimationV4 } from './enemy_animation_v4'
import { getPlayerAnimationV4 } from './player_animation_v4'
import { budgetForDistance, clamp, clamp01, decay, finite, Spring1D, Spring3D } from './animation_math_v4'

type Stop = () => void
export type AnimationQualityTier = 'hero' | 'near' | 'mid' | 'far' | 'sleep'

export interface AnimationBudgetSnapshot {
  heroCount: number
  nearCount: number
  midCount: number
  farCount: number
  sleepingCount: number
  pressure: number
  qualityScale: number
}

export interface AnimationDirectorSnapshot {
  time: number
  playerEnergy: number
  playerState: string
  combatIntensity: number
  qualityTier: AnimationQualityTier
  enemy: AnimationBudgetSnapshot
  globalMotion: number
  poseBlend: number
  simulationLag: number
  visualDebt: number
}

interface AgentBudget {
  tier: AnimationQualityTier
  accumulator: number
  interval: number
  detail: number
  distance: number
}

interface DirectorState {
  running: boolean
  unsubscribe?: Stop
  time: number
  pressure: Spring1D
  quality: Spring1D
  motion: Spring1D
  poseBlend: Spring1D
  lag: Spring1D
  debt: Spring1D
  globalMotion: Spring1D
  budgets: WeakMap<Entity, AgentBudget>
  counts: AnimationBudgetSnapshot
  lastEnemyCount: number
  lastGameTime: number
}

const state: DirectorState = {
  running: false,
  time: 0,
  pressure: new Spring1D(),
  quality: new Spring1D(1),
  motion: new Spring1D(),
  poseBlend: new Spring1D(1),
  lag: new Spring1D(),
  debt: new Spring1D(),
  globalMotion: new Spring1D(1),
  budgets: new WeakMap(),
  counts: { heroCount: 0, nearCount: 0, midCount: 0, farCount: 0, sleepingCount: 0, pressure: 0, qualityScale: 1 },
  lastEnemyCount: 0,
  lastGameTime: 0,
}

const snapshot: AnimationDirectorSnapshot = {
  time: 0,
  playerEnergy: 0,
  playerState: 'idle',
  combatIntensity: 0,
  qualityTier: 'hero',
  enemy: { heroCount: 0, nearCount: 0, midCount: 0, farCount: 0, sleepingCount: 0, pressure: 0, qualityScale: 1 },
  globalMotion: 1,
  poseBlend: 1,
  simulationLag: 0,
  visualDebt: 0,
}

function distanceSquared(entity: Entity, player: Entity): number {
  const dx = entity.position.x - player.position.x
  const dz = entity.position.z - player.position.z
  return dx * dx + dz * dz
}

function tierForDistance(distance: number): AnimationQualityTier {
  if (distance < 7) return 'hero'
  if (distance < 18) return 'near'
  if (distance < 40) return 'mid'
  if (distance < 72) return 'far'
  return 'sleep'
}

function intervalForTier(tier: AnimationQualityTier, pressure: number): number {
  const base = tier === 'hero' ? 1 / 60 : tier === 'near' ? 1 / 42 : tier === 'mid' ? 1 / 24 : tier === 'far' ? 1 / 12 : 0.18
  const factor = 1 + clamp01(pressure) * (tier === 'hero' ? 0.15 : 0.45)
  return base * factor
}

function selectBudget(entity: Entity, player: Entity, pressure: number): AgentBudget {
  const distance = Math.sqrt(distanceSquared(entity, player))
  const tier = tierForDistance(distance)
  const quality = budgetForDistance(distance, pressure, state.quality.value)
  return {
    tier,
    accumulator: 0,
    interval: intervalForTier(tier, pressure),
    detail: quality.detail,
    distance,
  }
}

function updateBudgets(dt: number, player: Entity): void {
  const counts: AnimationBudgetSnapshot = { heroCount: 0, nearCount: 0, midCount: 0, farCount: 0, sleepingCount: 0, pressure: state.pressure.value, qualityScale: state.quality.value }
  const maxDetailed = state.pressure.value > 0.85 ? 28 : state.pressure.value > 0.65 ? 42 : 64
  let detailedUsed = 0

  for (const entity of enemies.entities) {
    const budget = state.budgets.get(entity) ?? selectBudget(entity, player, state.pressure.value)
    const distance = Math.sqrt(distanceSquared(entity, player))
    const tier = tierForDistance(distance)
    if (tier !== budget.tier || Math.abs(distance - budget.distance) > 6) {
      budget.tier = tier
      budget.distance = distance
      budget.interval = intervalForTier(tier, state.pressure.value)
      budget.detail = budgetForDistance(distance, state.pressure.value, state.quality.value).detail
    }
    budget.accumulator += dt
    const wantsDetailed = tier === 'hero' || tier === 'near'
    if (wantsDetailed && detailedUsed >= maxDetailed) {
      budget.detail *= 0.72
      budget.interval *= 1.35
    } else if (wantsDetailed) {
      detailedUsed++
    }
    state.budgets.set(entity, budget)
    switch (tier) {
      case 'hero': counts.heroCount++; break
      case 'near': counts.nearCount++; break
      case 'mid': counts.midCount++; break
      case 'far': counts.farCount++; break
      case 'sleep': counts.sleepingCount++; break
    }
  }
  counts.pressure = state.pressure.value
  counts.qualityScale = state.quality.value
  state.counts = counts
}

function adaptiveQuality(dt: number): void {
  const enemyCount = enemies.entities.length
  const delta = enemyCount - state.lastEnemyCount
  const spawnPressure = clamp01(enemyCount / 240)
  const changePressure = clamp(Math.abs(delta) / 80, 0, 0.5)
  const targetPressure = clamp01(spawnPressure * 0.72 + changePressure * 0.28)
  state.pressure.update(targetPressure, 4.8, 0.9, dt)
  const targetQuality = clamp(1.08 - state.pressure.value * 0.45, 0.5, 1.08)
  state.quality.update(targetQuality, 3.8, 0.9, dt)
  const gameDelta = Math.max(0, gameState.time - state.lastGameTime)
  const lag = Math.max(0, dt - gameDelta)
  state.lag.update(lag * 8, 5, 0.9, dt)
  const debtTarget = clamp01(state.pressure.value * 0.5 + state.lag.value * 0.35)
  state.debt.update(debtTarget, 5.5, 0.92, dt)
  state.lastEnemyCount = enemyCount
  state.lastGameTime = gameState.time
}

function globalMotion(dt: number): void {
  const player = getPlayer()
  if (!player) return
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  const combat = getCombatAnimationV4()
  const target = clamp(1 + speed * 0.018 + combat.intensity * 0.18 - state.pressure.value * 0.18, 0.75, 1.25)
  state.motion.update(target, 7, 0.86, dt)
  state.globalMotion.update(target, 5, 0.9, dt)
  state.poseBlend.update(1 - state.pressure.value * 0.08, 6, 0.9, dt)
}

function cleanupDeadBudgets(): void {
  // WeakMap ownership naturally releases entity budget records after ECS cleanup.
  // This method intentionally remains allocation-free so it can stay on the hot path.
}

function tick(dt: number): void {
  if (gameState.phase !== 'playing') return
  const player = getPlayer()
  if (!player) return
  const safeDt = clamp(dt, 0.001, 0.033)
  state.time += safeDt
  adaptiveQuality(safeDt)
  globalMotion(safeDt)
  updateBudgets(safeDt, player)
  cleanupDeadBudgets()
  const playerAnim = getPlayerAnimationV4()
  const combatAnim = getCombatAnimationV4()
  snapshot.time = state.time
  snapshot.playerEnergy = clamp01(playerAnim.speed / 8 + combatAnim.intensity * 0.25)
  snapshot.playerState = playerAnim.state
  snapshot.combatIntensity = combatAnim.intensity
  snapshot.qualityTier = 'hero'
  snapshot.enemy = { ...state.counts }
  snapshot.globalMotion = state.globalMotion.value
  snapshot.poseBlend = state.poseBlend.value
  snapshot.simulationLag = state.lag.value
  snapshot.visualDebt = state.debt.value

  for (const entity of enemies.entities) {
    const budget = state.budgets.get(entity)
    if (!budget) continue
    if (budget.accumulator < budget.interval) continue
    budget.accumulator %= Math.max(0.001, budget.interval)
    state.budgets.set(entity, budget)
    const enemyAnim = getEnemyAnimationV4(entity)
    if (budget.tier === 'sleep') continue
    if (enemyAnim.state === 'dead') {
      // Dead agents keep a short presentation window at reduced cadence.
      continue
    }
  }
}

export function startAnimationDirectorV4(): Stop {
  if (state.running || typeof window === 'undefined') return stopAnimationDirectorV4
  state.running = true
  state.time = 0
  state.lastGameTime = gameState.time
  unsubscribe = onSimulationTick(tick)
  return stopAnimationDirectorV4
}

export function stopAnimationDirectorV4(): void {
  if (!state.running) return
  state.running = false
  unsubscribe?.()
  unsubscribe = undefined
}

export function resetAnimationDirectorV4(): void {
  const wasRunning = state.running
  stopAnimationDirectorV4()
  state.time = 0
  state.lastEnemyCount = 0
  state.lastGameTime = 0
  state.counts = { heroCount: 0, nearCount: 0, midCount: 0, farCount: 0, sleepingCount: 0, pressure: 0, qualityScale: 1 }
  for (const spring of [state.pressure, state.quality, state.motion, state.poseBlend, state.lag, state.debt, state.globalMotion]) spring.reset(spring === state.quality || spring === state.globalMotion || spring === state.poseBlend ? 1 : 0)
  Object.assign(snapshot, { time: 0, playerEnergy: 0, playerState: 'idle', combatIntensity: 0, qualityTier: 'hero', enemy: { ...state.counts }, globalMotion: 1, poseBlend: 1, simulationLag: 0, visualDebt: 0 })
  if (wasRunning) startAnimationDirectorV4()
}

export function getAnimationDirectorV4(): Readonly<AnimationDirectorSnapshot> {
  return snapshot
}

export function getEnemyAnimationBudget(entity: Entity): Readonly<AgentBudget> {
  const player = getPlayer()
  const budget = state.budgets.get(entity)
  if (budget) return budget
  if (!player) return { tier: 'sleep', accumulator: 0, interval: 0.18, detail: 0.2, distance: Infinity }
  const next = selectBudget(entity, player, state.pressure.value)
  state.budgets.set(entity, next)
  return next
}

export function shouldAnimateEntity(entity: Entity): boolean {
  const budget = getEnemyAnimationBudget(entity)
  return budget.tier !== 'sleep' || state.pressure.value < 0.9
}
