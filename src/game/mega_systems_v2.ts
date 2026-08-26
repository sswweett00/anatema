import * as THREE from 'three'
import { abilities } from './abilities'
import { sfx } from './audio'
import {
  announce,
  enemies,
  gameState,
  getPlayer,
  particles,
  spawnBurst,
  spawnEnemy,
  type Entity,
} from '../ecs/world'

export interface MegaFeature { id: number; name: string; description: string }

export const MEGA_FEATURES: MegaFeature[] = [
  { id: 1, name: 'Execution Chain', description: 'Zayıf hedefleri art arda infaz eder ve zinciri uzatır.' },
  { id: 2, name: 'Overkill Burst', description: 'Aşırı öldürme hasarını yakındaki düşmanlara taşır.' },
  { id: 3, name: 'Revenge Window', description: 'Hasar sonrası kısa süreli saldırı temposu verir.' },
  { id: 4, name: 'Near-Death Frenzy', description: 'Düşük canla gerçek hız ve güç artışı sağlar.' },
  { id: 5, name: 'Perfect Dodge Charge', description: 'Dokunulmazlık süresi enerji biriktirip combo uzatır.' },
  { id: 6, name: 'Threat Pressure', description: 'Yakın sürü yoğunluğu poise ve hareket bonusu üretir.' },
  { id: 7, name: 'Armor Break', description: 'Kritik seri geçici zırh kırılması uygular.' },
  { id: 8, name: 'Crit Echo', description: 'Kritik darbeyi gecikmeli yankı hasarına dönüştürür.' },
  { id: 9, name: 'Status Detonation', description: 'Çoklu status stack patlaması oluşturur.' },
  { id: 10, name: 'Freeze Shatter', description: 'Donmuş hedef ağır darbede parçalanır.' },
  { id: 11, name: 'Burn Spread', description: 'Yanma yakındaki hedeflere yayılır.' },
  { id: 12, name: 'Shock Chain', description: 'Şok komşu hedeflere zincirlenir.' },
  { id: 13, name: 'Poison Rupture', description: 'Düşük canlı zehirli hedefler patlar.' },
  { id: 14, name: 'Bleed Siphon', description: 'Kanayan hedefler vuruldukça iyileştirme sağlar.' },
  { id: 15, name: 'Void Implosion', description: 'Void alanı sürüyü merkeze çeker ve hasar verir.' },
  { id: 16, name: 'Elemental Overdrive', description: 'Baskın element seviye ile yeni yoğunluk kazanır.' },
  { id: 17, name: 'Combo Time Extension', description: 'Yüksek combo aktifken combo süresi kademeli uzar.' },
  { id: 18, name: 'Adaptive Difficulty', description: 'Run performansına göre spawn baskısı ayarlanır.' },
  { id: 19, name: 'Elite Aura', description: 'Elite ve boss çevresinde gerçek aura buff/debuff çalışır.' },
  { id: 20, name: 'Boss Phase Shockwave', description: 'Boss faz geçişleri gerçek alan şoku üretir.' },
  { id: 21, name: 'Boss Soft Enrage', description: 'Boss savaşı uzadıkça kademeli güçlenir.' },
  { id: 22, name: 'Swarm Formations', description: 'Dalga eşiklerinde kanat ve çember formasyonları oluşur.' },
  { id: 23, name: 'Hazard Evolution', description: 'Süre ilerledikçe hazardlar büyür ve sıklaşır.' },
  { id: 24, name: 'Mutator Escalation', description: 'Dalga ilerledikçe global tehdit katmanı yükselir.' },
  { id: 25, name: 'Shrine Gambit', description: 'Risk yüksekken shrine ödülleri güçlenir.' },
  { id: 26, name: 'Relic Resonance', description: 'Her relic eşiği set benzeri kalıcı bonus üretir.' },
  { id: 27, name: 'Momentum Banking', description: 'Hareket hızını biriktirip saldırı patlamasına dönüştürür.' },
  { id: 28, name: 'Magnet Surge', description: 'Wisp/XP ruhlarını gerçek zamanlı olarak oyuncuya çeker.' },
  { id: 29, name: 'Last Stand Charge', description: 'Uzun hasarsızlık ikinci şansı yeniden doldurur.' },
  { id: 30, name: 'Arena Pulse', description: 'Arena aralıklarla tüm sürüye enerji darbesi uygular.' },
  { id: 31, name: 'Kill Streak Rewards', description: 'Kesim eşikleri gerçek mikro ödüller verir.' },
  { id: 32, name: 'Risk Heat', description: 'Düşük can ve yüksek combo somut risk bonusuna dönüşür.' },
  { id: 33, name: 'Ascension Threshold', description: 'Uzun run geçici çoklu-sistem güçlenmesi açar.' },
]

