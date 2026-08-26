import * as THREE from 'three'
import { abilities, applyAbility } from './abilities'
import { sfx } from './audio'
import {
  announce,
  enemies,
  ENEMY_KINDS,
  gameState,
  getPlayer,
  setPhase,
  spawnBurst,
  spawnEnemy,
  type Entity,
} from '../ecs/world'

export type EliteAffix = 'berserker' | 'vampiric' | 'armored' | 'splitter' | 'frozen' | 'volatile'
export type RunMutator = 'blood_moon' | 'ash_storm' | 'grave_tide' | 'iron_horde' | 'wild_magic'

interface Status {
  burn: number
  poison: number
  shock: number
  bleed: number
  freeze: number
  tick: number
}

interface Hazard {
  position: THREE.Vector3
  radius: number
  life: number
  tick: number
}

const eliteAffixes = new WeakMap<Entity, EliteAffix>()
const statuses = new WeakMap<Entity, Status>()
const hazards: Hazard[] = []
const bosses = new WeakSet<Entity>()

let running = false
let frameId = 0
let lastTime = 0
let lastWave = 0
let lastLevel = 1
let lastRelicLevel = 0
let lastShrineTime = 0
let currentMutator: RunMutator | null = null
let mutatorUntil = 0
let hazardTimer = 0
let statusTimer = 0
let bossTimer = 0
let overdriveTriggered = false

const MUTATORS: RunMutator[] = ['blood_moon', 'ash_storm', 'grave_tide', 'iron_horde', 'wild_magic']
const MUTATOR_AFFIX: EliteAffix[] = ['berserker', 'vampiric', 'armored', 'splitter', 'frozen', 'volatile']

function statusFor(entity: Entity): Status {
  let status = statuses.get(entity)
  if (!status) {
    status = { burn: 0, poison: 0, shock: 0, bleed: 0, freeze: 0, tick: 0 }
    statuses.set(entity, status)
  }
  return status
}

function scaledSpawn(player: Entity, elite = false, boss = false): Entity | undefined {
  const before = enemies.entities.length
  if (before >= 1400) return undefined
  spawnEnemy(player.position)
  const entity = enemies.entities[before]
  if (!entity) return undefined

  if (elite) {
    const affix = MUTATOR_AFFIX[Math.floor(Math.random() * MUTATOR_AFFIX.length)]
    eliteAffixes.set(entity, affix)
    const factor = 2.8 + Math.min(3, gameState.wave * 0.08)
    entity.health *= factor
    entity.maxHealth = entity.health
    entity.scale = (entity.scale ?? 1) * 1.38
    entity.damage = (entity.damage ?? 5) * 1.55
    entity.radius *= 1.12
  }

  if (boss) {
    bosses.add(entity)
    entity.health *= 18 + gameState.wave * 1.25
    entity.maxHealth = entity.health
    entity.scale = (entity.scale ?? 1) * 2.8
    entity.damage = (entity.damage ?? 5) * 2.4
    entity.radius *= 1.35
    entity.speed *= 0.8
  }

  return entity
}

function announceMutator(mutator: RunMutator) {
  const labels: Record<RunMutator, string> = {
    blood_moon: 'KANLI AY — DÜŞMANLAR ÇILGINCA HIZLANDI',
    ash_storm: 'KÜL FIRTINASI — KORLAR GÖRÜŞÜ BOĞUYOR',
    grave_tide: 'MEZAR GELGİTİ — SÜRÜ SIKLAŞTI',
    iron_horde: 'DEMİR SÜRÜ — ZIRHLI DÜŞMANLAR ÇOĞALIYOR',
    wild_magic: 'VAHŞİ BÜYÜ — ELEMENTAL HASAR SAPITTI',
  }
  announce(labels[mutator], 4)
  sfx.wave()
}

function rerollMutator() {
  currentMutator = MUTATORS[Math.floor(Math.random() * MUTATORS.length)]
  mutatorUntil = gameState.time + 32
  announceMutator(currentMutator)
}

function triggerBoss() {
  const player = getPlayer()
  if (!player) return
  const boss = scaledSpawn(player, false, true)
  if (!boss) return
  bossTimer = 0
  announce(`ELİT RUH MUHAFIZI — DALGA ${gameState.wave}`, 5)
  sfx.storm()
  spawnBurst(boss.position, 0xffb15c, 28, 7, 1)
}

