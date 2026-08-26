import * as THREE from 'three'
import { enemies, gameState, getPlayer, spawnBurst, spawnEnemy, type Entity } from '../ecs/world'
import { nextRandom } from './rng'
import { sfx } from './audio'
import { onSimulationTick } from './simulation_clock'
import { events } from './events'

/**
 * ANATEMA — COMBAT DIRECTOR V3
 * Canonical home for boss mechanics previously owned by combat_director_v2.ts.
 * Keeps boss phase shocks, split-on-death, second wind and timed soft-enrage
 * while using the shared simulation clock.
 */

type Stop = () => void

type BossState = {
  phase: 1 | 2 | 3
  nextCastAt: number
  secondWindUsed: boolean
  splitConsumed: boolean
  fightTime: number
  lastRatio: number
  seed: number
}

const bossStates = new WeakMap<Entity, BossState>()
const comboMilestones = new Set<number>()
const previousHealth = new WeakMap<Entity, number>()

const COMBO_MILESTONES = [10, 25, 50, 100] as const
const tmp = new THREE.Vector3()

let running = false
let unsubscribeTick: Stop | undefined
let pressureAccumulator = 0
let milestoneGeneration = 0

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isBoss(entity: Entity): boolean {
  return Boolean(
    entity.isEnemy &&
    !entity.dead &&
    (finite(entity.maxHealth) >= 1200 || finite(entity.scale, 1) >= 2.3),
  )
}

function getBossState(entity: Entity): BossState {
  let state = bossStates.get(entity)
  if (!state) {
    state = {
      phase: 1,
      nextCastAt: gameState.time + 2 + nextRandom() * 2,
      secondWindUsed: false,
      splitConsumed: false,
      fightTime: 0,
      lastRatio: 1,
      seed: nextRandom(),
    }
    bossStates.set(entity, state)
  }
  return state
}

function emitPhase(entity: Entity, phase: 1 | 2 | 3): void {
  events.emit('boss:phase', {
    bossId: `enemy-${entity.enemyKind ?? 0}-${Math.round(entity.position.x * 10)}-${Math.round(entity.position.z * 10)}`,
    phase,
  })
}

function phaseShockwave(boss: Entity, player: Entity, phase: 2 | 3): void {
  const radius = phase === 3 ? 9 : 7.5
  const push = phase === 3 ? 4.4 : 3.2
  for (const enemy of enemies.entities) {
    if (enemy.dead || enemy === boss) continue
    if (enemy.position.distanceToSquared(boss.position) > radius * radius) continue
    tmp.subVectors(enemy.position, boss.position).setY(0)
    if (tmp.lengthSq() > 0.01) enemy.velocity.addScaledVector(tmp.normalize(), push)
    enemy.stagger = Math.max(finite(enemy.stagger), phase === 3 ? 0.5 : 0.35)
  }
  const playerDistance = player.position.distanceToSquared(boss.position)
  if (playerDistance <= radius * radius) {
    tmp.subVectors(player.position, boss.position).setY(0)
    if (tmp.lengthSq() > 0.01) player.velocity.addScaledVector(tmp.normalize(), push * 0.78)
    player.invuln = Math.max(player.invuln ?? 0, phase === 3 ? 0.24 : 0.18)
  }
  gameState.shake = Math.min(1, gameState.shake + (phase === 3 ? 0.3 : 0.2))
  spawnBurst(boss.position, phase === 3 ? 0xff5f32 : 0xffb15c, phase === 3 ? 36 : 24, 6.2 + phase, 0.8)
  sfx.storm()
  emitPhase(boss, phase)
}

