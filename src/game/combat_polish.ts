import * as THREE from 'three'
import { abilities } from './abilities'
import { bullets, enemies, gameState, getPlayer, type Entity, spawnBurst } from '../ecs/world'
import { runtimeQuality } from './performance'
import { SpatialHash } from './spatial'
import { onSimulationTick } from './simulation_clock'

const tmp = new THREE.Vector3()
const target = new THREE.Vector3()
let running = false
let unsubscribeTick: (() => void) | undefined
let separationTimer = 0
let steeringTimer = 0
let lastTierNotice = -10
let lastTier = 0
let lastCombo = 0

const spatial = new SpatialHash(2.6)
const aliveBuffer: Entity[] = []

function rebuildEnemyGrid() {
  spatial.build(enemies.entities)
}

function rebuildAliveBuffer() {
  aliveBuffer.length = 0
  for (const enemy of enemies.entities) {
    if (!enemy.dead) aliveBuffer.push(enemy)
  }
}

function nearestEnemy(origin: THREE.Vector3, range: number): Entity | undefined {
  return spatial.nearest(origin, range, enemies.entities)
}

function steerProjectiles(dt: number) {
  const player = getPlayer()
  if (!player || abilities.arrows <= 0 || bullets.entities.length === 0) return

  const strength = Math.min(0.72, 0.08 + abilities.arrows * 0.045)
  const acquireRange = 8 + Math.min(12, abilities.arrows * 0.6)
  const maxTurn = 0.34
  const largeSwarm = aliveBuffer.length > 850

  // High entity pressure trades a tiny amount of homing responsiveness for stable CPU cost.
  for (let i = 0; i < bullets.entities.length; i++) {
    const bullet = bullets.entities[i]
    if ((bullet.life ?? 0) <= 0 || bullet.dead) continue
    if (largeSwarm && (i & 1) === 1) continue

    const enemy = nearestEnemy(bullet.position, acquireRange)
    if (!enemy) continue

    target.copy(enemy.position).sub(bullet.position)
    target.y = 0
    const len = target.length()
    if (!Number.isFinite(len) || len < 0.05) continue
    target.multiplyScalar(1 / len)

    const speed = THREE.MathUtils.clamp(Math.hypot(bullet.velocity.x, bullet.velocity.z), 1, 24)
    tmp.set(bullet.velocity.x, 0, bullet.velocity.z)
    const currentLen = tmp.length()
    if (!Number.isFinite(currentLen) || currentLen < 0.05) tmp.copy(target)
    else tmp.multiplyScalar(1 / currentLen)

    const turn = Math.min(maxTurn, 1 - Math.exp(-strength * dt * 60))
    tmp.lerp(target, turn).normalize()
    bullet.velocity.x = tmp.x * speed
    bullet.velocity.z = tmp.z * speed
  }
}

function separateSwarm(dt: number) {
  const quality = THREE.MathUtils.clamp(runtimeQuality.enemyScale, 0.66, 1)
  const list = aliveBuffer
  if (list.length < 2) return

  const radius = 0.72 + (1 - quality) * 0.15
  const radius2 = radius * radius
  const repel = list.length > 900 ? 0.42 : 0.58
  const maxNeighbors = list.length > 1100 ? 3 : list.length > 800 ? 4 : 5

  for (const e of list) {
    let neighbors = 0
    spatial.forEachNearby(e.position, radius, enemies.entities, (other) => {
      if (other === e || other.dead || neighbors >= maxNeighbors) return
      const dx = e.position.x - other.position.x
      const dz = e.position.z - other.position.z
      const d2 = dx * dx + dz * dz
      if (d2 <= 0 || d2 > radius2) return
      const d = Math.sqrt(d2)
      const push = (1 - d / radius) * repel
      e.velocity.x += (dx / d) * push * dt * 12
      e.velocity.z += (dz / d) * push * dt * 12
      neighbors++
    })
  }

  const maxSpeed = list.length > 1000 ? 7 : 8
  for (const e of list) {
    const speed = Math.hypot(e.velocity.x, e.velocity.z)
    if (!Number.isFinite(speed)) {
      e.velocity.x = 0
      e.velocity.z = 0
      continue
    }
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
  const combo = Number.isFinite(gameState.combo) ? Math.max(0, Math.floor(gameState.combo)) : 0
  if (combo < lastCombo) lastTier = Math.min(lastTier, comboTier(combo))
  lastCombo = combo

  const tier = comboTier(combo)
  if (tier === lastTier || tier === 0) return
  lastTier = tier

  const labels = ['', 'RİTİM', 'FIRTINA', 'SAVAŞ MAKİNESİ', 'YIKIM', 'APOKALİPS'] as const
  const colors = [0, 0xffb15c, 0x8fd8ff, 0xcaa7ff, 0xff7f4f, 0xffe2a2] as const
  if (gameState.time - lastTierNotice < 0.25) return

  lastTierNotice = gameState.time
  gameState.announceText = labels[tier]
  gameState.announceUntil = gameState.time + 0.85
  const p = getPlayer()
  if (!p) return

  p.invuln = Math.max(p.invuln ?? 0, tier >= 4 ? 0.18 : 0.08)
  gameState.shake = THREE.MathUtils.clamp(gameState.shake + 0.08 + tier * 0.025, 0, 1)
  const burstCount = runtimeQuality.particleScale < 0.5 ? 3 + tier : 5 + tier * 3
  spawnBurst(p.position, colors[tier], burstCount, 3 + tier * 0.5, 0.24)
}

function tick(dt: number) {
  if (gameState.phase !== 'playing') return

  rebuildAliveBuffer()

  separationTimer -= dt
  if (separationTimer <= 0) {
    separationTimer = aliveBuffer.length > 900 ? 0.065 : 0.045
    rebuildEnemyGrid()
    separateSwarm(dt)
  }

  // Under extreme bullet pressure, steer on alternating simulation ticks instead of every tick.
  steeringTimer -= dt
  const steerInterval = bullets.entities.length > 700 ? 1 / 30 : 1 / 60
  if (steeringTimer <= 0) {
    steeringTimer += steerInterval
    if (abilities.arrows > 0 && bullets.entities.length > 0) steerProjectiles(steerInterval)
  }

  comboFeedback()
}

export function startCombatPolish() {
  if (running || typeof window === 'undefined') return () => undefined
  running = true
  unsubscribeTick = onSimulationTick((dt) => tick(dt))
  return stopCombatPolish
}

export function stopCombatPolish() {
  running = false
  unsubscribeTick?.()
  unsubscribeTick = undefined
  separationTimer = 0
  steeringTimer = 0
  lastTierNotice = -10
  lastTier = 0
  lastCombo = 0
  aliveBuffer.length = 0
  spatial.clear()
}

export function resetCombatPolish() {
  separationTimer = 0
  steeringTimer = 0
  lastTierNotice = -10
  lastTier = 0
  lastCombo = 0
  aliveBuffer.length = 0
  spatial.clear()
}