function triggerElites(count: number) {
  const player = getPlayer()
  if (!player) return
  for (let i = 0; i < count; i++) {
    const elite = scaledSpawn(player, true, false)
    if (!elite) break
    spawnBurst(elite.position, 0xffcf75, 8, 3.8, 0.6)
  }
}

function triggerRelic() {
  const p = getPlayer()
  if (!p) return
  const relics = [
    () => {
      p.maxHealth += 30
      p.health = Math.min(p.maxHealth, p.health + 30)
      return 'KARA KALP — +30 AZAMİ CAN'
    },
    () => {
      p.speed *= 1.08
      return 'KÜL RÜZGÂRI — +%8 HAREKET HIZI'
    },
    () => {
      p.armor += 2
      return 'KIRILMAZ KABUK — +2 ZIRH'
    },
    () => {
      p.poise = p.maxPoise
      return 'SON NÖBET — DURUŞ TAMAMLANDI'
    },
    () => {
      applyAbility('mend')
      return 'KOR KALP — ANINDA ŞİFA'
    },
    () => {
      abilities.crit += 1
      return 'KEMİK GÖZ — +%12 KRİTİK ŞANSI'
    },
  ]
  const message = relics[Math.floor(Math.random() * relics.length)]()
  announce(`RELIC: ${message}`, 3.5)
  spawnBurst(p.position, 0xffc36a, 18, 4.5, 0.8)
  sfx.levelup()
}

function triggerShrine() {
  const p = getPlayer()
  if (!p) return
  const roll = Math.random()
  if (roll < 0.34) {
    p.health = p.maxHealth
    p.poise = p.maxPoise
    announce('KÜL TAPINAĞI — CAN VE DURUŞ TAMAMLANDI', 3)
  } else if (roll < 0.67) {
    p.invuln = Math.max(p.invuln ?? 0, 4)
    announce('BEKÇİNİN LÜTFU — 4 SN DOKUNULMAZLIK', 3)
  } else {
    abilities.ferocity += 2
    abilities.swift += 1
    announce('SAVAŞ TAPINAĞI — KALICI GÜÇ ARTTI', 3)
  }
  sfx.tier()
  spawnBurst(p.position, 0xe4c97d, 24, 5, 0.9)
}

function spawnHazard() {
  const p = getPlayer()
  if (!p) return
  const angle = Math.random() * Math.PI * 2
  const distance = 5 + Math.random() * 8
  hazards.push({
    position: new THREE.Vector3(
      p.position.x + Math.cos(angle) * distance,
      0.05,
      p.position.z + Math.sin(angle) * distance
    ),
    radius: 2.0 + Math.random() * 1.4,
    life: 12,
    tick: 0,
  })
}

function applyElementalStatuses(dt: number) {
  const p = getPlayer()
  if (!p || gameState.time < statusTimer) return
  statusTimer = gameState.time + 0.45
  const list = enemies.entities
  const limit = Math.min(list.length, 20)

  for (let i = 0; i < limit; i++) {
    const e = list[(i * 17 + gameState.wave) % list.length]
    if (!e || e.dead) continue
    const d2 = e.position.distanceToSquared(p.position)
    if (d2 > 1600) continue
    const status = statusFor(e)

    if (abilities.pyre > 0 && Math.random() < Math.min(0.9, 0.2 + abilities.pyre * 0.03)) {
      status.burn = Math.max(status.burn, 2 + abilities.pyre * 0.15)
    }
    if (abilities.venom > 0 && Math.random() < Math.min(0.85, 0.18 + abilities.venom * 0.035)) {
      status.poison = Math.max(status.poison, 2.5 + abilities.venom * 0.12)
    }
    if (abilities.frost > 0 && Math.random() < Math.min(0.8, 0.12 + abilities.frost * 0.025)) {
      status.freeze = Math.max(status.freeze, 1.5 + abilities.frost * 0.08)
    }
    if (abilities.storm > 0 && Math.random() < Math.min(0.7, 0.08 + abilities.storm * 0.018)) {
      status.shock = Math.max(status.shock, 1.2 + abilities.storm * 0.05)
    }
    if (abilities.ghoststep > 0 && gameState.combo >= 8 && Math.random() < 0.12) {
      status.bleed = Math.max(status.bleed, 2.5)
    }
  }

  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (e.dead) continue
    const s = statuses.get(e)
    if (!s) continue
    const multiplier = currentMutator === 'wild_magic' ? 1.35 : 1

    s.tick -= dt
    s.burn = Math.max(0, s.burn - dt)
    s.poison = Math.max(0, s.poison - dt)
    s.shock = Math.max(0, s.shock - dt)
    s.bleed = Math.max(0, s.bleed - dt)
    s.freeze = Math.max(0, s.freeze - dt)

    if (s.tick <= 0) {
      s.tick = 0.4
      const dot = (s.burn * 2.2 + s.poison * 1.5 + s.shock * 2.8 + s.bleed * 2.4) * multiplier
      if (dot > 0) {
        e.health -= dot
        e.lastDmg = dot
        e.lastCrit = false
        e.hitFlash = Math.max(e.hitFlash ?? 0, 0.45)
      }
      if (e.health <= 0) e.dead = true
    }

    if (s.freeze > 0) e.slow = Math.max(e.slow ?? 0, s.freeze)
  }
}

