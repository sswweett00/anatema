import * as THREE from 'three'
import { abilities } from './abilities'
import { sfx } from './audio'
import { enemies, gameState, getPlayer, spawnBurst, type Entity } from '../ecs/world'

const handled = new WeakSet<Entity>()
const tmp = new THREE.Vector3()
let running = false
let frame = 0
let last = 0
let chainTimer = 0
let lastStreak = 0

function processNearDeath(player: Entity) {
  const threshold = 0.07 + Math.min(0.09, gameState.combo * 0.0008)
  const limit = Math.min(5, 1 + Math.floor(gameState.combo / 25))
  let count = 0

  for (const e of enemies.entities) {
    if (count >= limit || e.dead || e.maxHealth <= 0) continue
    if (e.health / e.maxHealth > threshold) continue

    e.health = 0
    e.dead = true
    e.lastDmg = e.maxHealth * 1.08
    e.lastCrit = true
    count++
  }

  if (count > 0) {
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + count * 0.18)
    player.invuln = Math.max(player.invuln ?? 0, 0.16)
    gameState.shake = Math.min(1, gameState.shake + count * 0.08)
    spawnBurst(player.position, 0xffe2a2, 8 + count * 4, 5.5, 0.45)
    sfx.crit()
  }
}

function processOverkill() {
  for (const e of enemies.entities) {
    if (handled.has(e) || e.maxHealth <= 0 || e.lastDmg === undefined) continue
    if (e.lastDmg <= e.maxHealth * 1.08) continue
    if (e.health > e.maxHealth * 0.18) continue

    const excess = Math.min(e.maxHealth * 0.75, e.lastDmg - e.maxHealth)
    let hits = 0
    const radius = 3.8 + Math.min(2, excess * 0.01)
    const radius2 = radius * radius

    for (const other of enemies.entities) {
      if (hits >= 5 || other === e || other.dead) continue
      if (other.position.distanceToSquared(e.position) > radius2) continue
      other.health -= excess * (1 - hits * 0.12)
      other.hitFlash = 1
      if (other.health <= 0) other.dead = true
      hits++
    }

    if (hits > 0) {
      handled.add(e)
      spawnBurst(e.position, 0xffb15c, 12 + hits * 2, 5.5, 0.45)
      gameState.shake = Math.min(1, gameState.shake + 0.18)
    }
  }
}

function streakRewards(player: Entity) {
  const tier = Math.floor(gameState.kills / 25)
  if (tier <= lastStreak) return
  lastStreak = tier
  player.health = Math.min(player.maxHealth, player.health + 5 + tier * 2)
  player.poise = Math.min(player.maxPoise, player.poise + 8 + tier)
  gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.4)
  if (tier % 2 === 0) abilities.ferocity += 1
  spawnBurst(player.position, 0xffd15e, 8 + tier * 2, 3.2, 0.3)
}

function tick(dt: number) {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return

  chainTimer -= dt
  if (gameState.combo >= 8 && chainTimer <= 0) {
    chainTimer = Math.max(0.28, 0.65 - gameState.combo * 0.002)
    processNearDeath(player)
  }

  processOverkill()
  streakRewards(player)

  if (gameState.combo >= 25) {
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + dt * 0.01)
  }

  tmp.copy(player.velocity)
}

export function startMegaCompletion() {
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
  return stopMegaCompletion
}

export function stopMegaCompletion() {
  running = false
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
  chainTimer = 0
  lastStreak = 0
}

export function resetMegaCompletion() {
  chainTimer = 0
  lastStreak = 0
}
