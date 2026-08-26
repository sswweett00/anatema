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

export interface MegaFeature {
  id: number
  name: string
  description: string
}

export const MEGA_FEATURES: MegaFeature[] = [
  { id: 1, name: 'Execution Chain', description: 'Düşük canlı hedefleri gerçek infaz zincirine dönüştürür.' },
  { id: 2, name: 'Overkill Burst', description: 'Öldürme üzeri hasarı yakındaki hedeflere taşır.' },
  { id: 3, name: 'Revenge Window', description: 'Hasar sonrası geçici karşı saldırı momentumu verir.' },
  { id: 4, name: 'Near-Death Frenzy', description: 'Kritik düşük canlı savaş hızını ve burst gücünü artırır.' },
  { id: 5, name: 'Perfect Dodge Charge', description: 'Dokunulmazlık süreleri enerji doldurur ve tetiklenince combo uzatır.' },
  { id: 6, name: 'Threat Pressure', description: 'Yakın sürü yoğunluğu poise yenilemesini artırır.' },
  { id: 7, name: 'Armor Break', description: 'Kritik ve elemental temaslar geçici zırh kırar.' },
  { id: 8, name: 'Crit Echo', description: 'Kritik hasarı gecikmeli ikinci darbeye çoğaltır.' },
  { id: 9, name: 'Status Detonation', description: 'İki veya daha fazla status birleşince gerçek reaksiyon patlaması oluşturur.' },
  { id: 10, name: 'Freeze Shatter', description: 'Donmuş düşman ağır darbede parçalanır.' },
  { id: 11, name: 'Burn Spread', description: 'Yanma komşulara yayılır ve zincirlenir.' },
  { id: 12, name: 'Shock Chain', description: 'Şoklu hedef elektrik sıçraması başlatır.' },
  { id: 13, name: 'Poison Rupture', description: 'Düşük canlı zehirli hedef alan zehir patlaması üretir.' },
  { id: 14, name: 'Bleed Siphon', description: 'Kanayan hedeflerden oyuncuya iyileştirme akar.' },
  { id: 15, name: 'Void Implosion', description: 'Void rezonansı çevredeki sürüyü merkeze çeker.' },
  { id: 16, name: 'Elemental Overdrive', description: 'Baskın element yüksek seviyelerde periyodik alan saldırısı açar.' },
  { id: 17, name: 'Combo Time Extension', description: 'Yüksek combo zinciri sürenin kendi kendini korumasını sağlar.' },
  { id: 18, name: 'Adaptive Difficulty', description: 'Oyuncu performansı yükseldikçe spawn baskısı dinamik artar.' },
  { id: 19, name: 'Elite Aura', description: 'Elite ve boss çevresindeki sürüyü gerçek zamanlı güçlendirir.' },
  { id: 20, name: 'Boss Phase Shockwave', description: 'Boss HP eşikleri gerçek şok dalgaları tetikler.' },
  { id: 21, name: 'Boss Soft Enrage', description: 'Boss savaşı uzadıkça taban değer üzerinden kontrollü güçlenir.' },
  { id: 22, name: 'Swarm Formations', description: 'Dalga eşiklerinde sürü formasyonları ve flank baskısı üretir.' },
  { id: 23, name: 'Hazard Evolution', description: 'Hazard sayısı, yarıçapı, ömrü ve hasarı zamanla evrilir.' },
  { id: 24, name: 'Mutator Escalation', description: 'Her üç dalgada kalıcı olmayan düşman mutator seviyesi yükselir.' },
  { id: 25, name: 'Shrine Gambit', description: 'Gerçek shrine bölgeleri risk durumuna göre farklı ödül verir.' },
  { id: 26, name: 'Relic Resonance', description: 'Gerçek relic toplama eşikleri set benzeri kalıcı bonus üretir.' },
  { id: 27, name: 'Momentum Banking', description: 'Yüksek hareket enerjisi biriktirilir ve yakın savaşta boşaltılır.' },
  { id: 28, name: 'Magnet Surge', description: 'Gerçek wisp/XP ruhları oyuncuya fiziksel olarak çekilir.' },
  { id: 29, name: 'Last Stand Charge', description: 'İkinci şans uzun hasarsızlık sonrasında yeniden doldurulur.' },
  { id: 30, name: 'Arena Pulse', description: 'Arena düzenli enerji darbeleriyle sürüyü iter ve zayıflatır.' },
  { id: 31, name: 'Kill Streak Rewards', description: '25 kesimlik seriler gerçek mikro ödüller üretir.' },
  { id: 32, name: 'Risk Heat', description: 'Düşük HP + yüksek combo doğrudan savaş bonuslarına dönüşür.' },
  { id: 33, name: 'Ascension Threshold', description: 'Uzun run sonunda çoklu sistemleri geçici olarak güçlendiren Ascension açılır.' },
]

