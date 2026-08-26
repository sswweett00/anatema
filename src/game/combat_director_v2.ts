import * as THREE from 'three'
import { enemies, gameState, getPlayer, spawnBurst, spawnEnemy, type Entity } from '../ecs/world'
import { nextRandom } from './rng'
import { sfx } from './audio'
import { onSimulationTick } from './simulation_clock'

type BossState = {
  nextCast: number
  phase: 1 | 2 | 3
  secondWindUsed: boolean
}

const bossStates = new WeakMap<Entity, BossState>()
const splitConsumed = new WeakSet<Entity>()
const lastHealth = new WeakMap<Entity, number>()
const comboMilestones = new Set<number>()

let unsubscribe: (() => void) | undefined
let directorTime = 0
let pressureAccumulator = 0
let cleanupAccumulator = 0

const STEP = 1 / 30
const COMBO_MILESTONES = [10, 25, 50, 100]

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function isBoss(entity: Entity): boolean {
  return Boolean(entity.isEnemy && !entity.dead && ((entity.scale ?? 1) >= 2.3 || (entity.maxHealth ?? 0) >= 1200))
}

function bossState(entity: Entity): BossState {
  let state = bossStates.get(entity)
  if (!state) {
    state = { nextCast: directorTime + 2 + nextRandom() * 2, phase: 1, secondWindUsed: false }
    bossStates.set(entity, state)
  }
  return state
}

function spawnSplitChildren(parent: Entity): void {
  if (splitConsumed.has(parent) || parent.dead !== true) return
  const maxHp = finite(parent.maxHealth)
  const scale = finite(parent.scale, 1)
  if (maxHp < 55 || scale < 1.1 || scale > 2.2) return
  splitConsumed.add(parent)

  const count = maxHp >= 260 ? 3 : 2
  const player = getPlayer()
  if (!player) return
  for (let i = 0; i < count; i++) {
    const before = enemies.entities.length
    if (before >= 1398) break
    spawnEnemy(parent.position)
    const child = enemies.entities[before]
    if (!child) continue
    const angle = (Math.PI * 2 * i) / count + nextRandom() * 0.35
    const radius = Math.max(0.55, (parent.radius ?? 0.35) * 1.8)
    child.position.x += Math.cos(angle) * radius
    child.position.z += Math.sin(angle) * radius
    child.health = Math.min(child.health, Math.max(8, maxHp * 0.12))
    child.maxHealth = child.health
    child.scale = Math.min(0.95, Math.max(0.62, scale * 0.62))
    child.damage = Math.min(child.damage ?? 4, Math.max(2, (parent.damage ?? 4) * 0.45))
    child.speed *= 1.08
    child.velocity.set(Math.cos(angle) * 1.8, 0, Math.sin(angle) * 1.8)
  }
  spawnBurst(parent.position, 0xff8a3d, Math.min(18, count * 6), 4.2, 0.55)
  sfx.storm()
}

function tickBosses(): void {
  const player = getPlayer()
  if (!player) return
  for (const enemy of enemies.entities) {
    if (!isBoss(enemy)) continue
    const state = bossState(enemy)
    const ratio = Math.max(0, Math.min(1, enemy.health / Math.max(1, enemy.maxHealth)))

    if (ratio <= 0.66 && state.phase === 1) {
      state.phase = 2
      state.nextCast = directorTime + 1.25
      gameState.shake = Math.min(1, gameState.shake + 0.16)
      spawnBurst(enemy.position, 0xffcc66, 20, 5.5, 0.7)
      sfx.wave()
    } else if (ratio <= 0.33 && state.phase === 2) {
      state.phase = 3
      state.nextCast = directorTime + 0.8
      gameState.shake = Math.min(1, gameState.shake + 0.22)
      spawnBurst(enemy.position, 0xff5b2d, 28, 6.5, 0.9)
      sfx.storm()
    }

    if (ratio <= 0.12 && !state.secondWindUsed) {
      state.secondWindUsed = true
      enemy.health = Math.min(enemy.maxHealth, enemy.health + enemy.maxHealth * 0.08)
      gameState.shake = Math.min(1, gameState.shake + 0.26)
      spawnBurst(enemy.position, 0xffe6b5, 32, 7, 1)
      sfx.levelup()
    }

    if (directorTime >= state.nextCast && !enemy.dead) {
      const interval = state.phase === 3 ? 4.7 : state.phase === 2 ? 6.2 : 8.3
      state.nextCast = directorTime + interval + nextRandom() * 1.4
      const burstCount = state.phase === 3 ? 22 : state.phase === 2 ? 16 : 11
      spawnBurst(enemy.position, state.phase === 3 ? 0xff6235 : 0xffb65e, burstCount, 5 + state.phase, 0.55)
      const distance = enemy.position.distanceTo(player.position)
      if (distance < 7.5) {
        const push = new THREE.Vector3().subVectors(player.position, enemy.position)
        if (push.lengthSq() > 1e-6) {
          push.normalize().multiplyScalar(state.phase === 3 ? 3.2 : 2.1)
          player.velocity.add(push)
        }
        gameState.damageFlash = Math.min(1, gameState.damageFlash + (state.phase === 3 ? 0.14 : 0.08))
      }
    }
  }
}

