import * as THREE from 'three'
import { abilities } from './abilities'
import { bullets, enemies, gameState, getPlayer, type Entity } from '../ecs/world'
import { runtimeQuality } from './performance'
import { spawnBurst } from '../ecs/world'
import { SpatialHash } from './spatial'

const tmp = new THREE.Vector3()
const target = new THREE.Vector3()
let running = false
let frame = 0
let last = 0
let separationTimer = 0
let lastTierNotice = -10
let lastTier = 0

const spatial = new SpatialHash(2.6)

function rebuildEnemyGrid() {
  spatial.build(enemies.entities)
}

function nearestEnemy(origin: THREE.Vector3, range: number): Entity | undefined {
  return spatial.nearest(origin, range, enemies.entities)
}

function steerProjectiles(dt: number) {
  const player = getPlayer()
  if (!player || abilities.arrows <= 0 || bullets.entities.length === 0) return

  const strength = Math.min(0.82, 0.1 + abilities.arrows * 0.05)
  const acquireRange = 8 + Math.min(12, abilities.arrows * 0.65)
  const bulletsList = bullets.entities

  for (let i = 0; i < bulletsList.length; i++) {
    const bullet = bulletsList[i]
    if ((bullet.life ?? 0) <= 0) continue
    const enemy = nearestEnemy(bullet.position, acquireRange)
    if (!enemy) continue

    target.copy(enemy.position).sub(bullet.position)
    target.y = 0
    const len = target.length()
    if (len < 0.05) continue
    target.multiplyScalar(1 / len)

    const speed = Math.max(1, Math.hypot(bullet.velocity.x, bullet.velocity.z))
    tmp.set(bullet.velocity.x, 0, bullet.velocity.z)
    const currentLen = tmp.length()
    if (currentLen < 0.05) tmp.copy(target)
    else tmp.multiplyScalar(1 / currentLen)

    tmp.lerp(target, 1 - Math.exp(-strength * dt * 60)).normalize()
    bullet.velocity.x = tmp.x * speed
    bullet.velocity.z = tmp.z * speed
  }
}

function separateSwarm(dt: number) {
  const quality = runtimeQuality.enemyScale
  const list = enemies.entities
  if (list.length < 2) return

  const radius = 0.72 + (1 - quality) * 0.15
  const radius2 = radius * radius
  const maxNeighbors = list.length > 900 ? 3 : 5
  const repel = list.length > 900 ? 0.42 : 0.58

  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (e.dead) continue

    spatial.forEachNearby(e.position, radius, list, (other) => {
      if (other === e) return
      const dx = e.position.x - other.position.x
      const dz = e.position.z - other.position.z
      const d2 = dx * dx + dz * dz
      if (d2 <= 0 || d2 > radius2) return
      const d = Math.sqrt(d2)
      const push = (1 - d / radius) * repel
      e.velocity.x += (dx / d) * push * dt * 12
      e.velocity.z += (dz / d) * push * dt * 12
    })
  }

  // Keep the hash's work bounded under extreme swarm density by relying on the
  // cell query itself and a final velocity clamp rather than scanning neighbors again.
  const maxSpeed = list.length > 1000 ? 7 : 8
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (e.dead) continue
    const speed = Math.hypot(e.velocity.x, e.velocity.z)
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed
      e.velocity.x *= scale
      e.velocity.z *= scale
    }
  }
}

function comboTier(combo: number) {
  if (combo >= 100) return 5
  if (combo >= 60) return 4
  if (combo >= 30) return 3
  if (combo >= 20) return 2
  if (combo >= 10) return 1
  return 0
}

function comboFeedback() {
  const tier = comboTier(gameState.combo)
  if (tier === lastTier) return
  lastTier = tier
  if (tier === 0) return

  const labels = ['', 'RİTİM', 'FIRTINA', 'SAVAŞ MAKİNESİ', 'YIKIM', 'APOKALİPS'] as const
  const colors = [0, 0xffb15c, 0x8fd8ff, 0xcaa7ff, 0xff7f4f, 0xffe2a2] as const
  if (gameState.time - lastTierNotice < 0.25) return

  lastTierNotice = gameState.time
  gameState.announceText = labels[tier]
  gameState.announceUntil = gameState.time + 0.85
  const p = getPlayer()
  if (p) {
    p.invuln = Math.max(p.invuln ?? 0, tier >= 4 ? 0.18 : 0.08)
    gameState.shake = Math.min(1, gameState.shake + 0.08 + tier * 0.025)
    spawnBurst(p.position, colors[tier], 5 + tier * 3, 3 + tier * 0.5, 0.24)
  }
}

function tick(dt: number) {
  if (gameState.phase !== 'playing') return

  separationTimer -= dt
  if (separationTimer <= 0) {
    separationTimer = enemies.entities.length > 900 ? 0.065 : 0.045
    rebuildEnemyGrid()
    separateSwarm(dt)
  }

  if (abilities.arrows > 0 && bullets.entities.length > 0) {
    if (spatial.nearest(new THREE.Vector3(), 0, enemies.entities)) {
      // no-op: keeps this branch allocation-free in normal execution; the grid
      // has already been rebuilt above and nearest() is used by the projectile pass.
    }
    steerProjectiles(dt)
  }

  comboFeedback()
}

export function startCombatPolish() {
  if (running || typeof window === 'undefined') return () => undefined
  running = true
  last = performance.now()
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
    last = now
    tick(dt)
    frame = window.requestAnimationFrame(loop)
  }
  frame = window.requestAnimationFrame(loop)
  return stopCombatPolish
}

export function stopCombatPolish() {
  running = false
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
  separationTimer = 0
  lastTierNotice = -10
  lastTier = 0
  spatial.clear()
}

export function resetCombatPolish() {
  separationTimer = 0
  lastTierNotice = -10
  lastTier = 0
  spatial.clear()
}