function tickElites(dt: number) {
  const p = getPlayer()
  if (!p) return
  const list = enemies.entities
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (e.dead) continue
    const affix = eliteAffixes.get(e)
    if (affix) {
      if (affix === 'berserker') {
        const missing = 1 - e.health / Math.max(1, e.maxHealth)
        e.speed = Math.max(e.speed, ENEMY_KINDS[e.enemyKind ?? 0].speed * (1 + missing * 1.8))
        e.damage = Math.max(e.damage ?? 0, ENEMY_KINDS[e.enemyKind ?? 0].dmg * (1 + missing * 1.2))
      } else if (affix === 'vampiric' && e.health < e.maxHealth * 0.85 && Math.random() < dt * 0.9) {
        e.health = Math.min(e.maxHealth, e.health + e.maxHealth * 0.018)
      } else if (affix === 'armored') {
        e.armor = Math.max(e.armor, 5 + Math.floor(gameState.wave * 0.25))
      } else if (affix === 'frozen') {
        e.speed = Math.max(e.speed, ENEMY_KINDS[e.enemyKind ?? 0].speed * 1.15)
      } else if (affix === 'volatile' && e.health < e.maxHealth * 0.25 && Math.random() < dt * 0.25) {
        const d2 = e.position.distanceToSquared(p.position)
        if (d2 < 25) {
          const damage = Math.max(2, 7 + gameState.wave * 0.8 - p.armor)
          p.health -= damage
          p.invuln = Math.max(p.invuln ?? 0, 0.12)
          gameState.damageFlash = Math.min(1, gameState.damageFlash + 0.22)
          spawnBurst(e.position, 0xff6b2b, 12, 4, 0.45)
          sfx.hurt()
        }
      }
    }

    if (bosses.has(e)) {
      bossTimer -= dt
      const ratio = e.health / Math.max(1, e.maxHealth)
      if (ratio < 0.66 && ratio >= 0.33) {
        e.speed = Math.max(e.speed, 2.1)
      } else if (ratio < 0.33) {
        e.speed = Math.max(e.speed, 2.7)
        e.damage = Math.max(e.damage ?? 0, ENEMY_KINDS[e.enemyKind ?? 0].dmg * 4)
      }

      if (bossTimer <= 0 && !e.dead) {
        bossTimer = ratio < 0.33 ? 5.5 : 8
        for (let n = 0; n < (ratio < 0.33 ? 5 : 3); n++) {
          const summoned = scaledSpawn(p, true, false)
          if (summoned) summoned.health *= 0.7
        }
        announce(ratio < 0.33 ? 'BOSS ÖFKELENDİ — YENİ MUHAFIZLAR GELİYOR' : 'BOSS ÇAĞIRIYOR — SÜRÜ YENİDEN DOĞUYOR', 2.5)
        spawnBurst(e.position, 0xff7438, 16, 4.5, 0.7)
      }
    }
  }
}

function tickHazards(dt: number) {
  const p = getPlayer()
  if (!p) return
  for (let i = hazards.length - 1; i >= 0; i--) {
    const hazard = hazards[i]
    hazard.life -= dt
    hazard.tick -= dt
    if (hazard.life <= 0) {
      hazards.splice(i, 1)
      continue
    }
    if (hazard.tick <= 0) {
      hazard.tick = 0.55
      const d2 = p.position.distanceToSquared(hazard.position)
      if (d2 < hazard.radius * hazard.radius && (p.invuln ?? 0) <= 0) {
        const damage = Math.max(1, 4 + gameState.wave * 0.35 - p.armor * 0.5)
        p.health -= damage
        p.regenDelay = 0
        gameState.damageFlash = Math.min(1, gameState.damageFlash + 0.18)
        spawnBurst(p.position, 0xd65032, 4, 2.4, 0.25)
      }
    }
    if (Math.random() < dt * 0.9) spawnBurst(hazard.position, 0xd65032, 1, 1.6, 0.3)
  }
}

