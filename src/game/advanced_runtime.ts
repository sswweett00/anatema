import * as THREE from 'three'
import { abilities } from './abilities'
import { sfx } from './audio'
import {
  announce,
  enemies,
  gameState,
  getPlayer,
  spawnBurst,
  type Entity,
} from '../ecs/world'

/**
 * İleri savaş katmanı.
 * Ana ECS döngüsünün üstünde hafif bir karar katmanı çalıştırır:
 * - Execute / execution chain
 * - Elemental resonance arketipleri
 * - Combo tier / overcharge
 * - Risk-reward kan hızı pencereleri
 * - Yakın tehdit baskısı ve otomatik stagger
 *
 * Her şey mutatif tutulur; React state kullanılmaz.
 */

type Resonance = 'pyro' | 'cryo' | 'storm' | 'venom' | 'void' | 'iron' | 'blood'

let running = false
let frame = 0
let last = 0
let executeCooldown = 0
let resonanceCooldown = 0
let overchargeCooldown = 0
let lastTier = 0
let lastResonance: Resonance | null = null

const resonanceColors: Record<Resonance, number> = {
  pyro: 0xff632f,
  cryo: 0x8fd8ff,
  storm: 0xcfeeff,
  venom: 0x6fd889,
  void: 0xa995ff,
  iron: 0xd0b991,
  blood: 0xd52e38,
}

function ownedLevel(id: keyof typeof abilities) {
  return abilities[id]
}

function highestResonance(): Resonance | null {
  let best: Resonance | null = null
  let value = 0
  const candidates: Array<[Resonance, number]> = [
    ['pyro', ownedLevel('pyre') + ownedLevel('nova') * 0.8],
    ['cryo', ownedLevel('frost') + ownedLevel('orbit') * 0.6],
    ['storm', ownedLevel('storm') + ownedLevel('chain') * 0.6],
    ['venom', ownedLevel('venom') + ownedLevel('harvest') * 0.35],
    ['void', ownedLevel('vortex') + ownedLevel('phantom') * 0.6 + ownedLevel('ghoststep') * 0.25],
    ['iron', ownedLevel('armor') + ownedLevel('stone') * 0.8 + ownedLevel('bulwark') * 0.5],
    ['blood', ownedLevel('rage') + ownedLevel('vamp') * 0.8 + ownedLevel('ferocity') * 0.5],
  ]
  for (const [id, score] of candidates) {
    if (score > value) {
      value = score
      best = id
    }
  }
  return value > 0 ? best : null
}

function tierForCombo(combo: number) {
  if (combo >= 100) return 5
  if (combo >= 60) return 4
  if (combo >= 30) return 3
  if (combo >= 15) return 2
  if (combo >= 5) return 1
  return 0
}

function executeEnemy(e: Entity, player: Entity, multiplier: number) {
  const damage = Math.max(1, e.maxHealth * 0.34 * multiplier)
  e.health -= damage
  e.hitFlash = 1
  e.lastDmg = damage
  e.lastCrit = true
  if (e.health <= 0) e.dead = true
  player.health = Math.min(player.maxHealth, player.health + 1.5 + abilities.vamp * 0.2)
  gameState.shake = Math.min(1, gameState.shake + 0.32)
  spawnBurst(e.position, 0xffe2a2, 10, 5.5, 0.45)
  sfx.crit()
}

