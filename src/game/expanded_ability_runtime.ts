import * as THREE from 'three'
import { enemies, gameState, getPlayer, spawnBurst, type Entity } from '../ecs/world'
import { abilities, rollDamage, synLevel, hasSynergy } from './abilities'
import { events } from './events'
import { onSimulationTick } from './simulation_clock'

const timers: Record<string, number> = Object.create(null)
const minePositions: THREE.Vector3[] = []
const mineLife: number[] = []
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
let running = false
let unsubscribeTick: (() => void) | undefined

const cooldown = (id: keyof typeof abilities, base: number, per: number, floor = 0.7) =>
  Math.max(floor, (base - abilities[id] * per) * (1 - Math.min(0.45, abilities.celerity * 0.012 + abilities.warlord * 0.01)))

function finite(v: number, fallback = 0): number { return Number.isFinite(v) ? v : fallback }

function damage(entity: Entity, base: number, player: Entity, element: 'physical'|'fire'|'ice'|'shock'|'poison'|'void' = 'physical'): number {
  if (entity.dead) return 0
  const roll = rollDamage(base, player)
  const amount = Math.max(1, finite(roll.value) - finite(entity.armor))
  entity.health = finite(entity.health, 0) - amount
  entity.hitFlash = 1
  entity.lastDmg = amount
  entity.lastCrit = roll.crit
  events.emit('combat:hit', { damage: amount, element, critical: roll.crit })
  if (entity.health <= 0) {
    const overkill = Math.max(0, -entity.health)
    entity.dead = true
    events.emit('combat:kill', { damage: amount, element, overkill, elite: Boolean((entity.enemyKind ?? 0) >= 3), boss: false })
  }
  return amount
}

function nearest(origin: THREE.Vector3, range: number, predicate?: (e: Entity) => boolean): Entity | undefined {
  let best: Entity | undefined
  let bestD2 = range * range
  for (const e of enemies.entities) {
    if (e.dead || (predicate && !predicate(e))) continue
    const d2 = e.position.distanceToSquared(origin)
    if (d2 < bestD2) { bestD2 = d2; best = e }
  }
  return best
}

function eachNearby(origin: THREE.Vector3, radius: number, fn: (e: Entity, d2: number) => void) {
  const r2 = radius * radius
  for (const e of enemies.entities) {
    if (e.dead) continue
    const d2 = e.position.distanceToSquared(origin)
    if (d2 <= r2) fn(e, d2)
  }
}