interface Reaction {
  burn: number
  poison: number
  shock: number
  bleed: number
  freeze: number
  armorBreak: number
}

interface Hazard { position: THREE.Vector3; radius: number; life: number; tick: number }

const reactions = new WeakMap<Entity, Reaction>()
const processedDeaths = new WeakSet<Entity>()
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const hazards: Hazard[] = []

const state = {
  running: false,
  frame: 0,
  last: 0,
  elapsedSinceHit: 0,
  revenge: 0,
  dodgeCharge: 0,
  echoTimer: 0,
  detonateTimer: 0,
  adaptive: 1,
  lastWave: 0,
  streakTier: 0,
  lastBossRatio: 1,
  bossFightTime: 0,
  ascension: 0,
  ascensionPulse: 0,
  lastHitHp: 100,
  executionChain: 0,
  executionWindow: 0,
  momentumBank: 0,
  momentumTimer: 0,
  hazardTimer: 0,
  mutatorLevel: 0,
  shrineTimer: 0,
  relicTier: 0,
  lastLevel: 1,
  lastStandCooldown: 0,
  arenaPulseTimer: 0,
  magnetPulse: 0,
  lastBossPulse: 0,
}

function reaction(e: Entity): Reaction {
  let r = reactions.get(e)
  if (!r) {
    r = { burn: 0, poison: 0, shock: 0, bleed: 0, freeze: 0, armorBreak: 0 }
    reactions.set(e, r)
  }
  return r
}

function aliveCount(radius: number, center: Entity): number {
  const r2 = radius * radius
  let count = 0
  for (const e of enemies.entities) {
    if (!e.dead && e.position.distanceToSquared(center.position) <= r2) count++
  }
  return count
}

function nearAlive(origin: Entity, radius: number, max = 8): Entity[] {
  const result: Entity[] = []
  const r2 = radius * radius
  for (const e of enemies.entities) {
    if (e.dead || e === origin) continue
    if (e.position.distanceToSquared(origin.position) <= r2) {
      result.push(e)
      if (result.length >= max) break
    }
  }
  return result
}

function riskHeat(player: Entity): number {
  const hpRisk = 1 - player.health / Math.max(1, player.maxHealth)
  const comboRisk = Math.min(1, gameState.combo / 120)
  return Math.min(1, hpRisk * 0.7 + comboRisk * 0.3)
}

function dominantElement(): 'pyro' | 'cryo' | 'storm' | 'venom' | 'void' | 'iron' | 'blood' | null {
  const values: Array<['pyro' | 'cryo' | 'storm' | 'venom' | 'void' | 'iron' | 'blood', number]> = [
    ['pyro', abilities.pyre + abilities.nova * 0.8],
    ['cryo', abilities.frost + abilities.orbit * 0.6],
    ['storm', abilities.storm + abilities.chain * 0.6],
    ['venom', abilities.venom + abilities.harvest * 0.3],
    ['void', abilities.vortex + abilities.phantom * 0.6 + abilities.ghoststep * 0.25],
    ['iron', abilities.armor + abilities.stone * 0.8 + abilities.bulwark * 0.5],
    ['blood', abilities.rage + abilities.vamp * 0.8 + abilities.ferocity * 0.5],
  ]
  let best: typeof values[number][0] | null = null
  let score = 0
  for (const [id, value] of values) {
    if (value > score) {
      score = value
      best = id
    }
  }
  return best
}