type Element = 'pyro' | 'cryo' | 'storm' | 'venom' | 'void' | 'iron' | 'blood'

type StatusState = {
  burn: number
  poison: number
  shock: number
  bleed: number
  freeze: number
  armorBreak: number
  echo: number
}

type Hazard = {
  position: THREE.Vector3
  radius: number
  life: number
  tick: number
  damage: number
}

type Marker = {
  position: THREE.Vector3
  kind: 'shrine' | 'relic'
  life: number
  claimed: boolean
}

const status = new WeakMap<Entity, StatusState>()
const baseEnemy = new WeakMap<Entity, { speed: number; damage: number; armor: number }>()
const processedDeaths = new WeakSet<Entity>()
const hazards: Hazard[] = []
const markers: Marker[] = []
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

const state = {
  running: false,
  frame: 0,
  last: 0,
  elapsedSinceHit: 0,
  revenge: 0,
  dodgeCharge: 0,
  echoCooldown: 0,
  detonationCooldown: 0,
  adaptive: 1,
  lastWave: 0,
  streakTier: 0,
  bossFightTime: 0,
  lastBossRatio: 1,
  ascension: 0,
  ascensionPulse: 0,
  executionChain: 0,
  executionWindow: 0,
  momentumBank: 0,
  momentumCooldown: 0,
  hazardTimer: 8,
  mutatorLevel: 0,
  shrineTimer: 35,
  relicTimer: 0,
  relicTier: 0,
  lastLevel: 1,
  arenaPulseTimer: 36,
  magnetCooldown: 0,
  lastHitHp: 100,
  elementCooldown: 0,
}

function getStatus(e: Entity): StatusState {
  let current = status.get(e)
  if (!current) {
    current = { burn: 0, poison: 0, shock: 0, bleed: 0, freeze: 0, armorBreak: 0, echo: 0 }
    status.set(e, current)
  }
  return current
}

function base(e: Entity) {
  let current = baseEnemy.get(e)
  if (!current) {
    current = { speed: e.speed, damage: e.damage ?? 0, armor: e.armor }
    baseEnemy.set(e, current)
  }
  return current
}

function livingNear(center: THREE.Vector3, radius: number, limit = Infinity): Entity[] {
  const result: Entity[] = []
  const radius2 = radius * radius
  for (const e of enemies.entities) {
    if (e.dead) continue
    if (e.position.distanceToSquared(center) <= radius2) {
      result.push(e)
      if (result.length >= limit) break
    }
  }
  return result
}

function riskHeat(player: Entity): number {
  const hpRisk = 1 - player.health / Math.max(1, player.maxHealth)
  const comboRisk = Math.min(1, gameState.combo / 120)
  return Math.min(1, hpRisk * 0.7 + comboRisk * 0.3)
}

function dominantElement(): Element | null {
  const values: Array<[Element, number]> = [
    ['pyro', abilities.pyre + abilities.nova * 0.8],
    ['cryo', abilities.frost + abilities.orbit * 0.6],
    ['storm', abilities.storm + abilities.chain * 0.6],
    ['venom', abilities.venom + abilities.harvest * 0.35],
    ['void', abilities.vortex + abilities.phantom * 0.6 + abilities.ghoststep * 0.25],
    ['iron', abilities.armor + abilities.stone * 0.8 + abilities.bulwark * 0.5],
    ['blood', abilities.rage + abilities.vamp * 0.8 + abilities.ferocity * 0.5],
  ]
  let best: Element | null = null
  let score = 0
  for (const [element, value] of values) {
    if (value > score) {
      score = value
      best = element
    }
  }
  return best
}

function playerSpeedMultiplier(player: Entity): number {
  const hp = player.health / Math.max(1, player.maxHealth)
  const lowHp = hp < 0.28 ? 1 + Math.min(0.4, (0.28 - hp) * 2.2) + Math.min(0.3, gameState.combo * 0.004) : 1
  const revenge = state.revenge > 0 ? 1.12 + abilities.rage * 0.01 : 1
  const heat = riskHeat(player) > 0.7 ? 1.05 : 1
  const ascension = state.ascension > 0 ? 1.12 : 1
  return lowHp * revenge * heat * ascension
}

