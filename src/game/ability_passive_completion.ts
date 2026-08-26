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

function tick(dt: number) {
  if (gameState.phase !== 'playing') return
  const player = getPlayer()
  if (!player) return

  // Berserker: combat dışında kaldıkça momentum biriktir; momentum hareket fiziğine gerçek ivme ekler.
  if (abilities.berserker > 0) {
    if (gameState.damageFlash > 0.05) {
      berserkerMomentum = Math.max(0, berserkerMomentum - dt * 2.8)
    } else {
      berserkerMomentum = Math.min(1, berserkerMomentum + dt * (0.12 + abilities.berserker * 0.018))
    }
    if (berserkerMomentum > 0) {
      const speed = Math.hypot(player.velocity.x, player.velocity.z)
      if (speed > 0.2) {
        const boost = 1 + berserkerMomentum * Math.min(0.18, abilities.berserker * 0.012)
        player.velocity.x *= boost
        player.velocity.z *= boost
      }
    }
  }

  // Precision: hareket halindeki saldırı ritmi sürekli daha kararlı hale gelir.
  // Burada doğrudan simülasyon state'ine mikro stabilizasyon uyguluyoruz; saldırı hasarı
  // merkezi rollDamage() tarafından hesaplandığından double-damage üretmez.
  if (abilities.precision > 0 && Math.hypot(player.velocity.x, player.velocity.z) > 0.5) {
    const damp = Math.max(0.84, 1 - abilities.precision * 0.006)
    player.velocity.x *= damp
    player.velocity.z *= damp
  }

  // Life Forge: maksimum can büyüdükçe güvenli rejenerasyon tabanı yükselir.
  if (abilities.lifeforge > 0 && player.health < player.maxHealth) {
    const forgeRate = Math.min(12, 0.7 + player.maxHealth * 0.006 + abilities.lifeforge * 0.45)
    player.health = Math.min(player.maxHealth, player.health + forgeRate * dt)
  }

  // Fortune's Favor: kilometre taşı ritmini gerçek ödüle bağlar; küçük ama sürekli XP bonusu.
  if (abilities.fortunesfavor > 0) {
    const milestone = Math.floor(gameState.kills / 25)
    if (milestone > 0 && milestone !== Math.floor((gameState.kills - 1) / 25)) {
      const bonus = 1 + Math.min(0.5, abilities.fortunesfavor * 0.035)
      gameState.xp += Math.max(1, Math.floor(2 * bonus))
      events.emit('loot:acquire', { kind: 'relic', rarity: abilities.fortunesfavor >= 8 ? 'epic' : 'rare' })
    }
  }

  // Soul Harvest: her 25 kesimde gerçek iyileştirme + tempo ödülü.
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
    while (accumulator >= 1 / 30) {
      tick(1 / 30)
      accumulator -= 1 / 30
    }
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
}