function seedStatusReactions(dt: number) {
  const element = dominantElement()
  if (!element) return
  for (const e of enemies.entities) {
    if (e.dead) continue
    const dist = e.position.distanceToSquared(getPlayer()?.position ?? e.position)
    if (dist > 22 * 22) continue
    const r = reaction(e)
    const chance = Math.min(0.65, dt * (0.7 + gameState.combo * 0.004))
    if (Math.random() > chance) continue
    switch (element) {
      case 'pyro': r.burn = Math.max(r.burn, 1.2 + abilities.pyre * 0.08); break
      case 'cryo': r.freeze = Math.max(r.freeze, 0.9 + abilities.frost * 0.05); break
      case 'storm': r.shock = Math.max(r.shock, 1.0 + abilities.storm * 0.04); break
      case 'venom': r.poison = Math.max(r.poison, 1.4 + abilities.venom * 0.08); break
      case 'void': r.bleed = Math.max(r.bleed, 1.2 + abilities.vortex * 0.05); break
      case 'iron': r.armorBreak = Math.max(r.armorBreak, 0.8); break
      case 'blood': r.bleed = Math.max(r.bleed, 1.4 + abilities.rage * 0.06); break
    }
  }
}

function processStatusReactions(dt: number) {
  const player = getPlayer()
  if (!player) return
  state.detonateTimer -= dt
  for (const e of enemies.entities) {
    if (e.dead) continue
    const r = reaction(e)
    r.burn = Math.max(0, r.burn - dt)
    r.poison = Math.max(0, r.poison - dt)
    r.shock = Math.max(0, r.shock - dt)
    r.bleed = Math.max(0, r.bleed - dt)
    r.freeze = Math.max(0, r.freeze - dt)
    r.armorBreak = Math.max(0, r.armorBreak - dt)

    if (r.burn > 0 && Math.random() < dt * 1.2) {
      e.health -= (1.5 + abilities.pyre * 0.35) * (1 + state.ascension * 0.04)
      for (const n of nearAlive(e, 1.8, 2)) reaction(n).burn = Math.max(reaction(n).burn, 0.8)
      spawnBurst(e.position, 0xff6b2e, 1, 1.4, 0.18)
    }
    if (r.poison > 0 && Math.random() < dt * 1.4) {
      e.health -= 1.2 + abilities.venom * 0.28
      if (e.health / Math.max(1, e.maxHealth) < 0.2) {
        for (const n of nearAlive(e, 2.2, 3)) reaction(n).poison = Math.max(reaction(n).poison, 0.8)
      }
    }
    if (r.shock > 0 && Math.random() < dt * 1.6) {
      const n = nearAlive(e, 2.4, 1)[0]
      if (n) {
        reaction(n).shock = Math.max(reaction(n).shock, 0.75)
        n.health -= 2 + abilities.storm * 0.4
        spawnBurst(n.position, 0xbfe8ff, 2, 2, 0.2)
      }
    }
    if (r.bleed > 0 && e.lastDmg) {
      player.health = Math.min(player.maxHealth, player.health + Math.min(1.2, e.lastDmg * 0.006) * dt * 4)
    }
    if (r.freeze > 0) e.slow = Math.max(e.slow ?? 0, 0.55)

    const stacks = Number(r.burn > 0) + Number(r.poison > 0) + Number(r.shock > 0) + Number(r.bleed > 0) + Number(r.freeze > 0)
    if (stacks >= 2 && state.detonateTimer <= 0) {
      state.detonateTimer = 0.2
      e.health -= 2 + stacks * 1.6 + abilities.ferocity * 0.45
      e.hitFlash = 1
      spawnBurst(e.position, r.freeze > 0 ? 0x9fdcff : 0xffb15c, 3 + stacks, 2.7, 0.24)
      if (stacks >= 4) {
        e.velocity.multiplyScalar(1.2)
        announce('ELEMENTAL REAKSİYON', 0.8)
      }
    }

    if (e.lastCrit) r.armorBreak = Math.max(r.armorBreak, 0.65 + abilities.crit * 0.03)
    if (r.armorBreak > 0) e.armor = Math.max(0, e.armor - Math.ceil(abilities.crit * 0.18))

    if (r.freeze > 0 && (e.lastDmg ?? 0) > e.maxHealth * 0.045) {
      e.health -= Math.max(1, (e.lastDmg ?? 0) * 0.12)
      r.freeze = 0
      spawnBurst(e.position, 0x9fdcff, 8, 4.2, 0.3)
    }
    if (e.health <= 0) e.dead = true
  }
}