function applyBaselineModifiers() {
  for (const e of enemies.entities) {
    if (e.dead) continue
    const b = base(e)
    e.speed = b.speed
    e.damage = b.damage
    e.armor = b.armor
  }
}

function applyEliteAuras(dt: number) {
  const player = getPlayer()
  if (!player) return
  for (const elite of enemies.entities) {
    if (elite.dead) continue
    const isBoss = elite.maxHealth >= 400 || (elite.scale ?? 1) >= 2.5
    const isElite = isBoss || (elite.scale ?? 1) >= 1.18
    if (!isElite) continue

    const radius = isBoss ? 7.5 : 4.8
    const allies = livingNear(elite.position, radius, 24)
    const speedBonus = isBoss ? 0.18 : 0.06
    const damageBonus = isBoss ? 0.25 : 0.08
    for (const ally of allies) {
      const b = base(ally)
      ally.speed = b.speed * (1 + speedBonus)
      ally.damage = b.damage * (1 + damageBonus)
    }

    if (Math.random() < dt * 0.35) {
      spawnBurst(elite.position, isBoss ? 0xd52e38 : 0xffc36a, isBoss ? 3 : 1, 1.5, 0.2)
    }
  }
}

function applyMutator() {
  const next = Math.floor(gameState.wave / 3)
  if (next === state.mutatorLevel) return
  state.mutatorLevel = next
  announce(`MUTATOR KADEMESİ ${next}`, 1.1)
  for (const e of enemies.entities) {
    if (e.dead) continue
    const b = base(e)
    const speed = Math.min(0.6, next * 0.025)
    e.speed = b.speed * (1 + speed)
    e.damage = b.damage * (1 + next * 0.07)
    e.armor = b.armor + next * 0.65
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

  if ((player.invuln ?? 0) > 0) state.dodgeCharge = Math.min(100, state.dodgeCharge + dt * (22 + abilities.swift * 1.2))
  if (state.dodgeCharge >= 100) {
    state.dodgeCharge = 0
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.8)
    player.invuln = Math.max(player.invuln ?? 0, 0.28)
    gameState.shake = Math.min(1, gameState.shake + 0.12)
    spawnBurst(player.position, 0x9fdcff, 10, 3.5, 0.32)
  }

  if (state.elapsedSinceHit >= 26 && player.lastStandUsed) {
    player.lastStandUsed = false
    announce('SON DİRENİŞ YENİDEN HAZIR', 1.5)
  }
}

function threatPressure(dt: number) {
  const player = getPlayer()
  if (!player) return
  const nearby = livingNear(player.position, 4, 24).length
  if (nearby < 8) return
  const pressure = Math.min(1, nearby / 20)
  player.poise = Math.min(player.maxPoise, player.poise + dt * (1.5 + pressure * 3 + abilities.bulwark))
  gameState.comboTimer = Math.min(4.25, gameState.comboTimer + dt * pressure * 0.025)
}

