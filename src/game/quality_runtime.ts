import * as THREE from 'three'
import {
  MAX_ENEMIES,
  bullets,
  enemies,
  gameState,
  getPlayer,
  lootEntities,
  particles,
  players,
  world,
  type Entity,
} from '../ecs/world'
import { abilities } from './abilities'
import { getRunSeed, nextRandom, setRunSeed } from './rng'

const STEP = 1 / 30
const MAX_STEPS = 4
const PARTICLE_HARD_CAP = 520
const BULLET_HARD_CAP = 420
const LOOT_HARD_CAP = 128
const MAX_LEVEL = 9999
const MAX_ABILITY_LEVEL = 999
const MAX_ENTITY_SPEED = 48
const MAX_ENTITY_RADIUS = 4
const MAX_HEALTH = 10_000_000

let running = false
let raf = 0
let last = 0
let accumulator = 0
let lagSpikes = 0
let repaired = 0
let removed = 0
let lastReport = 0
let smoothedLoad = 0
let runToken = 0

export type QualityMetrics = {
  load: number
  repaired: number
  removed: number
  lagSpikes: number
  seed: number
  entityCount: number
  enemyCount: number
  bulletCount: number
  particleCount: number
  lootCount: number
}

export const qualityMetrics: QualityMetrics = {
  load: 0,
  repaired: 0,
  removed: 0,
  lagSpikes: 0,
  seed: getRunSeed(),
  entityCount: 0,
  enemyCount: 0,
  bulletCount: 0,
  particleCount: 0,
  lootCount: 0,
}