function executeChain() {
  const player = getPlayer()
  if (!player || gameState.combo < 8) return
  state.executionWindow = Math.max(0, state.executionWindow - 1 / 60)
  if (state.executionWindow > 0 && state.executionChain <= 0) return
  const threshold = 0.07 + Math.min(0.09, gameState.combo * 0.0008)
  const chainLimit = Math.min(5, 1 + Math.floor(gameState.combo / 25))
  let executed = 0
  for (const e of enemies.entities) {
    if (executed >= chainLimit) break
    if (e.dead || e.maxHealth <= 0 || e.health / e.maxHealth > threshold) continue
    e.dead = true
    e.lastDmg = e.maxHealth * 1.05
    e.lastCrit = true
    executed++
  }
  if (executed > 0) {
    state.executionChain = executed
    state.executionWindow = 0.7
    player.invuln = Math.max(player.invuln ?? 0, 0.12)
    spawnBurst(player.position, 0xffe2a2, 5 + executed * 3, 4.2, 0.35)
  }
}

/** Called from EnemySwarm exactly once before a dead entity is removed. */
export function onEnemyKilled(e: Entity, player: Entity) {
  if (processedDeaths.has(e)) return
  processedDeaths.add(e)

  if (e.lastDmg !== undefined && e.lastDmg > e.maxHealth) {
    const excess = Math.min(e.maxHealth * 0.85, e.lastDmg - e.maxHealth)
    let spread = 0
    for (const other of enemies.entities) {
      if (spread >= 5 || other.dead || other === e) continue
      if (other.position.distanceToSquared(e.position) <= 3.8 * 3.8) {
        other.health -= excess * (1 - spread * 0.12)
        other.hitFlash = 1
        spread++
      }
    }
    if (spread > 0) {
      spawnBurst(e.position, 0xffb15c, 8 + spread * 3, 5.2, 0.45)
      gameState.shake = Math.min(1, gameState.shake + 0.2)
    }
  }

  if (gameState.combo >= 8) {
    state.executionChain = Math.min(5, state.executionChain + 1)
    state.executionWindow = 0.65
  }

  const streak = Math.floor(gameState.kills / 25)
  if (streak > state.streakTier) {
    state.streakTier = streak
    const bonus = 5 + streak * 2
    player.health = Math.min(player.maxHealth, player.health + bonus)
    player.poise = Math.min(player.maxPoise, player.poise + 8 + streak)
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.45)
    if (streak % 2 === 0) abilities.ferocity += 1
    announce(`${streak * 25} KESİM — SAVAŞ ÖDÜLÜ`, 1.2)
    spawnBurst(player.position, 0xffd15e, 8 + streak * 2, 3.2, 0.32)
  }
}

function revengeAndDodge(dt: number) {
  const player = getPlayer()
  if (!player) return
  state.elapsedSinceHit += dt
  if (player.health < state.lastHitHp - 0.1) {
    state.revenge = 2.4
    state.elapsedSinceHit = 0
  }
  state.lastHitHp = player.health
  state.revenge = Math.max(0, state.revenge - dt)
  if (state.revenge > 0) {
    player.speed *= 1 + dt * (0.1 + abilities.rage * 0.002)
    player.invuln = Math.max(player.invuln ?? 0, 0.01)
  }

  if ((player.invuln ?? 0) > 0) state.dodgeCharge = Math.min(100, state.dodgeCharge + dt * (22 + abilities.swift * 1.2))
  if (state.dodgeCharge >= 100) {
    state.dodgeCharge = 0
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.8)
    player.invuln = Math.max(player.invuln ?? 0, 0.28)
    spawnBurst(player.position, 0x9fdcff, 10, 3.5, 0.32)
  }

  if (state.elapsedSinceHit > 26 && player.lastStandUsed) {
    state.lastStandCooldown = 0
    player.lastStandUsed = false
    announce('SON DİRENİŞ YENİDEN HAZIR', 1.6)
  }
}

function threatAndRisk(dt: number) {
  const player = getPlayer()
  if (!player) return
  const nearby = aliveCount(4, player)
  if (nearby >= 8) {
    const pressure = Math.min(1, nearby / 20)
    player.poise = Math.min(player.maxPoise, player.poise + dt * (1.4 + pressure * 3 + abilities.bulwark))
    player.speed *= 1 + dt * pressure * 0.03
  }

  const heat = riskHeat(player)
  if (heat > 0.7) {
    player.speed *= 1 + dt * (0.045 + abilities.rage * 0.001)
    if (gameState.combo >= 20) player.health = Math.min(player.maxHealth, player.health + dt * (0.45 + abilities.harvest * 0.08))
    if (Math.random() < dt * 0.08 * heat) gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.15)
  }
}