function statusReactions(dt: number) {
  const player = getPlayer()
  if (!player) return
  const element = dominantElement()
  const radius2 = 22 * 22
  state.detonationCooldown -= dt

  if (element) {
    const application = Math.min(0.75, dt * (0.7 + gameState.combo * 0.004 + state.ascension * 0.03))
    for (const e of enemies.entities) {
      if (e.dead || e.position.distanceToSquared(player.position) > radius2 || Math.random() > application) continue
      const s = getStatus(e)
      switch (element) {
        case 'pyro': s.burn = Math.max(s.burn, 1.2 + abilities.pyre * 0.08); break
        case 'cryo': s.freeze = Math.max(s.freeze, 0.9 + abilities.frost * 0.05); break
        case 'storm': s.shock = Math.max(s.shock, 1 + abilities.storm * 0.04); break
        case 'venom': s.poison = Math.max(s.poison, 1.4 + abilities.venom * 0.08); break
        case 'void': s.bleed = Math.max(s.bleed, 1.2 + abilities.vortex * 0.05); break
        case 'iron': s.armorBreak = Math.max(s.armorBreak, 0.9); break
        case 'blood': s.bleed = Math.max(s.bleed, 1.5 + abilities.rage * 0.06); break
      }
    }
  }

  for (const e of enemies.entities) {
    if (e.dead) continue
    const s = getStatus(e)
    s.burn = Math.max(0, s.burn - dt)
    s.poison = Math.max(0, s.poison - dt)
    s.shock = Math.max(0, s.shock - dt)
    s.bleed = Math.max(0, s.bleed - dt)
    s.freeze = Math.max(0, s.freeze - dt)
    s.armorBreak = Math.max(0, s.armorBreak - dt)
    s.echo = Math.max(0, s.echo - dt)

    if (s.burn > 0 && Math.random() < dt * 1.15) {
      e.health -= (1.4 + abilities.pyre * 0.35) * (state.ascension > 0 ? 1.2 : 1)
      for (const near of livingNear(e.position, 1.8, 2)) getStatus(near).burn = Math.max(getStatus(near).burn, 0.8)
      spawnBurst(e.position, 0xff6b2e, 1, 1.4, 0.18)
    }

    if (s.poison > 0 && Math.random() < dt * 1.4) {
      e.health -= 1.2 + abilities.venom * 0.28
      if (e.health / Math.max(1, e.maxHealth) < 0.2) {
        for (const near of livingNear(e.position, 2.2, 4)) getStatus(near).poison = Math.max(getStatus(near).poison, 0.8)
      }
    }

    if (s.shock > 0 && Math.random() < dt * 1.6) {
      const near = livingNear(e.position, 2.4, 1)[0]
      if (near) {
        getStatus(near).shock = Math.max(getStatus(near).shock, 0.8)
        near.health -= 2 + abilities.storm * 0.4
        spawnBurst(near.position, 0xbfe8ff, 2, 2, 0.2)
      }
    }

    if (s.bleed > 0 && e.lastDmg) {
      player.health = Math.min(player.maxHealth, player.health + Math.min(1.2, e.lastDmg * 0.006) * dt * 4)
    }

    if (s.freeze > 0) e.slow = Math.max(e.slow ?? 0, 0.55)

    const stackCount = Number(s.burn > 0) + Number(s.poison > 0) + Number(s.shock > 0) + Number(s.bleed > 0) + Number(s.freeze > 0)
    if (stackCount >= 2 && state.detonationCooldown <= 0) {
      state.detonationCooldown = 0.22
      e.health -= 2 + stackCount * 1.6 + abilities.ferocity * 0.45
      e.hitFlash = 1
      spawnBurst(e.position, s.freeze > 0 ? 0x9fdcff : 0xffb15c, 3 + stackCount, 2.7, 0.24)
      if (stackCount >= 4) {
        e.velocity.multiplyScalar(1.18)
        announce('ELEMENTAL REAKSİYON', 0.8)
      }
    }

    if (e.lastCrit) s.armorBreak = Math.max(s.armorBreak, 0.7 + abilities.crit * 0.03)
    if (s.armorBreak > 0) e.armor = Math.max(0, e.armor - Math.max(1, Math.ceil(abilities.crit * 0.2)))

    if (s.freeze > 0 && (e.lastDmg ?? 0) > e.maxHealth * 0.045) {
      e.health -= Math.max(1, (e.lastDmg ?? 0) * 0.12)
      s.freeze = 0
      spawnBurst(e.position, 0x9fdcff, 8, 4.2, 0.3)
    }

    if (e.health <= 0) e.dead = true
  }
}

function critEcho(dt: number) {
  state.echoCooldown -= dt
  if (state.echoCooldown > 0) return
  for (const e of enemies.entities) {
    if (e.dead || !e.lastCrit || (e.lastDmg ?? 0) <= 0) continue
    const s = getStatus(e)
    if (s.echo > 0) continue
    s.echo = 0.5
    state.echoCooldown = 0.12
    e.health -= Math.max(1, (e.lastDmg ?? 0) * 0.22)
    spawnBurst(e.position, 0xffe8a0, 3, 2.5, 0.2)
  }
}