function applyResonance(resonance: Resonance, dt: number) {
  const player = getPlayer()
  if (!player) return
  const list = enemies.entities
  const level = Math.max(1, Math.floor(
    resonance === 'pyro' ? abilities.pyre + abilities.nova * 0.7 :
    resonance === 'cryo' ? abilities.frost + abilities.orbit * 0.5 :
    resonance === 'storm' ? abilities.storm + abilities.chain * 0.5 :
    resonance === 'venom' ? abilities.venom + abilities.harvest * 0.35 :
    resonance === 'void' ? abilities.vortex + abilities.phantom * 0.5 :
    resonance === 'iron' ? abilities.armor + abilities.stone * 0.8 :
    abilities.rage + abilities.vamp * 0.7
  ))

  const radius = 5.5 + Math.min(6, level * 0.38)
  const radius2 = radius * radius
  const dps = 1.2 + level * 0.55

  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (e.dead) continue
    const d2 = e.position.distanceToSquared(player.position)
    if (d2 > radius2) continue

    switch (resonance) {
      case 'pyro':
        e.health -= dps * dt
        e.velocity.x += (e.position.x - player.position.x) * 0.001 * level
        break
      case 'cryo':
        e.slow = Math.max(e.slow ?? 0, 0.55 + level * 0.05)
        e.health -= dps * 0.7 * dt
        break
      case 'storm':
        e.health -= dps * 0.8 * dt
        e.velocity.multiplyScalar(Math.max(0.82, 1 - 0.002 * level))
        break
      case 'venom':
        e.health -= dps * 1.1 * dt
        if (e.health < e.maxHealth * 0.2) e.speed *= 1 - Math.min(0.0015, dt * 0.02 * level)
        break
      case 'void': {
        const pull = Math.min(9, 2.5 + level * 0.3) * dt
        e.velocity.x += (player.position.x - e.position.x) * pull / Math.max(1, Math.sqrt(d2))
        e.velocity.z += (player.position.z - e.position.z) * pull / Math.max(1, Math.sqrt(d2))
        e.health -= dps * 0.9 * dt
        break
      }
      case 'iron':
        if (d2 < 8 * 8) e.velocity.multiplyScalar(Math.max(0.7, 1 - dt * 0.4))
        break
      case 'blood':
        e.health -= dps * 0.75 * dt
        break
    }

    if (e.health <= 0) e.dead = true
  }

  resonanceCooldown -= dt
  if (resonanceCooldown <= 0) {
    resonanceCooldown = Math.max(0.7, 2.1 - level * 0.06)
    spawnBurst(player.position, resonanceColors[resonance], 3 + Math.min(9, level), 2.1, 0.32)
  }
}

function tick(dt: number) {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return

  const tier = tierForCombo(gameState.combo)
  if (tier !== lastTier) {
    lastTier = tier
    if (tier >= 1) announce(`SAVAŞ RİTMİ ${tier} — COMBO REZONANSI AKTİF`, 1.5)
    if (tier >= 3) {
      player.invuln = Math.max(player.invuln ?? 0, 0.18)
      gameState.shake = Math.min(1, gameState.shake + 0.2)
      spawnBurst(player.position, 0xffd36a, 12 + tier * 3, 4 + tier, 0.5)
      sfx.crit()
    }
  }

  const resonance = highestResonance()
  if (resonance && resonance !== lastResonance) {
    lastResonance = resonance
    announce(`${resonance.toUpperCase()} REZONANSI — ELEMENTAL UYUM`, 1.8)
  }
  if (resonance) applyResonance(resonance, dt)

  executeCooldown -= dt
  const executeThreshold = 0.09 - Math.min(0.055, abilities.execute * 0.005)
  if (executeCooldown <= 0 && gameState.combo >= 15) {
    executeCooldown = 0.32
    const executeBoost = 1 + Math.min(1.5, (gameState.combo - 15) * 0.015)
    const enemiesNear = enemies.entities
    for (let i = 0; i < enemiesNear.length; i++) {
      const e = enemiesNear[i]
      if (e.dead || e.maxHealth <= 0) continue
      if (e.health / e.maxHealth <= executeThreshold) {
        executeEnemy(e, player, executeBoost)
        break
      }
    }
  }

  overchargeCooldown -= dt
  if (gameState.combo >= 50 && overchargeCooldown <= 0) {
    overchargeCooldown = 12
    const haste = Math.min(2, 1 + abilities.adrenaline * 0.08 + gameState.combo * 0.003)
    player.velocity.multiplyScalar(1.18)
    player.invuln = Math.max(player.invuln ?? 0, 1.1)
    gameState.shake = 1
    gameState.damageFlash = Math.min(1, gameState.damageFlash + 0.15)
    announce(`OVERCHARGE ×${haste.toFixed(2)} — SAVAŞ ALANINI YAK`, 2.3)
    spawnBurst(player.position, 0xffd36a, 40, 8, 0.9)
    sfx.storm()
  }

  // Yakın tehdit baskısı: kalabalık arttıkça kısa bir poise karşılığı kazanılır.
  if (abilities.bulwark > 0) {
    let nearby = 0
    for (let i = 0; i < enemies.entities.length && nearby < 20; i++) {
      const e = enemies.entities[i]
      if (!e.dead && e.position.distanceToSquared(player.position) < 25) nearby++
    }
    if (nearby >= 8) player.poise = Math.min(player.maxPoise, player.poise + dt * (2 + nearby * 0.12) * abilities.bulwark)
  }
}

export function startAdvancedRuntime() {
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
  return stopAdvancedRuntime
}

export function stopAdvancedRuntime() {
  running = false
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
  executeCooldown = 0
  resonanceCooldown = 0
  overchargeCooldown = 0
  lastTier = 0
  lastResonance = null
}

export function resetAdvancedRuntime() {
  executeCooldown = 0
  resonanceCooldown = 0
  overchargeCooldown = 0
  lastTier = 0
  lastResonance = null
}