function eliteAndBossAuras(dt: number) {
  const player = getPlayer()
  if (!player) return
  let boss: Entity | undefined
  for (const e of enemies.entities) {
    if (e.dead) continue
    const elite = (e.scale ?? 1) >= 1.18
    const isBoss = (e.scale ?? 1) >= 2.5 || e.maxHealth >= 400
    if (isBoss) boss = e
    if (!elite) continue
    const auraR2 = (isBoss ? 7.5 : 4.8) ** 2
    for (const other of enemies.entities) {
      if (other.dead || other === e) continue
      if (other.position.distanceToSquared(e.position) <= auraR2) {
        other.speed = Math.max(other.speed, other.speed * (1 + dt * (isBoss ? 0.12 : 0.045)))
        other.damage = (other.damage ?? 0) + dt * (isBoss ? 0.28 : 0.08)
      }
    }
    if (Math.random() < dt * 0.35) spawnBurst(e.position, isBoss ? 0xd52e38 : 0xffc36a, 1, 1.2, 0.2)
  }

  if (boss) {
    const ratio = boss.health / Math.max(1, boss.maxHealth)
    state.bossFightTime += dt
    if (ratio < 0.66 && state.lastBossRatio >= 0.66) {
      const r = 8
      for (const e of enemies.entities) {
        if (!e.dead && e.position.distanceToSquared(boss.position) < r * r) e.velocity.addScaledVector(tmp.subVectors(e.position, boss.position).normalize(), 4)
      }
      player.invuln = Math.max(player.invuln ?? 0, 0.4)
      spawnBurst(boss.position, 0xff9a4d, 28, 6.5, 0.6)
      announce('BOSS FAZI II — ŞOK DALGASI', 1.8)
      sfx.storm()
    }
    if (ratio < 0.33 && state.lastBossRatio >= 0.33) {
      player.health = Math.max(1, player.health - 6)
      boss.speed *= 1.25
      boss.damage = (boss.damage ?? 6) * 1.3
      spawnBurst(boss.position, 0xd52e38, 40, 7, 0.8)
      announce('BOSS FAZI III — KANLI ÖFKE', 2)
      sfx.die()
    }
    state.lastBossRatio = ratio

    const enrage = Math.min(1.8, state.bossFightTime / 140)
    boss.speed *= 1 + dt * 0.004 * enrage
    boss.damage = (boss.damage ?? 0) * (1 + dt * 0.003 * enrage)
  } else {
    state.bossFightTime = Math.max(0, state.bossFightTime - dt * 2)
    state.lastBossRatio = 1
  }
}

function swarmFormations() {
  const player = getPlayer()
  if (!player || gameState.wave <= state.lastWave) return
  state.lastWave = gameState.wave
  player.poise = player.maxPoise
  if (gameState.wave % 2 === 0) gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.6)
  const formationCount = gameState.wave % 4 === 0 ? 8 : 4
  for (let i = 0; i < formationCount; i++) {
    if (enemies.entities.length >= 1400) break
    spawnEnemy(player.position)
  }
  if (gameState.wave % 4 === 0) {
    announce('SÜRÜ FORMASYONU — ÇİFT KANAT', 1.5)
    spawnBurst(player.position, 0xffb15c, 12, 4.5, 0.42)
  }
}

function adaptiveDifficulty(dt: number) {
  const player = getPlayer()
  if (!player) return
  const target = 1 + Math.min(0.65, gameState.combo * 0.0035) + Math.min(0.4, gameState.time / 700)
  state.adaptive += (target - state.adaptive) * Math.min(1, dt * 0.5)
  if (state.adaptive > 1.15 && gameState.time > 30 && Math.random() < dt * 0.16) spawnEnemy(player.position)
}