function executeChain(dt: number) {
  const player = getPlayer()
  if (!player || gameState.combo < 8) return
  state.executionWindow = Math.max(0, state.executionWindow - dt)
  if (state.executionChain <= 0 && state.executionWindow <= 0) return

  const threshold = 0.07 + Math.min(0.09, gameState.combo * 0.0008)
  const limit = Math.min(6, 1 + Math.floor(gameState.combo / 25))
  let count = 0
  for (const e of enemies.entities) {
    if (count >= limit || e.dead || e.maxHealth <= 0) continue
    if (e.health / e.maxHealth > threshold) continue
    e.dead = true
    e.lastDmg = e.maxHealth * 1.1
    e.lastCrit = true
    count++
  }

  if (count > 0) {
    state.executionChain = Math.max(0, state.executionChain - count + 1)
    state.executionWindow = 0.7
    player.invuln = Math.max(player.invuln ?? 0, 0.15)
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + count * 0.12)
    spawnBurst(player.position, 0xffe2a2, 8 + count * 3, 5, 0.42)
    sfx.crit()
  } else {
    state.executionChain = Math.max(0, state.executionChain - dt * 2)
  }
}

function detectDeathReactions(player: Entity) {
  for (const e of enemies.entities) {
    if (!e.dead || processedDeaths.has(e)) continue
    processedDeaths.add(e)

    const overkill = Math.max(0, (e.lastDmg ?? 0) - e.maxHealth)
    if (overkill > 0) {
      const radius = 3.8 + Math.min(2, overkill * 0.01)
      const spill = Math.min(e.maxHealth * 0.85, overkill)
      let hitCount = 0
      for (const other of livingNear(e.position, radius, 5)) {
        other.health -= spill * (1 - hitCount * 0.12)
        other.hitFlash = 1
        if (other.health <= 0) other.dead = true
        hitCount++
      }
      if (hitCount > 0) {
        spawnBurst(e.position, 0xffb15c, 10 + hitCount * 2, 5, 0.45)
        gameState.shake = Math.min(1, gameState.shake + 0.2)
      }
    }

    if (gameState.combo >= 8) {
      state.executionChain = Math.min(6, state.executionChain + 1)
      state.executionWindow = 0.72
    }

    const streak = Math.floor(gameState.kills / 25)
    if (streak > state.streakTier) {
      state.streakTier = streak
      player.health = Math.min(player.maxHealth, player.health + 5 + streak * 2)
      player.poise = Math.min(player.maxPoise, player.poise + 8 + streak)
      gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.45)
      if (streak % 2 === 0) abilities.ferocity += 1
      announce(`${streak * 25} KESİM — SAVAŞ ÖDÜLÜ`, 1.2)
      spawnBurst(player.position, 0xffd15e, 8 + streak * 2, 3.2, 0.32)
    }
  }
}

function adaptiveDifficulty(dt: number) {
  const player = getPlayer()
  if (!player) return
  const target = 1 + Math.min(0.7, gameState.combo * 0.0035) + Math.min(0.4, gameState.time / 700)
  state.adaptive += (target - state.adaptive) * Math.min(1, dt * 0.5)
  if (state.adaptive > 1.12 && gameState.time > 30 && Math.random() < dt * 0.18) {
    spawnEnemy(player.position)
    if (state.adaptive > 1.35 && Math.random() < 0.35) spawnEnemy(player.position)
  }
}

function swarmFormations() {
  const player = getPlayer()
  if (!player || gameState.wave <= state.lastWave) return
  state.lastWave = gameState.wave
  const flankCount = gameState.wave % 4 === 0 ? 8 : 4
  for (const e of livingNear(player.position, 30, flankCount)) {
    tmp.subVectors(e.position, player.position).setY(0)
    if (tmp.lengthSq() <= 0.01) continue
    tmp.normalize()
    const side = tmp2.set(-tmp.z, 0, tmp.x)
    e.velocity.addScaledVector(side, gameState.wave % 4 === 0 ? 2.5 : 1.5)
  }
  if (gameState.wave % 4 === 0) {
    announce('SÜRÜ FORMASYONU — FLANK', 1.5)
    spawnBurst(player.position, 0xffb15c, 14, 4.5, 0.42)
  }
}

