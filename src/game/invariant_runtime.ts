import { bullets, enemies, gameState, getPlayer, particles, players } from '../ecs/world'
import { events } from './events'

let timer = 0
let lastReport = 0

export interface InvariantReport {
  healthy: boolean
  violations: number
  enemyCount: number
  bulletCount: number
  particleCount: number
}

function finiteVector(entity: { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number } }): boolean {
  return Number.isFinite(entity.position.x)
    && Number.isFinite(entity.position.y)
    && Number.isFinite(entity.position.z)
    && Number.isFinite(entity.velocity.x)
    && Number.isFinite(entity.velocity.y)
    && Number.isFinite(entity.velocity.z)
}

function repairFinite(): number {
  let violations = 0
  const collections = [enemies.entities, bullets.entities, particles.entities]
  for (const list of collections) {
    for (const entity of list) {
      if (!finiteVector(entity)) {
        entity.position.set(0, 0, 0)
        entity.velocity.set(0, 0, 0)
        violations++
      }
      if (!Number.isFinite(entity.health) || entity.health < 0) {
        entity.health = 0
        entity.dead = true
        violations++
      }
      if (!Number.isFinite(entity.maxHealth) || entity.maxHealth < 1) {
        entity.maxHealth = 1
        violations++
      }
      if (entity.health > entity.maxHealth) {
        entity.health = entity.maxHealth
        violations++
      }
      if (!Number.isFinite(entity.speed) || entity.speed < 0) {
        entity.speed = 0
        violations++
      }
    }
  }

  const player = getPlayer()
  if (player) {
    if (player.health > player.maxHealth) {
      player.health = player.maxHealth
      violations++
    }
    if (player.health <= 0 && !player.dead) {
      player.dead = true
      violations++
    }
  }
  return violations
}

export function verifyInvariants(): InvariantReport {
  let violations = repairFinite()
  if (enemies.entities.length > 1400) violations += enemies.entities.length - 1400
  if (bullets.entities.length > 320) violations += bullets.entities.length - 320
  if (particles.entities.length > 900) violations += particles.entities.length - 900
  if (gameState.level < 1 || !Number.isFinite(gameState.level)) {
    gameState.level = 1
    violations++
  }
  if (gameState.xp < 0 || !Number.isFinite(gameState.xp)) {
    gameState.xp = 0
    violations++
  }
  if (gameState.combo < 0 || !Number.isFinite(gameState.combo)) {
    gameState.combo = 0
    violations++
  }
  if (players.entities.length !== 1) violations += Math.abs(players.entities.length - 1)

  const report: InvariantReport = {
    healthy: violations === 0,
    violations,
    enemyCount: enemies.entities.length,
    bulletCount: bullets.entities.length,
    particleCount: particles.entities.length,
  }

  if (violations > 0 && gameState.time - lastReport > 1) {
    lastReport = gameState.time
    events.emit('runtime:error', {
      system: 'invariants',
      message: `simulation repaired ${violations} invariant violation(s)`,
    })
  }
  return report
}

export function resetInvariantRuntime(): void {
  timer = 0
  lastReport = 0
}

let frame = 0
let running = false
let last = 0
export function startInvariantRuntime() {
  if (running || typeof window === 'undefined') return stopInvariantRuntime
  running = true
  last = performance.now()
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.max(0, (now - last) / 1000)
    last = now
    timer += dt
    if (timer >= 0.5) {
      timer = 0
      verifyInvariants()
    }
    frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)
  return stopInvariantRuntime
}

export function stopInvariantRuntime() {
  running = false
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  last = 0
}