function splitBoss(boss: Entity): void {
  const state = getBossState(boss)
  if (state.splitConsumed || boss.maxHealth < 55 || (boss.scale ?? 1) > 2.2) return
  state.splitConsumed = true
  const parentHealth = Math.max(1, finite(boss.maxHealth))
  const count = parentHealth >= 260 ? 3 : 2
  for (let i = 0; i < count; i++) {
    if (enemies.entities.length >= 1398) break
    const before = enemies.entities.length
    spawnEnemy(boss.position)
    const child = enemies.entities[before]
    if (!child) continue
    const angle = (Math.PI * 2 * i) / count + nextRandom() * 0.35
    const radius = Math.max(0.55, (boss.radius ?? 0.35) * 1.8)
    child.position.x += Math.cos(angle) * radius
    child.position.z += Math.sin(angle) * radius
    child.health = Math.min(child.health, Math.max(8, parentHealth * 0.12))
    child.maxHealth = child.health
    child.scale = clamp((boss.scale ?? 1) * 0.62, 0.62, 0.95)
    child.damage = Math.min(child.damage ?? 4, Math.max(2, (boss.damage ?? 4) * 0.45))
    child.speed = clamp((child.speed ?? 1) * 1.08, 0.35, 11)
    child.velocity.set(Math.cos(angle) * 1.8, 0, Math.sin(angle) * 1.8)
  }
  spawnBurst(boss.position, 0xff8a3d, Math.min(24, count * 7), 4.5, 0.6)
  events.emit('combat:reaction', { reaction: 'boss-split', targetId: String(boss.enemyKind ?? 0), power: count })
}

function processBoss(enemy: Entity, player: Entity, dt: number): void {
  const state = getBossState(enemy)
  state.fightTime += dt
  const ratio = clamp(finite(enemy.health) / Math.max(1, finite(enemy.maxHealth)), 0, 1)
  const previous = state.lastRatio

  if (ratio <= 0.66 && previous > 0.66 && state.phase === 1) {
    state.phase = 2
    state.nextCastAt = gameState.time + 1.25
    phaseShockwave(enemy, player, 2)
    gameState.announceText = 'BOSS FAZI II — ŞOK DALGASI'
    gameState.announceUntil = gameState.time + 1.8
  }

  if (ratio <= 0.33 && previous > 0.33 && state.phase === 2) {
    state.phase = 3
    state.nextCastAt = gameState.time + 0.8
    player.health = Math.max(1, finite(player.health, 1) - 6)
    phaseShockwave(enemy, player, 3)
    gameState.announceText = 'BOSS FAZI III — KANLI ÖFKE'
    gameState.announceUntil = gameState.time + 2
    sfx.die()
  }

  if (ratio <= 0.12 && !state.secondWindUsed) {
    state.secondWindUsed = true
    const heal = enemy.maxHealth * 0.08
    enemy.health = Math.min(enemy.maxHealth, enemy.health + heal)
    enemy.stagger = 0
    player.invuln = Math.max(player.invuln ?? 0, 0.25)
    spawnBurst(enemy.position, 0xffe6b5, 32, 7, 1)
    sfx.levelup()
    events.emit('combat:reaction', { reaction: 'boss-second-wind', targetId: String(enemy.enemyKind ?? 0), power: heal })
  }

  const enrage = Math.min(1.8, state.fightTime / 140)
  const baseSpeed = finite(enemy.speed, 1) / Math.max(0.5, 1 + enrage * 0.2)
  const baseDamage = finite(enemy.damage, 1) / Math.max(0.5, 1 + enrage * 0.35)
  enemy.speed = clamp(baseSpeed * (1 + enrage * 0.2), 0.35, 11)
  enemy.damage = clamp(baseDamage * (1 + enrage * 0.35), 1, 160)

  if (gameState.time >= state.nextCastAt && !enemy.dead) {
    const interval = state.phase === 3 ? 4.7 : state.phase === 2 ? 6.2 : 8.3
    state.nextCastAt = gameState.time + interval + nextRandom() * 1.4
    const burstCount = state.phase === 3 ? 22 : state.phase === 2 ? 16 : 11
    spawnBurst(enemy.position, state.phase === 3 ? 0xff6235 : 0xffb65e, burstCount, 5 + state.phase, 0.55)
    const distance = enemy.position.distanceTo(player.position)
    if (distance < 7.5) {
      tmp.subVectors(player.position, enemy.position).setY(0)
      if (tmp.lengthSq() > 0.01) {
        tmp.normalize()
        player.velocity.addScaledVector(tmp, state.phase === 3 ? 3.2 : 2.1)
      }
      gameState.damageFlash = Math.min(1, gameState.damageFlash + (state.phase === 3 ? 0.14 : 0.08))
    }
  }

  state.lastRatio = ratio
  previousHealth.set(enemy, enemy.health)
}

