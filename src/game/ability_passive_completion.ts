import { gameState, getPlayer } from '../ecs/world'
import { abilities } from './abilities'
import { events } from './events'

let running = false
let raf = 0
let last = 0
let accumulator = 0
let berserkerMomentum = 0
let lastKills = 0
let harvestClaims = 0
let fortuneClaims = 0

function tick(dt: number) {
  if (gameState.phase !== 'playing') return
  const player = getPlayer()
  if (!player) return

  if (abilities.berserker > 0) {
    if (gameState.damageFlash > 0.05) {
      berserkerMomentum = Math.max(0, berserkerMomentum - dt * 2.8)
    } else {
      berserkerMomentum = Math.min(1, berserkerMomentum + dt * (0.12 + abilities.berserker * 0.018))
    }

    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    if (berserkerMomentum > 0 && speed > 0.2) {
      const targetSpeed = speed * (1 + berserkerMomentum * Math.min(0.18, abilities.berserker * 0.012))
      const acceleration = Math.min(1, dt * (2.5 + abilities.berserker * 0.12))
      const scale = 1 + ((targetSpeed / speed) - 1) * acceleration
      player.velocity.x *= scale
      player.velocity.z *= scale
    }
  }

  if (abilities.precision > 0 && Math.hypot(player.velocity.x, player.velocity.z) > 0.5) {
    const damp = Math.max(0.965, 1 - abilities.precision * 0.0018)
    player.velocity.x *= damp
    player.velocity.z *= damp
  }

  if (abilities.lifeforge > 0 && player.health < player.maxHealth) {
    const forgeRate = Math.min(12, 0.7 + player.maxHealth * 0.006 + abilities.lifeforge * 0.45)
    player.health = Math.min(player.maxHealth, player.health + forgeRate * dt)
  }

  if (abilities.fortunesfavor > 0 && gameState.kills > 0) {
    const milestoneIndex = Math.floor(gameState.kills / 25)
    if (milestoneIndex > fortuneClaims) {
      fortuneClaims = milestoneIndex
      const bonus = 1 + Math.min(0.5, abilities.fortunesfavor * 0.035)
      gameState.xp += Math.max(1, Math.floor(2 * bonus))
      events.emit('loot:acquire', {
        kind: 'relic',
        rarity: abilities.fortunesfavor >= 8 ? 'epic' : 'rare',
      })
    }
  }

  if (abilities.soulharvest > 0 && gameState.kills > lastKills && gameState.kills % 25 === 0) {
    const milestoneIndex = gameState.kills / 25
    if (milestoneIndex > harvestClaims) {
      harvestClaims = milestoneIndex
      const heal = 10 + abilities.soulharvest * 3
      player.health = Math.min(player.maxHealth, player.health + heal)
      player.poise = Math.min(player.maxPoise, player.poise + 20 + abilities.soulharvest * 4)
      gameState.combo = Math.min(999, gameState.combo + 3 + abilities.soulharvest)
      events.emit('ability:evolution', {
        abilityId: 'soulharvest',
        level: abilities.soulharvest,
        evolutionId: 'soulharvest_milestone',
      })
    }
  }

  lastKills = gameState.kills
}

export function startAbilityPassiveCompletion() {
  if (running || typeof window === 'undefined') return stopAbilityPassiveCompletion
  running = true
  last = performance.now()
  accumulator = 0
  const loop = (now: number) => {
    if (!running) return
    accumulator += Math.min(0.1, (now - last) / 1000)
    last = now
    let steps = 0
    while (accumulator >= 1 / 30 && steps < 4) {
      tick(1 / 30)
      accumulator -= 1 / 30
      steps++
    }
    if (steps === 4) accumulator = Math.min(accumulator, 1 / 30)
    raf = window.requestAnimationFrame(loop)
  }
  raf = window.requestAnimationFrame(loop)
  return stopAbilityPassiveCompletion
}

export function stopAbilityPassiveCompletion() {
  running = false
  if (raf) window.cancelAnimationFrame(raf)
  raf = 0
  last = 0
  accumulator = 0
}

export function resetAbilityPassiveCompletion() {
  stopAbilityPassiveCompletion()
  berserkerMomentum = 0
  lastKills = 0
  harvestClaims = 0
  fortuneClaims = 0
}