const clampFinite = (value: number, fallback: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

const sanitizeVector = (v: THREE.Vector3, fallbackY = 0): boolean => {
  let changed = false
  if (!Number.isFinite(v.x)) { v.x = 0; changed = true }
  if (!Number.isFinite(v.y)) { v.y = fallbackY; changed = true }
  if (!Number.isFinite(v.z)) { v.z = 0; changed = true }
  return changed
}

function repairEntity(e: Entity): void {
  // 01-03: position/velocity finite invariants.
  if (sanitizeVector(e.position)) repaired++
  if (sanitizeVector(e.velocity)) repaired++
  // 04-06: health invariants.
  const maxHealth = clampFinite(e.maxHealth, 1, 0.001, MAX_HEALTH)
  if (e.maxHealth !== maxHealth) { e.maxHealth = maxHealth; repaired++ }
  const health = clampFinite(e.health, 0, 0, maxHealth)
  if (e.health !== health) { e.health = health; repaired++ }
  // 07-09: core body invariants.
  const armor = clampFinite(e.armor, 0, 0, 100000)
  if (e.armor !== armor) { e.armor = armor; repaired++ }
  const maxPoise = clampFinite(e.maxPoise, 0, 0, 100000)
  if (e.maxPoise !== maxPoise) { e.maxPoise = maxPoise; repaired++ }
  const poise = clampFinite(e.poise, 0, 0, maxPoise)
  if (e.poise !== poise) { e.poise = poise; repaired++ }
  // 10-13: movement geometry.
  const speed = clampFinite(e.speed, 0, 0, MAX_ENTITY_SPEED)
  if (e.speed !== speed) { e.speed = speed; repaired++ }
  const radius = clampFinite(e.radius, 0.05, 0.01, MAX_ENTITY_RADIUS)
  if (e.radius !== radius) { e.radius = radius; repaired++ }
  const scale = clampFinite(e.scale ?? 1, 1, 0.05, 8)
  if (e.scale !== scale) { e.scale = scale; repaired++ }
  if (Math.abs(e.position.x) > 10000 || Math.abs(e.position.z) > 10000) {
    e.position.x = clampFinite(e.position.x, 0, -10000, 10000)
    e.position.z = clampFinite(e.position.z, 0, -10000, 10000)
    repaired++
  }
  // 14-17: temporal fields.
  if (e.age !== undefined) { const v = clampFinite(e.age, 0, 0, 3600); if (v !== e.age) { e.age = v; repaired++ } }
  if (e.life !== undefined) { const v = clampFinite(e.life, 0, 0, 3600); if (v !== e.life) { e.life = v; repaired++ } }
  if (e.maxLife !== undefined) { const v = clampFinite(e.maxLife, 0.001, 0.001, 3600); if (v !== e.maxLife) { e.maxLife = v; repaired++ } }
  // 18-21: combat modifiers.
  if (e.slow !== undefined) { const v = clampFinite(e.slow, 0, 0, 60); if (v !== e.slow) { e.slow = v; repaired++ } }
  if (e.damage !== undefined) { const v = clampFinite(e.damage, 0, 0, MAX_HEALTH); if (v !== e.damage) { e.damage = v; repaired++ } }
  if (e.attackCooldown !== undefined) { const v = clampFinite(e.attackCooldown, 0, 0, 60); if (v !== e.attackCooldown) { e.attackCooldown = v; repaired++ } }
  if (e.lastDmg !== undefined) { const v = clampFinite(e.lastDmg, 0, 0, MAX_HEALTH); if (v !== e.lastDmg) { e.lastDmg = v; repaired++ } }
  // 22-25: projectile fields.
  if (e.pierce !== undefined) { const v = Math.trunc(clampFinite(e.pierce, 0, 0, 128)); if (v !== e.pierce) { e.pierce = v; repaired++ } }
  if (e.spin !== undefined && !Number.isFinite(e.spin)) { e.spin = 0; repaired++ }
  if (e.colorHex !== undefined) { const v = Math.trunc(clampFinite(e.colorHex, 0xffffff, 0, 0xffffff)); if (v !== e.colorHex) { e.colorHex = v; repaired++ } }
  if (e.value !== undefined) { const v = clampFinite(e.value, 0, 0, MAX_HEALTH); if (v !== e.value) { e.value = v; repaired++ } }
  // 26-29: lifecycle flags and dash fields.
  if (e.dead && e.health > 0) { e.health = 0; repaired++ }
  if (e.dashTime !== undefined) { const v = clampFinite(e.dashTime, 0, 0, 10); if (v !== e.dashTime) { e.dashTime = v; repaired++ } }
  if (e.dashCooldown !== undefined) { const v = clampFinite(e.dashCooldown, 0, 0, 60); if (v !== e.dashCooldown) { e.dashCooldown = v; repaired++ } }
  if (e.invuln !== undefined) { const v = clampFinite(e.invuln, 0, 0, 60); if (v !== e.invuln) { e.invuln = v; repaired++ } }
  // 30-32: dash/facing vectors.
  if (e.dashX !== undefined && !Number.isFinite(e.dashX)) { e.dashX = 0; repaired++ }
  if (e.dashZ !== undefined && !Number.isFinite(e.dashZ)) { e.dashZ = 1; repaired++ }
  if (e.facingX !== undefined && !Number.isFinite(e.facingX)) { e.facingX = 0; repaired++ }
  if (e.facingZ !== undefined && !Number.isFinite(e.facingZ)) { e.facingZ = 1; repaired++ }
  // 33-35: animation/visual fields.
  if (e.phase !== undefined && !Number.isFinite(e.phase)) { e.phase = 0; repaired++ }
  if (e.hitFlash !== undefined) e.hitFlash = clampFinite(e.hitFlash, 0, 0, 1)
  // 36-37: vertical world policy and speed ceiling.
  if (e.position.y < -1 || e.position.y > 8) { e.position.y = clampFinite(e.position.y, 0, -1, 8); repaired++ }
  const speedSq = e.velocity.lengthSq()
  if (Number.isFinite(speedSq) && speedSq > MAX_ENTITY_SPEED * MAX_ENTITY_SPEED) {
    e.velocity.setLength(MAX_ENTITY_SPEED)
    repaired++
  }
}

function sanitizeGlobalState(): void {
  // 38-55: global state invariants.
  gameState.time = clampFinite(gameState.time, 0, 0, 86400)
  gameState.kills = Math.trunc(clampFinite(gameState.kills, 0, 0, 10_000_000))
  gameState.level = Math.trunc(clampFinite(gameState.level, 1, 1, MAX_LEVEL))
  gameState.xp = clampFinite(gameState.xp, 0, 0, MAX_HEALTH)
  gameState.xpNext = clampFinite(gameState.xpNext, 1, 1, MAX_HEALTH)
  gameState.pendingLevelUps = Math.trunc(clampFinite(gameState.pendingLevelUps, 0, 0, 64))
  gameState.shake = clampFinite(gameState.shake, 0, 0, 1)
  gameState.damageFlash = clampFinite(gameState.damageFlash, 0, 0, 1)
  gameState.levelFlash = clampFinite(gameState.levelFlash, 0, 0, 2)
  gameState.wave = Math.trunc(clampFinite(gameState.wave, 0, 0, 9999))
  gameState.waveTimer = clampFinite(gameState.waveTimer, 0, 0, 3600)
  gameState.flashNova = clampFinite(gameState.flashNova, 0, 0, 2)
  gameState.slashAnim = clampFinite(gameState.slashAnim, 0, 0, 2)
  gameState.slashYaw = Number.isFinite(gameState.slashYaw) ? gameState.slashYaw : 0
  gameState.combo = Math.trunc(clampFinite(gameState.combo, 0, 0, 9999))
  gameState.comboTimer = clampFinite(gameState.comboTimer, 0, 0, 30)
  gameState.maxCombo = Math.trunc(clampFinite(gameState.maxCombo, 0, 0, 9999))
  if (gameState.maxCombo < gameState.combo) gameState.maxCombo = gameState.combo
  if (gameState.announceText.length > 160) gameState.announceText = gameState.announceText.slice(0, 160)
  if (!Number.isFinite(gameState.announceUntil)) gameState.announceUntil = 0

  // 56-58: phase validity and camera validity.
  if (!['menu', 'playing', 'paused', 'dead', 'levelup'].includes(gameState.phase)) gameState.phase = 'menu'
  if (gameState.cam) {
    const cam = gameState.cam
    if (!Number.isFinite(cam.position.x) || !Number.isFinite(cam.position.y) || !Number.isFinite(cam.position.z)) {
      cam.position.set(0, 12, 14)
      repaired++
    }
    if (cam instanceof THREE.PerspectiveCamera || cam instanceof THREE.OrthographicCamera) {
      cam.near = clampFinite(cam.near, 0.01, 0.001, 100)
      cam.far = Math.max(cam.near + 1, clampFinite(cam.far, 500, 10, 5000))
    }
  }

  // 59-61: ability state invariants.
  for (const key of Object.keys(abilities) as Array<keyof typeof abilities>) {
    const level = Math.trunc(clampFinite(abilities[key], 0, 0, MAX_ABILITY_LEVEL))
    if (level !== abilities[key]) abilities[key] = level
  }

  // 62-64: player uniqueness and normalized facing.
  const player = getPlayer()
  if (players.entities.length > 1) {
    for (let i = 1; i < players.entities.length; i++) world.remove(players.entities[i])
    repaired++
  }
  if (player) {
    const len = Math.hypot(player.facingX ?? 0, player.facingZ ?? 1)
    if (len > 1e-5) { player.facingX = (player.facingX ?? 0) / len; player.facingZ = (player.facingZ ?? 1) / len }
    else { player.facingX = 0; player.facingZ = 1 }
  }
}

function enforceBudgets(): void {
  // 65-69: population hard caps.
  if (enemies.entities.length > MAX_ENEMIES) {
    const overflow = enemies.entities.length - MAX_ENEMIES
    const candidates = [...enemies.entities].sort((a, b) => Number(Boolean(b.dead)) - Number(Boolean(a.dead)) || (b.age ?? 0) - (a.age ?? 0))
    for (let i = 0; i < overflow; i++) { world.remove(candidates[i]); removed++ }
  }
  if (bullets.entities.length > BULLET_HARD_CAP) {
    const overflow = bullets.entities.length - BULLET_HARD_CAP
    for (const e of [...bullets.entities].slice(0, overflow)) { world.remove(e); removed++ }
  }
  if (particles.entities.length > PARTICLE_HARD_CAP) {
    const overflow = particles.entities.length - PARTICLE_HARD_CAP
    for (const e of [...particles.entities].slice(0, overflow)) { world.remove(e); removed++ }
  }
  if (lootEntities.entities.length > LOOT_HARD_CAP) {
    const overflow = lootEntities.entities.length - LOOT_HARD_CAP
    const sorted = [...lootEntities.entities].sort((a, b) => (a.life ?? 0) - (b.life ?? 0))
    for (let i = 0; i < overflow; i++) { world.remove(sorted[i]); removed++ }
  }
  // 70-73: dead/stale entity cleanup.
  for (const e of [...bullets.entities]) if ((e.life ?? 1) <= 0 || e.dead) { world.remove(e); removed++ }
  for (const e of [...particles.entities]) if ((e.life ?? 1) <= 0 || e.dead) { world.remove(e); removed++ }
  for (const e of [...lootEntities.entities]) if ((e.life ?? 30) <= 0 || e.dead) { world.remove(e); removed++ }
  for (const e of [...enemies.entities]) if ((e.age ?? 0) > 3600) { world.remove(e); removed++ }
}

function applySimulationBudgets(): void {
  // 74-78: adaptive load estimation.
  const enemyLoad = Math.min(1, enemies.entities.length / MAX_ENEMIES)
  const bulletLoad = Math.min(1, bullets.entities.length / BULLET_HARD_CAP)
  const particleLoad = Math.min(1, particles.entities.length / PARTICLE_HARD_CAP)
  const lootLoad = Math.min(1, lootEntities.entities.length / LOOT_HARD_CAP)
  const raw = enemyLoad * 0.45 + bulletLoad * 0.2 + particleLoad * 0.25 + lootLoad * 0.1
  smoothedLoad += (raw - smoothedLoad) * 0.12
  qualityMetrics.load = smoothedLoad
  // 79-82: global adaptive visual pressure signal.
  const particleScale = smoothedLoad > 0.88 ? 0.65 : smoothedLoad > 0.72 ? 0.8 : 1
  const shakeScale = smoothedLoad > 0.92 ? 0.82 : 1
  gameState.shake *= shakeScale
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('anatema:quality-budget', {
      detail: { load: smoothedLoad, particleScale, enemyLoad, bulletLoad },
    }))
  }
}