function tickMilestones() {
  if (gameState.wave > lastWave) {
    lastWave = gameState.wave
    const eliteCount = gameState.wave < 3 ? 0 : 1 + Math.floor(gameState.wave / 7)
    if (eliteCount > 0) triggerElites(Math.min(4, eliteCount))
    if (gameState.wave % 5 === 0) triggerBoss()
    if (gameState.wave % 3 === 0) rerollMutator()
  }

  if (gameState.level > lastLevel) {
    lastLevel = gameState.level
    if (gameState.level >= 5 && gameState.level % 5 === 0 && gameState.level > lastRelicLevel) {
      lastRelicLevel = gameState.level
      triggerRelic()
    }
  }

  if (gameState.time >= lastShrineTime + 55) {
    lastShrineTime = gameState.time
    triggerShrine()
  }

  if (gameState.time >= hazardTimer + 18) {
    hazardTimer = gameState.time
    spawnHazard()
  }

  if (gameState.combo >= 30 && !overdriveTriggered) {
    overdriveTriggered = true
    const p = getPlayer()
    if (p) {
      p.invuln = Math.max(p.invuln ?? 0, 0.75)
      p.velocity.multiplyScalar(1.25)
      announce('KIZGINLIK — 30 COMBO AŞIRI YÜKLENME!', 2.5)
      spawnBurst(p.position, 0xffd36a, 32, 7, 0.9)
    }
  }
  if (gameState.combo < 10) overdriveTriggered = false

  if (currentMutator && gameState.time >= mutatorUntil) {
    currentMutator = null
    announce('MUTASYON SONA ERDİ — SÜRÜ NORMALLEŞİYOR', 2)
  }
}

function applyGlobalMutator(dt: number) {
  const p = getPlayer()
  if (!p || !currentMutator) return
  switch (currentMutator) {
    case 'blood_moon':
      for (const e of enemies.entities) {
        if (!e.dead) {
          const base = ENEMY_KINDS[e.enemyKind ?? 0]
          e.speed = Math.max(e.speed, base.speed * 1.28)
          e.damage = Math.max(e.damage ?? 0, base.dmg * 1.35)
        }
      }
      break
    case 'grave_tide':
      if (Math.random() < dt * 0.3) {
        for (let i = 0; i < 2; i++) scaledSpawn(p, false, false)
      }
      break
    case 'iron_horde':
      for (const e of enemies.entities) {
        if (!e.dead) e.armor = Math.max(e.armor, 2 + Math.floor(gameState.wave * 0.18))
      }
      break
    case 'ash_storm':
      if (Math.random() < dt * 0.55) spawnBurst(p.position, 0xb67b55, 2, 1.8, 0.25)
      break
    case 'wild_magic':
      if (Math.random() < dt * 0.18) {
        const e = enemies.entities[Math.floor(Math.random() * enemies.entities.length)]
        if (e && !e.dead) {
          e.velocity.multiplyScalar(1.4)
          e.health -= 3 + abilities.storm + abilities.pyre
        }
      }
      break
  }
}

function resetState() {
  hazards.length = 0
  currentMutator = null
  lastWave = 0
  lastLevel = 1
  lastRelicLevel = 0
  lastShrineTime = 0
  hazardTimer = 0
  statusTimer = 0
  bossTimer = 0
  overdriveTriggered = false
  for (const e of enemies.entities) {
    statuses.delete(e)
    eliteAffixes.delete(e)
  }
}

export function resetRunDirector() {
  resetState()
}

export function startRunDirector() {
  if (running || typeof window === 'undefined') return () => undefined
  running = true
  lastTime = performance.now()
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000))
    lastTime = now

    if (gameState.phase === 'playing') {
      tickMilestones()
      applyElementalStatuses(dt)
      tickElites(dt)
      tickHazards(dt)
      applyGlobalMutator(dt)

      const p = getPlayer()
      if (p && p.health <= 0) {
        p.health = 0
        setPhase('dead')
        sfx.die()
      }
    }

    frameId = window.requestAnimationFrame(loop)
  }
  frameId = window.requestAnimationFrame(loop)
  return () => stopRunDirector()
}

export function stopRunDirector() {
  running = false
  if (frameId) window.cancelAnimationFrame(frameId)
  frameId = 0
}