function bossSystems(dt: number) {
  const player = getPlayer()
  if (!player) return
  const bosses = enemies.entities.filter((e) => !e.dead && (e.maxHealth >= 400 || (e.scale ?? 1) >= 2.5))
  const boss = bosses[0]
  if (!boss) {
    state.bossFightTime = Math.max(0, state.bossFightTime - dt * 2)
    state.lastBossRatio = 1
    return
  }

  state.bossFightTime += dt
  const ratio = boss.health / Math.max(1, boss.maxHealth)
  const b = base(boss)

  if (ratio < 0.66 && state.lastBossRatio >= 0.66) {
    for (const e of livingNear(boss.position, 8, 32)) {
      tmp.subVectors(e.position, boss.position).setY(0)
      if (tmp.lengthSq() > 0.01) e.velocity.addScaledVector(tmp.normalize(), 4)
    }
    player.invuln = Math.max(player.invuln ?? 0, 0.4)
    spawnBurst(boss.position, 0xff9a4d, 28, 6.5, 0.6)
    announce('BOSS FAZI II — ŞOK DALGASI', 1.8)
    sfx.storm()
  }

  if (ratio < 0.33 && state.lastBossRatio >= 0.33) {
    player.health = Math.max(1, player.health - 6)
    spawnBurst(boss.position, 0xd52e38, 40, 7, 0.8)
    announce('BOSS FAZI III — KANLI ÖFKE', 2)
    sfx.die()
  }

  state.lastBossRatio = ratio
  const enrage = Math.min(1.8, state.bossFightTime / 140)
  boss.speed = b.speed * (1 + enrage * 0.2)
  boss.damage = b.damage * (1 + enrage * 0.35)
}

function hazards(dt: number) {
  const player = getPlayer()
  if (!player) return
  state.hazardTimer -= dt
  const cadence = Math.max(6, 16 - gameState.time / 100)
  if (state.hazardTimer <= 0) {
    state.hazardTimer = cadence
    const angle = Math.random() * Math.PI * 2
    const distance = 4 + Math.random() * 10
    const evolution = Math.min(1, gameState.time / 600)
    hazards.push({
      position: new THREE.Vector3(player.position.x + Math.cos(angle) * distance, 0.04, player.position.z + Math.sin(angle) * distance),
      radius: 1.5 + evolution * 2.6,
      life: 7 + evolution * 8,
      tick: 0,
      damage: 3.5 + gameState.wave * 0.2 + evolution * 4,
    })
  }

  for (let i = hazards.length - 1; i >= 0; i--) {
    const hazard = hazards[i]
    hazard.life -= dt
    hazard.tick -= dt
    if (hazard.life <= 0) {
      hazards.splice(i, 1)
      continue
    }
    if (hazard.tick <= 0) {
      hazard.tick = 0.5
      if (player.position.distanceToSquared(hazard.position) <= hazard.radius * hazard.radius && (player.invuln ?? 0) <= 0) {
        player.health = Math.max(0, player.health - Math.max(1, hazard.damage - player.armor * 0.35))
        state.elapsedSinceHit = 0
        gameState.damageFlash = Math.min(1, gameState.damageFlash + 0.18)
        spawnBurst(player.position, 0xd65032, 3, 2, 0.2)
      }
    }
    if (Math.random() < dt * 0.8) spawnBurst(hazard.position, 0xd65032, 1, 1.5, 0.2)
  }
}

function spawnMarker(kind: Marker['kind'], player: Entity) {
  const angle = Math.random() * Math.PI * 2
  const distance = 5 + Math.random() * 6
  markers.push({
    position: new THREE.Vector3(player.position.x + Math.cos(angle) * distance, 0.05, player.position.z + Math.sin(angle) * distance),
    kind,
    life: 30,
    claimed: false,
  })
}

function shrineAndRelic(dt: number) {
  const player = getPlayer()
  if (!player) return
  state.shrineTimer -= dt
  state.relicTimer -= dt

  if (state.shrineTimer <= 0) {
    state.shrineTimer = 55
    spawnMarker('shrine', player)
    announce('UZAKTA BİR SHRINE ORTAYA ÇIKTI', 1.5)
  }

  if (state.relicTimer <= 0 && gameState.level >= 5) {
    state.relicTimer = 42
    spawnMarker('relic', player)
  }

  for (const marker of markers) {
    if (marker.claimed) continue
    marker.life -= dt
    const dist = player.position.distanceToSquared(marker.position)
    if (dist > 1.6 * 1.6) continue
    marker.claimed = true

    if (marker.kind === 'shrine') {
      const heat = riskHeat(player)
      if (heat >= 0.65) {
        player.health = Math.min(player.maxHealth, player.health + player.maxHealth * 0.35)
        player.poise = player.maxPoise
        abilities.ferocity += 2
        player.invuln = Math.max(player.invuln ?? 0, 2)
        gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 1)
        announce('SHRINE GAMBIT — RİSK ÖDÜLE DÖNÜŞTÜ', 2.1)
      } else {
        player.health = Math.min(player.maxHealth, player.health + 18)
        player.poise = player.maxPoise
        abilities.swift += 1
        announce('SHRINE — KORUNMA LÜTFU', 1.6)
      }
      spawnBurst(player.position, 0xe4c97d, 20, 5.5, 0.7)
      sfx.levelup()
    } else {
      state.relicTier++
      player.maxHealth += 8 + state.relicTier * 2
      player.health = Math.min(player.maxHealth, player.health + 10 + state.relicTier * 2)
      if (state.relicTier % 3 === 0) player.armor += 1
      if (state.relicTier % 2 === 0) abilities.crit += 1
      announce(`RELIC REZONANSI ${state.relicTier}`, 1.7)
      spawnBurst(player.position, 0xffc36a, 18, 4.5, 0.65)
      sfx.levelup()
    }
  }

  for (let i = markers.length - 1; i >= 0; i--) {
    if (markers[i].life <= 0 || markers[i].claimed) markers.splice(i, 1)
  }
}