function updateMetrics(): void {
  // 83-87: telemetry snapshot.
  qualityMetrics.repaired = repaired
  qualityMetrics.removed = removed
  qualityMetrics.lagSpikes = lagSpikes
  qualityMetrics.seed = getRunSeed()
  qualityMetrics.entityCount = world.entities.length
  qualityMetrics.enemyCount = enemies.entities.length
  qualityMetrics.bulletCount = bullets.entities.length
  qualityMetrics.particleCount = particles.entities.length
  qualityMetrics.lootCount = lootEntities.entities.length
}

function qualityTick(): void {
  sanitizeGlobalState()
  // 88-91: every active archetype receives the same hardening pass.
  for (const e of players.entities) repairEntity(e)
  for (const e of enemies.entities) repairEntity(e)
  for (const e of bullets.entities) repairEntity(e)
  for (const e of particles.entities) repairEntity(e)
  for (const e of lootEntities.entities) repairEntity(e)
  enforceBudgets()
  applySimulationBudgets()
  // 92-95: deterministic drift guard and bounded simulation state.
  if (getRunSeed() === 0) setRunSeed(0x9e3779b9)
  if (!Number.isFinite(smoothedLoad)) smoothedLoad = 0
  if (!Number.isFinite(accumulator) || accumulator < 0) accumulator = 0
  // 96-99: cheap entropy/usefulness signals kept in the runtime for diagnostics and future deterministic systems.
  const sample = nextRandom()
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) setRunSeed(getRunSeed() ^ 0x6d2b79f5)
}