function tickComboEscalation(): void {
  const combo = Math.max(0, Math.trunc(gameState.combo))
  for (const milestone of COMBO_MILESTONES) {
    if (combo < milestone || comboMilestones.has(milestone)) continue
    comboMilestones.add(milestone)
    gameState.shake = Math.min(1, gameState.shake + 0.08)
    spawnBurst(getPlayer()?.position ?? new THREE.Vector3(), milestone >= 50 ? 0xffdf8a : 0xf4b85a, Math.min(22, 6 + Math.floor(milestone / 5)), 3.2, 0.5)
    sfx.tier()
  }
  if (combo === 0) comboMilestones.clear()
}

function tickPressure(dt: number): void {
  pressureAccumulator += dt
  if (pressureAccumulator < 0.5) return
  pressureAccumulator = 0
  const count = enemies.entities.length
  const waveFactor = Math.max(0, gameState.wave - 4) * 0.025
  const desired = Math.min(1, 0.2 + count / 1400 + waveFactor)
  if (desired > 0.86) {
    const stride = Math.max(1, Math.floor(enemies.entities.length / 80))
    for (let i = 0; i < enemies.entities.length; i += stride) {
      const e = enemies.entities[i]
      if (!e || e.dead) continue
      e.speed = Math.min(8, Math.max(e.speed, (e.speed ?? 1) * 1.015))
      e.damage = Math.min(120, Math.max(e.damage ?? 1, (e.damage ?? 1) * 1.01))
    }
  }
}

function tickDeathTransitions(): void {
  for (const enemy of enemies.entities) {
    if (!enemy.isEnemy) continue
    const previous = lastHealth.get(enemy)
    lastHealth.set(enemy, enemy.health)
    if (previous !== undefined && previous > 0 && enemy.health <= 0) spawnSplitChildren(enemy)
  }
}

function step(dt: number): void {
  directorTime += dt
  tickBosses()
  tickDeathTransitions()
  tickComboEscalation()
  tickPressure(dt)
  cleanupAccumulator += dt
  if (cleanupAccumulator >= 2) {
    cleanupAccumulator = 0
    if (gameState.phase === 'menu' || gameState.phase === 'dead') comboMilestones.clear()
  }
}

function onTick(dt: number): void {
  let remaining = Math.min(0.1, Math.max(0, dt))
  while (remaining > 0) {
    const step = Math.min(STEP, remaining)
    stepLogic(step)
    remaining -= step
  }
}

function stepLogic(dt: number): void {
  step(dt)
}

export function startCombatDirectorV2(): () => void {
  if (unsubscribe) return stopCombatDirectorV2
  directorTime = 0
  pressureAccumulator = 0
  cleanupAccumulator = 0
  unsubscribe = onSimulationTick(onTick)
  return stopCombatDirectorV2
}

export function stopCombatDirectorV2(): void {
  unsubscribe?.()
  unsubscribe = undefined
}

export function resetCombatDirectorV2(): void {
  stopCombatDirectorV2()
  comboMilestones.clear()
  directorTime = 0
  pressureAccumulator = 0
  cleanupAccumulator = 0
}