function momentum(dt: number) {
  const player = getPlayer()
  if (!player) return
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  if (speed > 4) state.momentumBank = Math.min(100, state.momentumBank + dt * (speed - 3) * (1 + abilities.momentum * 0.12))
  state.momentumCooldown -= dt
  if (state.momentumBank < 35 || state.momentumCooldown > 0) return
  state.momentumCooldown = 2.2
  const power = state.momentumBank * 0.15
  state.momentumBank *= 0.4
  for (const e of livingNear(player.position, 4.8, 20)) {
    e.health -= power
    tmp.subVectors(e.position, player.position).setY(0)
    if (tmp.lengthSq() > 0.01) e.velocity.addScaledVector(tmp.normalize(), 4 + power * 0.15)
    e.hitFlash = 1
  }
  gameState.shake = Math.min(1, gameState.shake + 0.18)
  spawnBurst(player.position, 0xf2b871, 10, 5, 0.4)
}

function magnet(dt: number) {
  const player = getPlayer()
  if (!player || abilities.magnet <= 0 || gameState.combo < 10) return
  state.magnetCooldown -= dt
  const pull = 2 + Math.min(6, gameState.combo * 0.08)
  for (const particle of particles.entities) {
    if (!particle.wisp || (particle.life ?? 0) <= 0) continue
    const distance2 = particle.position.distanceToSquared(player.position)
    if (distance2 > 16 * 16) continue
    tmp.subVectors(player.position, particle.position)
    const distance = Math.sqrt(distance2) || 1
    particle.velocity.lerp(tmp.divideScalar(distance).multiplyScalar(pull), 0.5)
    if (distance < 0.6) {
      particle.life = 0
      if (state.magnetCooldown <= 0) {
        state.magnetCooldown = 0.15
        gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.1)
      }
    }
  }
}

function arenaPulse(dt: number) {
  const player = getPlayer()
  if (!player) return
  state.arenaPulseTimer -= dt
  if (state.arenaPulseTimer > 0) return
  state.arenaPulseTimer = Math.max(22, 36 - gameState.wave * 0.3)
  for (const e of enemies.entities) {
    if (e.dead) continue
    e.health -= 2 + gameState.wave * 0.25
    tmp.subVectors(e.position, player.position).setY(0)
    if (tmp.lengthSq() > 0.01) e.velocity.addScaledVector(tmp.normalize(), 1.8)
  }
  player.poise = player.maxPoise
  player.invuln = Math.max(player.invuln ?? 0, 0.35)
  gameState.shake = Math.min(1, gameState.shake + 0.35)
  spawnBurst(player.position, 0xffb15c, 24, 6, 0.6)
  announce('ARENA PULSE — ALAN YENİLENDİ', 1.5)
}

function ascension(dt: number) {
  const player = getPlayer()
  if (!player) return
  if (state.ascension <= 0 && gameState.time >= 420) {
    state.ascension = 20
    state.ascensionPulse = 0
    announce('ASCENSION — TÜM SİSTEMLER GÜÇLENDİ', 2.8)
    spawnBurst(player.position, 0xffe2a2, 48, 9, 1)
    sfx.levelup()
  }
  if (state.ascension <= 0) return
  state.ascension -= dt
  state.ascensionPulse -= dt
  if (state.ascensionPulse <= 0) {
    state.ascensionPulse = 1.4
    for (const e of livingNear(player.position, 8, 24)) {
      e.health -= 4 + abilities.ferocity
      e.velocity.multiplyScalar(1.12)
    }
    player.poise = player.maxPoise
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + 0.3)
    spawnBurst(player.position, 0xffe2a2, 12, 4, 0.35)
  }
}