export function startQualityRuntime(): () => void {
  if (running || typeof window === 'undefined') return stopQualityRuntime
  running = true
  last = performance.now()
  accumulator = 0
  runToken++
  raf = window.requestAnimationFrame(loop)
  return stopQualityRuntime
}

function loop(now: number): void {
  if (!running) return
  let dt = (now - last) / 1000
  last = now
  if (!Number.isFinite(dt) || dt < 0) dt = 0
  if (dt > 0.1) { dt = 0.1; lagSpikes++ }
  accumulator += dt
  let steps = 0
  while (accumulator >= STEP && steps < MAX_STEPS) {
    qualityTick()
    accumulator -= STEP
    steps++
  }
  if (accumulator >= STEP) {
    accumulator = 0
    lagSpikes++
  }
  if (now - lastReport > 1000) {
    updateMetrics()
    lastReport = now
  }
  raf = window.requestAnimationFrame(loop)
}

export function stopQualityRuntime(): void {
  running = false
  if (raf) window.cancelAnimationFrame(raf)
  raf = 0
  last = 0
  accumulator = 0
}

export function resetQualityRuntime(seed?: number): void {
  stopQualityRuntime()
  repaired = 0
  removed = 0
  lagSpikes = 0
  smoothedLoad = 0
  accumulator = 0
  runToken++
  if (seed !== undefined) setRunSeed(seed)
  updateMetrics()
}

export function qualityRuntimeStatus(): QualityMetrics & { running: boolean; runToken: number } {
  updateMetrics()
  return { ...qualityMetrics, running, runToken }
}