function hazardsTick(dt: number) {
  const player = getPlayer()
  if (!player) return
  state.hazardTimer -= dt
  if (state.hazardTimer <= 0) {
    state.hazardTimer = Math.max(7, 17 - gameState.time / 90)
    const angle = Math.random() * Math.PI * 2
    const distance = 4 + Math.random() * 8
    hazards.push({
      position: new THREE.Vector3(player.position.x + Math.cos(angle) * distance, 0.04, player.position.z + Math.sin(angle) * distance),
      radius: 1.7 + Math.min(2.2, gameState.time / 120),
      life: 9 + Math.min(8, gameState.wave * 0.35),
      tick: 0,
    })
  }
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i]
    h.life -= dt
    h.tick -= dt
    if (h.life <= 0) {
      hazards.splice(i, 1)
      continue
    }
    if (h.tick <= 0) {
      h.tick = 0.5
      if (player.position.distanceToSquared(h.position) <= h.radius * h.radius && (player.invuln ?? 0) <= 0) {
        player.health = Math.max(0, player.health - Math.max(1, 3.5 + gameState.wave * 0.2 - player.armor * 0.35))
        gameState.damageFlash = Math.min(1, gameState.damageFlash + 0.18)
        state.elapsedSinceHit = 0
        spawnBurst(player.position, 0xd65032, 3, 2, 0.2)
      }
    }
    if (Math.random() < dt * 0.8) spawnBurst(h.position, 0xd65032, 1, 1.5, 0.2)
  }
}

function mutatorEscalation(dt: number) {
  const next = Math.floor(gameState.wave / 3)
  if (next === state.mutatorLevel) return
  state.mutatorLevel = next
  const armorBonus = state.mutatorLevel * 0.65
  const speedBonus = Math.min(0.5, state.mutatorLevel * 0.025)
  for (const e of enemies.entities) {
    if (e.dead) continue
    e.armor = Math.max(e.armor, armorBonus)
    e.speed *= 1 + speedBonus
  }
  if (state.mutatorLevel > 0) announce(`MUTATOR KADEMESİ ${state.mutatorLevel}`, 1.1)
}

function shrineGambit(dt: number) {
  const player = getPlayer()
  if (!player) return
  state.shrineTimer += dt
  if (state.shrineTimer < 55) return
  state.shrineTimer = 0
  const heat = riskHeat(player)
  if (heat >= 0.65) {
    player.health = Math.min(player.maxHealth, player.health + player.maxHealth * 0.35)
    player.speed *= 1.06
    abilities.ferocity += 2
    player.invuln = Math.max(player.invuln ?? 0, 2)
    announce('SHRINE GAMBIT — RİSK ÖDÜLE DÖNÜŞTÜ', 2.2)
    spawnBurst(player.position, 0xe4c97d, 22, 5.5, 0.7)
  } else {
    player.poise = player.maxPoise
    player.health = Math.min(player.maxHealth, player.health + 18)
    abilities.swift += 1
    announce('SHRINE — KORUNMA LÜTFU', 1.8)
    spawnBurst(player.position, 0xe4c97d, 14, 4, 0.5)
  }
  sfx.levelup()
}

function relicResonance() {
  const player = getPlayer()
  if (!player || gameState.level === state.lastLevel) return
  state.lastLevel = gameState.level
  if (gameState.level < 5 || gameState.level % 5 !== 0) return
  state.relicTier++
  player.maxHealth += 8 + state.relicTier * 2
  player.health = Math.min(player.maxHealth, player.health + 10 + state.relicTier * 2)
  player.armor += state.relicTier % 3 === 0 ? 1 : 0
  abilities.crit += state.relicTier % 2 === 0 ? 1 : 0
  announce(`RELIC REZONANSI ${state.relicTier} — SET BONUS UYANDI`, 1.8)
  spawnBurst(player.position, 0xffc36a, 18, 4.5, 0.65)
}

function momentumBank(dt: number) {
  const player = getPlayer()
  if (!player) return
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  if (speed > 4) state.momentumBank = Math.min(100, state.momentumBank + dt * (speed - 3) * (1 + abilities.momentum * 0.12))
  state.momentumTimer -= dt
  if (state.momentumBank >= 35 && state.momentumTimer <= 0) {
    state.momentumTimer = 2.2
    const power = state.momentumBank * 0.15
    state.momentumBank *= 0.55
    for (const e of enemies.entities) {
      if (e.dead || e.position.distanceToSquared(player.position) > 4.8 * 4.8) continue
      e.health -= power
      e.velocity.addScaledVector(tmp.subVectors(e.position, player.position).normalize(), 4 + power * 0.15)
      e.hitFlash = 1
    }
    gameState.shake = Math.min(1, gameState.shake + 0.18)
    spawnBurst(player.position, 0xf2b871, 10, 5, 0.4)
  }
}

