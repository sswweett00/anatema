import * as THREE from 'three'
import { bullets, enemies, gameState, particles, world, MAX_ENEMIES, type Entity } from '../ecs/world'

let running = false
let frame = 0
let last = 0
let accumulator = 0

const MAX_BULLETS = 320
const MAX_PARTICLES = 900
const MAX_STEP = 0.1

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function sanitizeEntity(entity: Entity) {
  const p = entity.position
  const v = entity.velocity

  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) p.set(0, 0, 0)
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) v.set(0, 0, 0)

  entity.maxHealth = Math.max(1, finite(entity.maxHealth, 1))
  entity.health = Math.max(0, Math.min(entity.maxHealth, finite(entity.health)))
  entity.armor = Math.max(0, Math.min(999, finite(entity.armor)))
  entity.maxPoise = Math.max(1, Math.min(999, finite(entity.maxPoise, 1)))
  entity.poise = Math.max(0, Math.min(entity.maxPoise, finite(entity.poise)))
  entity.speed = Math.max(0, Math.min(40, finite(entity.speed)))
  entity.radius = Math.max(0.02, Math.min(4, finite(entity.radius, 0.25)))
  entity.slow = Math.max(0, Math.min(1, finite(entity.slow)))
  entity.hitFlash = Math.max(0, Math.min(1, finite(entity.hitFlash)))
  entity.attackCooldown = Math.max(0, finite(entity.attackCooldown))
  entity.invuln = Math.max(0, finite(entity.invuln))
  entity.life = Math.max(0, finite(entity.life))
  entity.maxLife = Math.max(0, finite(entity.maxLife))

  if (entity.health <= 0) entity.dead = true
}

function trimOverflow<T extends Entity>(collection: { entities: T[] }, max: number) {
  if (collection.entities.length <= max) return

  const overflow = collection.entities.length - max
  const candidates = collection.entities
    .map((entity, index) => ({ entity, index }))
    .sort((a, b) => {
      const dead = Number(Boolean(b.entity.dead)) - Number(Boolean(a.entity.dead))
      if (dead !== 0) return dead
      return (b.entity.age ?? 0) - (a.entity.age ?? 0)
    })

  for (let i = 0; i < overflow; i++) {
    world.remove(candidates[i].entity)
  }
}

function tick() {
  if (gameState.phase === 'menu') return

  for (const e of enemies.entities) sanitizeEntity(e)
  for (const b of bullets.entities) sanitizeEntity(b)
  for (const p of particles.entities) sanitizeEntity(p)

  trimOverflow(enemies, MAX_ENEMIES)
  trimOverflow(bullets, MAX_BULLETS)
  trimOverflow(particles, MAX_PARTICLES)

  gameState.time = Math.max(0, finite(gameState.time))
  gameState.xp = Math.max(0, finite(gameState.xp))
  gameState.xpNext = Math.max(1, finite(gameState.xpNext, 1))
  gameState.combo = Math.max(0, Math.floor(finite(gameState.combo)))
  gameState.comboTimer = Math.max(0, Math.min(10, finite(gameState.comboTimer)))
  gameState.kills = Math.max(0, Math.floor(finite(gameState.kills)))
  gameState.level = Math.max(1, Math.floor(finite(gameState.level, 1)))
  gameState.wave = Math.max(0, Math.floor(finite(gameState.wave)))
  gameState.waveTimer = Math.max(0, finite(gameState.waveTimer))
  gameState.shake = Math.max(0, Math.min(1, finite(gameState.shake)))
  gameState.damageFlash = Math.max(0, Math.min(1, finite(gameState.damageFlash)))
  gameState.levelFlash = Math.max(0, Math.min(1, finite(gameState.levelFlash)))
}

export function startRuntimeSafety() {
  if (running || typeof window === 'undefined') return () => undefined
  running = true
  last = performance.now()
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.max(0, Math.min(MAX_STEP, (now - last) / 1000))
    last = now
    accumulator += dt
    if (accumulator >= 0.5) {
      accumulator = 0
      tick()
    }
    frame = window.requestAnimationFrame(loop)
  }
  frame = window.requestAnimationFrame(loop)
  return stopRuntimeSafety
}

export function stopRuntimeSafety() {
  running = false
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
  accumulator = 0
}

export function resetRuntimeSafety() {
  accumulator = 0
}