function tickActive(dt: number, player: Entity) {
  const position = player.position

  if (abilities.meteor > 0) {
    timers.meteor = (timers.meteor ?? 0) - dt
    if (timers.meteor <= 0) {
      timers.meteor = cooldown('meteor', 7.4, 0.38, 2.2)
      const target = nearest(position, 22)
      if (target) {
        const impactPosition = target.position.clone()
        const radius = 2.4 + abilities.meteor * 0.16 + synLevel('meteorstorm') * 0.18
        spawnBurst(impactPosition, 0xffd58a, 26, 3.5, 1.0)
        timers['meteor-impact'] = 0.42
        timers['meteor-x'] = impactPosition.x
        timers['meteor-z'] = impactPosition.z
        timers['meteor-radius'] = radius
      }
    }
  }

  if (timers['meteor-impact'] !== undefined) {
    timers['meteor-impact'] -= dt
    if (timers['meteor-impact'] <= 0) {
      const impact = tmp2.set(finite(timers['meteor-x']), 0, finite(timers['meteor-z']))
      const radius = Math.max(0.1, finite(timers['meteor-radius'], 2.4))
      delete timers['meteor-impact']; delete timers['meteor-x']; delete timers['meteor-z']; delete timers['meteor-radius']
      eachNearby(impact, radius, (e, d2) => {
        const falloff = 1 - Math.min(0.55, Math.sqrt(d2) / radius * 0.55)
        damage(e, (80 + abilities.meteor * 34) * falloff, player, 'fire')
        e.velocity.x += (e.position.x - impact.x) * 3
        e.velocity.z += (e.position.z - impact.z) * 3
      })
      spawnBurst(impact, hasSynergy('meteorstorm') ? 0xfff0b0 : 0xff7138, 46, 8, 0.9)
      gameState.shake = Math.min(1, gameState.shake + 0.72)
    }
  }

  if (abilities.gravitywell > 0) {
    timers.gravitywell = (timers.gravitywell ?? 0) - dt
    if (timers.gravitywell <= 0) {
      timers.gravitywell = cooldown('gravitywell', 6.8, 0.34, 2.0)
      const radius = 5.5 + abilities.gravitywell * 0.25
      eachNearby(position, radius, (e, d2) => {
        const d = Math.sqrt(d2) || 1
        const pull = Math.max(0, 1 - d / radius) * (8 + abilities.gravitywell * 0.8)
        e.velocity.x += (position.x - e.position.x) / d * pull
        e.velocity.z += (position.z - e.position.z) / d * pull
        damage(e, 18 + abilities.gravitywell * 10, player, 'void')
      })
      spawnBurst(position, 0x7a52c9, 34, 4.6, 0.9)
    }
  }

  if (abilities.soulbolts > 0) {
    timers.soulbolts = (timers.soulbolts ?? 0) - dt
    if (timers.soulbolts <= 0) {
      timers.soulbolts = cooldown('soulbolts', 3.8, 0.2, 1.0)
      const count = Math.min(8, 2 + abilities.soulbolts)
      const candidates = enemies.entities.filter((e) => !e.dead)
        .sort((a, b) => a.position.distanceToSquared(position) - b.position.distanceToSquared(position))
        .slice(0, count)
      for (const e of candidates) {
        const bonus = e.health < e.maxHealth * 0.35 ? 1.7 : 1
        damage(e, (22 + abilities.soulbolts * 11) * bonus, player, 'void')
        spawnBurst(e.position, 0xbca7ff, 7, 3, 0.35)
      }
    }
  }

  if (abilities.bladestorm > 0) {
    timers.bladestorm = (timers.bladestorm ?? 0) - dt
    if (timers.bladestorm <= 0) {
      timers.bladestorm = cooldown('bladestorm', 2.8, 0.12, 0.75)
      const radius = 3.3 + abilities.bladestorm * 0.18
      eachNearby(position, radius, (e, d2) => {
        const falloff = 1.15 - Math.min(0.35, Math.sqrt(d2) / radius * 0.35)
        damage(e, (30 + abilities.bladestorm * 16) * falloff, player, 'physical')
      })
      spawnBurst(position, 0xd6dce8, 28, 5.5, 0.45)
      gameState.shake = Math.min(1, gameState.shake + 0.18)
    }
  }

  if (abilities.arcanemine > 0) {
    timers.arcanemine = (timers.arcanemine ?? 0) - dt
    if (timers.arcanemine <= 0 && minePositions.length < Math.min(10, 2 + abilities.arcanemine)) {
      timers.arcanemine = 1.15
      const a = gameState.time * 1.7 + minePositions.length * 2.1
      minePositions.push(new THREE.Vector3(position.x + Math.cos(a) * 3.2, 0, position.z + Math.sin(a) * 3.2))
      mineLife.push(7)
    }
  }

  for (let i = minePositions.length - 1; i >= 0; i--) {
    mineLife[i] -= dt
    const mine = minePositions[i]
    let triggered = mineLife[i] <= 0
    if (!triggered) {
      for (const e of enemies.entities) {
        if (!e.dead && e.position.distanceToSquared(mine) < 1.35 * 1.35) { triggered = true; break }
      }
    }
    if (triggered) {
      const radius = 2.2 + abilities.arcanemine * 0.12
      eachNearby(mine, radius, (e, d2) => damage(e, (34 + abilities.arcanemine * 18) * (1 - Math.min(0.45, Math.sqrt(d2) / radius * 0.45)), player, 'shock'))
      spawnBurst(mine, 0xc39cff, 30, 5.2, 0.7)
      if (hasSynergy('arcblade')) spawnBurst(mine, 0x9fdcff, 18, 4, 0.4)
      minePositions.splice(i, 1); mineLife.splice(i, 1)
    }
  }

  if (abilities.bloodnova > 0) {
    timers.bloodnova = (timers.bloodnova ?? 0) - dt
    if (timers.bloodnova <= 0) {
      timers.bloodnova = cooldown('bloodnova', 9, 0.45, 2.6)
      const missing = Math.max(0, player.maxHealth - player.health)
      const radius = 4.3 + abilities.bloodnova * 0.22
      let total = 0
      eachNearby(position, radius, (e, d2) => {
        total += damage(e, 26 + abilities.bloodnova * 13 + missing * 0.28, player, 'bleed') * 0.2
      })
      player.health = Math.min(player.maxHealth, player.health + total)
      spawnBurst(position, 0xb51f3b, 38, 6, 0.8)
    }
  }

  if (abilities.voidrift > 0) {
    timers.voidrift = (timers.voidrift ?? 0) - dt
    if (timers.voidrift <= 0) {
      timers.voidrift = cooldown('voidrift', 5.5, 0.22, 1.6)
      const radius = 4 + abilities.voidrift * 0.2
      eachNearby(position, radius, (e) => {
        e.slow = Math.max(e.slow ?? 0, 1.3 + abilities.voidrift * 0.12)
        damage(e, 20 + abilities.voidrift * 9, player, 'void')
      })
      spawnBurst(position, 0x4d2c83, 42, 3.2, 1.0)
    }
  }

  if (abilities.mirrors > 0) {
    timers.mirrors = (timers.mirrors ?? 0) - dt
    if (timers.mirrors <= 0) {
      timers.mirrors = cooldown('mirrors', 4.1, 0.18, 1.0)
      const targets = enemies.entities.filter((e) => !e.dead)
        .sort((a, b) => a.position.distanceToSquared(position) - b.position.distanceToSquared(position))
        .slice(0, Math.min(3, 1 + abilities.mirrors))
      for (const e of targets) damage(e, 24 + abilities.mirrors * 12, player, 'physical')
      spawnBurst(position, 0xdce9ff, 20 + abilities.mirrors * 2, 4.5, 0.55)
    }
  }

  if (abilities.wolfpack > 0) {
    timers.wolfpack = (timers.wolfpack ?? 0) - dt
    if (timers.wolfpack <= 0) {
      timers.wolfpack = cooldown('wolfpack', 7.2, 0.3, 2.0)
      const count = Math.min(5, 1 + abilities.wolfpack)
      for (let i = 0; i < count; i++) {
        const targetEnemy = nearest(position, 12 + abilities.wolfpack * 0.4)
        if (!targetEnemy) break
        damage(targetEnemy, 30 + abilities.wolfpack * 14, player, 'physical')
        spawnBurst(targetEnemy.position, 0xb8c9de, 9, 3.8, 0.45)
      }
    }
  }

  if (abilities.seismic > 0) {
    timers.seismic = (timers.seismic ?? 0) - dt
    if (timers.seismic <= 0) {
      timers.seismic = cooldown('seismic', 6.2, 0.28, 1.8)
      const forwardX = finite(player.facingX)
      const forwardZ = finite(player.facingZ, 1)
      for (const e of enemies.entities) {
        if (e.dead) continue
        tmp.copy(e.position).sub(position); tmp.y = 0
        const dist = tmp.length()
        if (dist > 10 || dist < 0.2) continue
        tmp.normalize()
        const dot = tmp.x * forwardX + tmp.z * forwardZ
        if (dot < 0.4) continue
        damage(e, 28 + abilities.seismic * 14, player, 'physical')
        e.velocity.x += forwardX * 11
        e.velocity.z += forwardZ * 11
      }
      spawnBurst(tmp2.set(position.x + forwardX * 4.5, 0, position.z + forwardZ * 4.5), 0xb39a78, 30, 5, 0.7)
    }
  }

  if (abilities.runeprison > 0) {
    timers.runeprison = (timers.runeprison ?? 0) - dt
    if (timers.runeprison <= 0) {
      timers.runeprison = cooldown('runeprison', 10.5, 0.4, 3.2)
      const targetEnemy = nearest(position, 12, (e) => (e.enemyKind ?? 0) >= 2)
      if (targetEnemy) {
        const radius = 2.3 + abilities.runeprison * 0.12
        eachNearby(targetEnemy.position, radius, (e) => {
          e.slow = Math.max(e.slow ?? 0, 2.4)
          damage(e, 38 + abilities.runeprison * 17, player, 'void')
        })
        spawnBurst(targetEnemy.position, 0x8b66d9, 36, 4.8, 1.0)
      }
    }
  }

  if (abilities.frostfire > 0) {
    timers.frostfire = (timers.frostfire ?? 0) - dt
    if (timers.frostfire <= 0) {
      timers.frostfire = cooldown('frostfire', 5.8, 0.24, 1.7)
      const radius = 4.2 + abilities.frostfire * 0.18
      eachNearby(position, radius, (e) => {
        e.slow = Math.max(e.slow ?? 0, 1.8)
        damage(e, 18 + abilities.frostfire * 10, player, 'fire')
        damage(e, 11 + abilities.frostfire * 6, player, 'ice')
      })
      spawnBurst(position, 0xb5e9ff, 18, 4.0, 0.55)
      spawnBurst(position, 0xff7440, 18, 4.0, 0.55)
    }
  }
}