function magnetSurge(dt: number) {
  const player = getPlayer()
  if (!player || abilities.magnet <= 0 || gameState.combo < 10) return
  state.magnetPulse -= dt
  const pull = 1.6 + Math.min(5, gameState.combo * 0.08)
  for (const p of particles.entities) {
    if (!p.wisp) continue
    const d2 = p.position.distanceToSquared(player.position)
    if (d2 > 14 * 14) continue
    tmp.subVectors(player.position, p.position)
    const d = Math.sqrt(d2) || 1
    p.velocity.lerp(tmp.divideScalar(d).multiplyScalar(pull), 0.35)
    if (d < 0.65) {
      p.life = 0
      if (state.magnetPulse <= 0) {
        state.magnetPulse = 0.18
        gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.08)
      }
    }
  }
}

function arenaPulse(dt: number) {
  const player = getPlayer()
  if (!player) return
  state.arenaPulseTimer -= dt
  if (state.arenaPulseTimer > 0) return
  state.arenaPulseTimer = 36
  for (const e of enemies.entities) {
    if (e.dead) continue
    e.health -= 2 + gameState.wave * 0.25
    e.velocity.multiplyScalar(1.08)
  }
  player.poise = player.maxPoise
  player.invuln = Math.max(player.invuln ?? 0, 0.35)
  gameState.shake = Math.min(1, gameState.shake + 0.35)
  spawnBurst(player.position, 0xffb15c, 24, 6, 0.6)
  announce('ARENA PULSE — ALAN YENİLENDİ', 1.5)
}

function ascensionTick(dt: number) {
  const player = getPlayer()
  if (!player) return
  if (state.ascension <= 0 && gameState.time >= 420) {
    state.ascension = 20
    state.ascensionPulse = 0
    announce('ASCENSION — BÜTÜN MEKANİKLER AŞIRI YÜKTE', 2.8)
    spawnBurst(player.position, 0xffe2a2, 48, 9, 1)
    sfx.levelup()
  }
  if (state.ascension <= 0) return
  state.ascension = Math.max(0, state.ascension - dt)
  state.ascensionPulse -= dt
  player.speed *= 1 + dt * 0.08
  player.invuln = Math.max(player.invuln ?? 0, 0.06)
  gameState.comboTimer = Math.min(4.25, gameState.comboTimer + dt * 0.05)
  if (state.ascensionPulse <= 0) {
    state.ascensionPulse = 1.6
    for (const e of enemies.entities) {
      if (e.dead || e.position.distanceToSquared(player.position) > 7 * 7) continue
      e.health -= 4 + abilities.ferocity
      e.velocity.addScaledVector(tmp.subVectors(e.position, player.position).normalize(), 2)
    }
    spawnBurst(player.position, 0xffe2a2, 10, 4, 0.35)
  }
}

function comboExtension(dt: number) {
  if (gameState.combo >= 25 && gameState.comboTimer > 0) {
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + dt * (0.012 + abilities.adrenaline * 0.0008))
  }
}

export function onEnemyKilled(e: Entity, player: Entity) {
  if (processedDeaths.has(e)) return
  processedDeaths.add(e)

  const overkill = Math.max(0, (e.lastDmg ?? 0) - e.maxHealth)
  if (overkill > 0) {
    let hits = 0
    const radius = 3.8 + Math.min(2, overkill * 0.01)
    for (const other of enemies.entities) {
      if (hits >= 5 || other.dead || other === e) continue
      if (other.position.distanceToSquared(e.position) <= radius * radius) {
        other.health -= Math.min(overkill * 0.85, other.maxHealth * 0.45)
        other.hitFlash = 1
        hits++
      }
    }
    if (hits > 0) {
      spawnBurst(e.position, 0xffb15c, 12 + hits * 2, 5.5, 0.45)
      gameState.shake = Math.min(1, gameState.shake + 0.2)
    }
  }

  if (gameState.combo >= 8) {
    state.executionChain = Math.min(6, state.executionChain + 1)
    state.executionWindow = 0.7
  }
}