function elementOverdrive(dt: number) {
  const player = getPlayer()
  if (!player) return
  state.elementCooldown -= dt
  if (state.elementCooldown > 0) return
  const element = dominantElement()
  if (!element) return
  const level = Math.max(1, Math.floor({
    pyro: abilities.pyre,
    cryo: abilities.frost,
    storm: abilities.storm,
    venom: abilities.venom,
    void: abilities.vortex,
    iron: abilities.armor,
    blood: abilities.rage,
  }[element]))
  if (level < 4) return
  state.elementCooldown = Math.max(0.8, 2.8 - level * 0.08)
  const radius = 4.5 + Math.min(5, level * 0.25)
  const power = 2 + level * 0.45 + (state.ascension > 0 ? 4 : 0)
  for (const e of livingNear(player.position, radius, 40)) {
    switch (element) {
      case 'pyro': e.health -= power; break
      case 'cryo': e.health -= power * 0.75; e.slow = Math.max(e.slow ?? 0, 1.2); break
      case 'storm': e.health -= power * 0.8; break
      case 'venom': e.health -= power * 1.15; break
      case 'void':
        e.health -= power * 0.9
        tmp.subVectors(player.position, e.position).setY(0)
        if (tmp.lengthSq() > 0.01) e.velocity.addScaledVector(tmp.normalize(), 2.2 + level * 0.1)
        break
      case 'iron': e.armor = Math.max(0, e.armor - 1); break
      case 'blood': e.health -= power * 0.9; player.health = Math.min(player.maxHealth, player.health + power * 0.08); break
    }
  }
  spawnBurst(player.position, element === 'pyro' ? 0xff632f : element === 'cryo' ? 0x8fd8ff : element === 'storm' ? 0xcfeeff : element === 'venom' ? 0x6fd889 : element === 'void' ? 0xa995ff : element === 'iron' ? 0xd0b991 : 0xd52e38, 6 + Math.min(10, level), 3.5, 0.32)
}

function comboExtension(dt: number) {
  if (gameState.combo >= 25 && gameState.comboTimer > 0) {
    gameState.comboTimer = Math.min(4.25, gameState.comboTimer + dt * (0.014 + abilities.adrenaline * 0.001))
  }
}

function resetInternal() {
  state.elapsedSinceHit = 0
  state.revenge = 0
  state.dodgeCharge = 0
  state.echoCooldown = 0
  state.detonationCooldown = 0
  state.adaptive = 1
  state.lastWave = 0
  state.streakTier = 0
  state.bossFightTime = 0
  state.lastBossRatio = 1
  state.ascension = 0
  state.ascensionPulse = 0
  state.executionChain = 0
  state.executionWindow = 0
  state.momentumBank = 0
  state.momentumCooldown = 0
  state.hazardTimer = 8
  state.mutatorLevel = 0
  state.shrineTimer = 35
  state.relicTimer = 0
  state.relicTier = 0
  state.lastLevel = 1
  state.arenaPulseTimer = 36
  state.magnetCooldown = 0
  state.lastHitHp = 100
  state.elementCooldown = 0
  hazards.length = 0
  markers.length = 0
}

function tick(dt: number) {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return

  applyBaselineModifiers()
  revengeAndDodge(dt)
  threatPressure(dt)
  adaptiveDifficulty(dt)
  swarmFormations()
  applyMutator()
  applyEliteAuras(dt)
  statusReactions(dt)
  critEcho(dt)
  detectDeathReactions(player)
  executeChain(dt)
  bossSystems(dt)
  hazards(dt)
  shrineAndRelic(dt)
  momentum(dt)
  magnet(dt)
  arenaPulse(dt)
  comboExtension(dt)
  elementOverdrive(dt)
  ascension(dt)

  const speedMultiplier = playerSpeedMultiplier(player)
  if (speedMultiplier > 1) {
    player.velocity.multiplyScalar(Math.min(1.35, 1 + (speedMultiplier - 1) * dt * 6))
  }
}

export function startMegaSystemsV2() {
  if (state.running || typeof window === 'undefined') return () => undefined
  resetInternal()
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