function tickPassive(dt: number, player: Entity) {
  if (abilities.ward > 0) {
    timers.ward = (timers.ward ?? 0) - dt
    if (timers.ward <= 0 && player.health < player.maxHealth) {
      timers.ward = Math.max(2.2, 5.2 - abilities.ward * 0.15)
      player.invuln = Math.max(player.invuln ?? 0, 0.18 + abilities.ward * 0.018)
      player.poise = Math.min(player.maxPoise, player.poise + 12 + abilities.ward * 5)
    }
  }
  if (abilities.overcharge > 0) {
    timers.overcharge = (timers.overcharge ?? 0) - dt
    if (timers.overcharge <= 0) {
      timers.overcharge = Math.max(3, 8 - abilities.overcharge * 0.25)
      eachNearby(player.position, 3.5 + abilities.overcharge * 0.15, (e) => damage(e, 14 + abilities.overcharge * 8, player, 'shock'))
      spawnBurst(player.position, 0x7dd8ff, 16 + abilities.overcharge, 4.2, 0.45)
    }
  }
  if (abilities.executioner > 0) {
    timers.executioner = (timers.executioner ?? 0) - dt
    if (timers.executioner <= 0) {
      timers.executioner = Math.max(0.45, 1.5 - abilities.executioner * 0.06)
      for (const e of enemies.entities) {
        if (!e.dead && e.health < e.maxHealth * (0.12 + abilities.executioner * 0.01)) {
          e.health = Math.max(0, e.health - (2 + abilities.executioner * 1.5))
          e.hitFlash = 1
          if (e.health <= 0) e.dead = true
        }
      }
    }
  }
  if (abilities.resilience > 0) player.poise = Math.min(player.maxPoise, player.poise + dt * (2 + abilities.resilience * 0.8))
  if (abilities.siphon > 0 && gameState.kills > 0) {
    timers.siphon = (timers.siphon ?? 0) - dt
    if (timers.siphon <= 0) {
      timers.siphon = Math.max(2.2, 7 - abilities.siphon * 0.35)
      player.health = Math.min(player.maxHealth, player.health + 2 + abilities.siphon)
    }
  }
  if (abilities.evasion > 0 && Math.hypot(player.velocity.x, player.velocity.z) > 6) player.invuln = Math.max(player.invuln ?? 0, Math.min(0.12, abilities.evasion * 0.012))
  if (abilities.conduit > 0) {
    timers.conduit = (timers.conduit ?? 0) - dt
    if (timers.conduit <= 0) {
      timers.conduit = Math.max(0.8, 2.8 - abilities.conduit * 0.08)
      for (const e of enemies.entities) {
        if (e.dead || (e.slow ?? 0) <= 0) continue
        const near = nearest(e.position, 2.8, (x) => x !== e)
        if (near) { near.slow = Math.max(near.slow ?? 0, 0.65); damage(near, 4 + abilities.conduit * 2, player, 'void') }
      }
    }
  }
  if (abilities.detonation > 0) {
    timers.detonation = (timers.detonation ?? 0) - dt
    if (timers.detonation <= 0) {
      timers.detonation = Math.max(0.7, 2.8 - abilities.detonation * 0.1)
      for (const e of enemies.entities) {
        if (!e.dead && e.lastCrit && e.health > 0) {
          damage(e, 10 + abilities.detonation * 6, player, 'fire')
          e.lastCrit = false
          spawnBurst(e.position, 0xffa85c, 8, 3, 0.35)
        }
      }
    }
  }
  if (abilities.fortunesfavor > 0 && gameState.kills > 0) {
    timers.fortunesfavor = (timers.fortunesfavor ?? 0) - dt
    if (timers.fortunesfavor <= 0) {
      timers.fortunesfavor = Math.max(5, 18 - abilities.fortunesfavor * 0.6)
      gameState.announceText = 'TALİH ELİNİ UZATTI'
      gameState.announceUntil = gameState.time + 1.8
    }
  }
  if (abilities.aegis > 0 && player.health < player.maxHealth * (0.25 + abilities.aegis * 0.01)) {
    timers.aegis = (timers.aegis ?? 0) - dt
    if (timers.aegis <= 0) {
      timers.aegis = Math.max(3, 9 - abilities.aegis * 0.3)
      player.invuln = Math.max(player.invuln ?? 0, 0.4 + abilities.aegis * 0.03)
      spawnBurst(player.position, 0x9cc8ff, 16, 3.6, 0.5)
    }
  }
  if (abilities.hemocraft > 0 && player.health < player.maxHealth * 0.6) {
    const hasteMul = 1 + Math.min(0.08, abilities.hemocraft * 0.008)
    player.velocity.x *= hasteMul
    player.velocity.z *= hasteMul
  }
  if (abilities.deathsmark > 0) {
    timers.deathsmark = (timers.deathsmark ?? 0) - dt
    if (timers.deathsmark <= 0) {
      timers.deathsmark = Math.max(1.2, 4 - abilities.deathsmark * 0.08)
      for (const e of enemies.entities) if (!e.dead && (e.age ?? 0) > 7) e.lastDmg = Math.max(e.lastDmg ?? 0, 1)
    }
  }
  if (abilities.soulharvest > 0 && gameState.kills > 0 && gameState.kills % 25 === 0) {
    const key = 'soulharvestClaim'
    if (!timers[key]) { timers[key] = 1; gameState.shake = Math.min(1, gameState.shake + 0.28); spawnBurst(player.position, 0xd9b8ff, 24, 4.8, 0.7) }
  } else if (gameState.kills % 25 !== 0) timers.soulharvestClaim = 0
}

function tick(dt: number) {
  if (gameState.phase !== 'playing') return
  const player = getPlayer()
  if (!player) return
  tickActive(dt, player)
  tickPassive(dt, player)
}

export function startExpandedAbilityRuntime() {
  if (running || typeof window === 'undefined') return stopExpandedAbilityRuntime
  running = true
  unsubscribeTick = onSimulationTick(tick)
  return stopExpandedAbilityRuntime
}

export function stopExpandedAbilityRuntime() {
  running = false
  unsubscribeTick?.()
  unsubscribeTick = undefined
}

export function resetExpandedAbilityRuntime() {
  stopExpandedAbilityRuntime()
  for (const key of Object.keys(timers)) delete timers[key]
  minePositions.length = 0
  mineLife.length = 0
}