function processDeaths(): void {
  for (const enemy of enemies.entities) {
    const before = previousHealth.get(enemy)
    if (before === undefined) {
      previousHealth.set(enemy, enemy.health)
      continue
    }
    if (before > 0 && enemy.health <= 0) {
      const state = getBossState(enemy)
      if (state && (enemy.maxHealth >= 55 || (enemy.scale ?? 1) >= 1.1)) splitBoss(enemy)
    }
  }
}

function processCombo(): void {
  const combo = Math.max(0, Math.trunc(gameState.combo))
  for (const milestone of COMBO_MILESTONES) {
    if (combo < milestone || comboMilestones.has(milestone)) continue
    comboMilestones.add(milestone)
    gameState.shake = Math.min(1, gameState.shake + 0.08)
    const player = getPlayer()
    if (player) spawnBurst(player.position, milestone >= 50 ? 0xffdf8a : 0xf4b85a, Math.min(22, 6 + Math.floor(milestone / 5)), 3.2, 0.5)
    sfx.tier()
    events.emit('run:mutator', { mutator: 'combo-milestone', level: milestone, active: true })
  }
  if (combo === 0 && comboMilestones.size > 0) comboMilestones.clear()
}

function step(dt: number): void {
  if (gameState.phase !== 'playing') return
  const player = getPlayer()
  if (!player) return
  for (const enemy of enemies.entities) {
    if (isBoss(enemy)) processBoss(enemy, player, dt)
  }
  processDeaths()
  processCombo()
  pressureAccumulator += dt
  if (pressureAccumulator >= 0.5) {
    pressureAccumulator = 0
    const count = enemies.entities.length
    const pressure = clamp(count / 1400 + Math.max(0, gameState.wave - 5) * 0.02, 0, 1)
    if (pressure > 0.82) {
      for (let i = 0; i < enemies.entities.length; i += Math.max(1, Math.floor(enemies.entities.length / 90))) {
        const enemy = enemies.entities[i]
        if (!enemy || enemy.dead) continue
        enemy.speed = clamp(finite(enemy.speed, 1) * 1.004, 0.35, 11)
      }
    }
  }
}

export function startCombatDirectorV3(): Stop {
  if (running || typeof window === 'undefined') return stopCombatDirectorV3
  running = true
  pressureAccumulator = 0
  milestoneGeneration += 1
  unsubscribeTick = onSimulationTick((dt) => {
    try {
      step(clamp(dt, 0, 0.1))
    } catch (error) {
      events.emit('runtime:error', { system: 'combat-director-v3', message: String(error) })
    }
  })
  return stopCombatDirectorV3
}

export function stopCombatDirectorV3(): void {
  if (!running) return
  running = false
  unsubscribeTick?.()
  unsubscribeTick = undefined
}

export function resetCombatDirectorV3(): void {
  const wasRunning = running
  stopCombatDirectorV3()
  comboMilestones.clear()
  pressureAccumulator = 0
  milestoneGeneration = 0
  if (wasRunning) startCombatDirectorV3()
}

export function getCombatDirectorV3Snapshot() {
  let bossCount = 0
  let phase3 = 0
  for (const enemy of enemies.entities) {
    if (!isBoss(enemy)) continue
    bossCount += 1
    const state = bossStates.get(enemy)
    if (state?.phase === 3) phase3 += 1
  }
  return { bossCount, phase3, comboMilestones: [...comboMilestones], generation: milestoneGeneration }
}