function executeWindowTick(dt: number) {
  state.executionWindow = Math.max(0, state.executionWindow - dt)
  state.executionChain = Math.max(0, state.executionChain - (state.executionWindow > 0 ? 0 : dt * 2))
  executeChain()
}

function statusAndElementTick(dt: number) {
  seedStatusReactions(dt)
  processStatusReactions(dt)
  const player = getPlayer()
  if (!player) return
  const element = dominantElement()
  if (!element) return
  const level = Math.max(1, Math.floor(element === 'pyro' ? abilities.pyre : element === 'cryo' ? abilities.frost : element === 'storm' ? abilities.storm : element === 'venom' ? abilities.venom : element === 'void' ? abilities.vortex : element === 'iron' ? abilities.armor : abilities.rage))
  if (level < 4 || Math.random() >= dt * 0.35) return
  const radius = 4.5 + Math.min(5, level * 0.25)
  const power = 2 + level * 0.45 + state.ascension * 0.18
  for (const e of enemies.entities) {
    if (e.dead || e.position.distanceToSquared(player.position) > radius * radius) continue
    switch (element) {
      case 'pyro': e.health -= power; break
      case 'cryo': e.slow = Math.max(e.slow ?? 0, 1.2); e.health -= power * 0.75; break
      case 'storm': e.health -= power * 0.8; e.velocity.y = 0; break
      case 'venom': e.health -= power * 1.15; break
      case 'void': e.velocity.addScaledVector(tmp.subVectors(player.position, e.position).normalize(), 1.8); e.health -= power * 0.9; break
      case 'iron': e.armor = Math.max(0, e.armor - 1); break
      case 'blood': e.health -= power * 0.9; break
    }
  }
  spawnBurst(player.position, element === 'pyro' ? 0xff632f : element === 'cryo' ? 0x8fd8ff : element === 'storm' ? 0xcfeeff : element === 'venom' ? 0x6fd889 : element === 'void' ? 0xa995ff : element === 'iron' ? 0xd0b991 : 0xd52e38, 5 + Math.min(8, level), 3.2, 0.3)
}

function relicAndShrineTick(dt: number) {
  relicResonance()
  shrineGambit(dt)
}

function resetInternal() {
  state.revenge = 0
  state.dodgeCharge = 0
  state.echoTimer = 0
  state.detonateTimer = 0
  state.adaptive = 1
  state.lastWave = 0
  state.streakTier = 0
  state.lastBossRatio = 1
  state.bossFightTime = 0
  state.ascension = 0
  state.ascensionPulse = 0
  state.lastHitHp = 100
  state.executionChain = 0
  state.executionWindow = 0
  state.momentumBank = 0
  state.momentumTimer = 0
  state.hazardTimer = 0
  state.mutatorLevel = 0
  state.shrineTimer = 0
  state.relicTier = 0
  state.lastLevel = 1
  state.lastStandCooldown = 0
  state.arenaPulseTimer = 0
  state.magnetPulse = 0
  state.elapsedSinceHit = 0
  hazards.length = 0
}

function tick(dt: number) {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return

  revengeAndDodge(dt)
  threatAndRisk(dt)
  adaptiveDifficulty(dt)
  swarmFormations()
  mutatorEscalation(dt)
  eliteAndBossAuras(dt)
  statusAndElementTick(dt)
  executeWindowTick(dt)
  hazardsTick(dt)
  relicAndShrineTick(dt)
  momentumBank(dt)
  magnetSurge(dt)
  arenaPulse(dt)
  comboExtension(dt)
  ascensionTick(dt)
}

export function startMegaSystemsV2() {
  if (state.running || typeof window === 'undefined') return () => undefined
  state.running = true
  state.last = performance.now()
  const loop = (now: number) => {
    if (!state.running) return
    const dt = Math.min(0.05, Math.max(0.001, (now - state.last) / 1000))
    state.last = now
    tick(dt)
    state.frame = window.requestAnimationFrame(loop)
  }
  state.frame = window.requestAnimationFrame(loop)
  return stopMegaSystemsV2
}

export function stopMegaSystemsV2() {
  state.running = false
  if (state.frame) window.cancelAnimationFrame(state.frame)
  state.frame = 0
  state.last = 0
}

export function resetMegaSystemsV2() {
  resetInternal()
}
