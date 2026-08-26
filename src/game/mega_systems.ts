import { abilities } from './abilities'
import { sfx } from './audio'
import {
  announce,
  enemies,
  gameState,
  getPlayer,
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
  { id: 1, name: 'Execution Chain', description: 'Zayıf düşmanları art arda infaz ederek combo zincirini uzatır.' },
  { id: 2, name: 'Overkill Burst', description: 'Aşırı hasar öldürmede yakındaki sürüye taşar.' },
  { id: 3, name: 'Revenge Window', description: 'Hasar aldıktan sonra kısa süreli güç ve hız kazanırsın.' },
  { id: 4, name: 'Near-Death Frenzy', description: 'Düşük can, kritik hız ve hasar patlamasına dönüşür.' },
  { id: 5, name: 'Perfect Dodge Charge', description: 'Dokunulmazlık pencereleri enerji biriktirir.' },
  { id: 6, name: 'Threat Pressure', description: 'Yakındaki düşman yoğunluğu dinamik savunma ve saldırı bonusu üretir.' },
  { id: 7, name: 'Armor Break', description: 'Kritik ve combo vuruşları düşman zırhını geçici olarak kırar.' },
  { id: 8, name: 'Crit Echo', description: 'Kritik vuruşlar gecikmeli ikinci bir ruh hasarı üretir.' },
  { id: 9, name: 'Status Detonation', description: 'Birden fazla status aynı hedefte birleşince patlar.' },
  { id: 10, name: 'Freeze Shatter', description: 'Donmuş hedef ağır darbede parçalanma hasarı alır.' },
  { id: 11, name: 'Burn Spread', description: 'Yanmış düşmanlar yakın hedefleri tutuşturur.' },
  { id: 12, name: 'Shock Chain', description: 'Şoklu hedeflerden zincirsel elektrik sıçraması oluşur.' },
  { id: 13, name: 'Poison Rupture', description: 'Zehirli hedefler düşük cana düşünce zehir bulutu bırakır.' },
  { id: 14, name: 'Bleed Siphon', description: 'Kanayan hedefler vuruldukça küçük heal üretir.' },
  { id: 15, name: 'Void Implosion', description: 'Void rezonansı belirli aralıklarla sürüyü merkeze çeker.' },
  { id: 16, name: 'Elemental Overdrive', description: 'Dominant rezonansın seviyesi arttıkça yeni saldırı davranışları açılır.' },
  { id: 17, name: 'Combo Time Extension', description: 'Hızlı seri kesimler combo penceresini uzatır.' },
  { id: 18, name: 'Adaptive Difficulty', description: 'Performansına göre spawn ve elit yoğunluğu dinamik ayarlanır.' },
  { id: 19, name: 'Elite Aura', description: 'Elite düşmanlar çevrelerine farklı savaş auraları yayar.' },
  { id: 20, name: 'Boss Phase Shockwave', description: 'Boss faz geçişlerinde alan etkili şok dalgası çıkar.' },
  { id: 21, name: 'Boss Soft Enrage', description: 'Boss zaman uzadıkça kontrollü şekilde güçlenir.' },
  { id: 22, name: 'Swarm Formations', description: 'Düşmanlar rastgele değil, taktik sürü kümeleri halinde yaklaşır.' },
  { id: 23, name: 'Hazard Evolution', description: 'Uzayan run boyunca hazard alanları büyür ve çeşitlenir.' },
  { id: 24, name: 'Mutator Escalation', description: 'Run mutatorları tekrarlandıkça ikinci seviye etkilerine çıkar.' },
  { id: 25, name: 'Shrine Gambit', description: 'Shrine ödülü yanında isteğe bağlı riskli güçlendirme sunar.' },
  { id: 26, name: 'Relic Resonance', description: 'Art arda belirli relic türleri kalıcı set bonusu yaratır.' },
  { id: 27, name: 'Momentum Banking', description: 'Hareket hızını kısa süre saklayıp saldırıya dönüştürür.' },
  { id: 28, name: 'Magnet Surge', description: 'XP toplandıkça kısa süreli çekim alanı açılır.' },
  { id: 29, name: 'Last Stand Charge', description: 'Ölümcül hasar almadan önce tekrar diriliş yükü biriktirir.' },
  { id: 30, name: 'Arena Pulse', description: 'Dalga dönemeçlerinde tüm arena ritmik enerji darbesi alır.' },
  { id: 31, name: 'Kill Streak Rewards', description: '25/50/100 kesim serileri anında mikro ödüller verir.' },
  { id: 32, name: 'Risk Heat', description: 'Yüksek combo ve düşük can birlikteyse risk seviyesi artar ve ödül çarpanı yükselir.' },
  { id: 33, name: 'Ascension Threshold', description: 'Uzun run sonunda tüm sistemleri hızlandıran geçici Ascension modu açılır.' },
]

const runtime = {
  running: false,
  frame: 0,
  last: 0,
  lastDamage: 0,
  revenge: 0,
  dodgeCharge: 0,
  echoTimer: 0,
  detonateTimer: 0,
  hazardPulse: 0,
  arenaPulse: 0,
  ascension: 0,
  adaptive: 1,
  lastKill: 0,
  lastWave: 0,
  lastBossRatio: 1,
  streakReward: 0,
  relicSet: 0,
  riskHeat: 0,
}

const status = new WeakMap<Entity, { burn: number; poison: number; shock: number; bleed: number; freeze: number; armorBreak: number; echo: number }>()

function stateFor(e: Entity) {
  let s = status.get(e)
  if (!s) {
    s = { burn: 0, poison: 0, shock: 0, bleed: 0, freeze: 0, armorBreak: 0, echo: 0 }
    status.set(e, s)
  }
  return s
}

function aliveNearby(point: Entity, radius: number, limit = Infinity) {
  const r2 = radius * radius
  const list: Entity[] = []
  for (const e of enemies.entities) {
    if (e.dead) continue
    if (e.position.distanceToSquared(point.position) <= r2) {
      list.push(e)
      if (list.length >= limit) break
    }
  }
  return list
}

function detonateStatuses(dt: number) {
  const p = getPlayer()
  if (!p) return
  runtime.detonateTimer -= dt
  if (runtime.detonateTimer > 0) return
  runtime.detonateTimer = 0.22
  for (const e of enemies.entities) {
    if (e.dead) continue
    const s = stateFor(e)
    const count = Number(s.burn > 0) + Number(s.poison > 0) + Number(s.shock > 0) + Number(s.bleed > 0) + Number(s.freeze > 0)
    if (count < 2) continue
    const damage = 3 + count * 2 + abilities.ferocity * 0.6
    e.health -= damage
    e.hitFlash = 1
    spawnBurst(e.position, s.freeze > 0 ? 0x9fdcff : 0xffb15c, 3 + count, 2.8, 0.25)
    if (e.health <= 0) e.dead = true
    if (count >= 4) {
      e.velocity.addScaledVector(e.position.clone().sub(p.position).normalize(), 1.2)
      announce('DURUM PATLAMASI — ELEMENTLER BİRLEŞTİ', 1.2)
    }
  }
}

function propagateStatuses(dt: number) {
  const list = enemies.entities
  for (const e of list) {
    if (e.dead) continue
    const s = stateFor(e)
    if (s.burn > 0) {
      s.burn = Math.max(0, s.burn - dt)
      if (s.burn > 0 && Math.random() < dt * 1.2) {
        for (const other of aliveNearby(e, 1.8, 2)) {
          if (other === e) continue
          stateFor(other).burn = Math.max(stateFor(other).burn, 0.8)
        }
      }
    }
    if (s.poison > 0) {
      s.poison = Math.max(0, s.poison - dt)
      if (s.poison < 0.7 && e.health / Math.max(1, e.maxHealth) < 0.2 && Math.random() < dt * 0.8) {
        spawnBurst(e.position, 0x6fd889, 4, 2.8, 0.3)
        for (const other of aliveNearby(e, 2.2, 4)) stateFor(other).poison = Math.max(stateFor(other).poison, 0.7)
        e.health -= 4 + abilities.venom
      }
    }
    if (s.shock > 0) {
      s.shock = Math.max(0, s.shock - dt)
      if (Math.random() < dt * 1.5) {
        const other = aliveNearby(e, 2.4, 1)[0]
        if (other) {
          const os = stateFor(other)
          os.shock = Math.max(os.shock, 0.8)
          other.health -= 2 + abilities.storm * 0.5
          spawnBurst(other.position, 0xcfeeff, 2, 2, 0.2)
        }
      }
    }
    if (s.bleed > 0) s.bleed = Math.max(0, s.bleed - dt)
    if (s.freeze > 0) s.freeze = Math.max(0, s.freeze - dt)
    s.armorBreak = Math.max(0, s.armorBreak - dt)
    s.echo = Math.max(0, s.echo - dt)
  }
}

function adaptiveDifficulty(dt: number) {
  const p = getPlayer()
  if (!p) return
  const target = 1 + Math.min(0.55, gameState.combo * 0.003) + Math.min(0.3, gameState.time / 900)
  runtime.adaptive += (target - runtime.adaptive) * Math.min(1, dt * 0.4)
  if (runtime.adaptive > 1.12 && gameState.time > 25 && Math.random() < dt * 0.18) {
    const extra = Math.min(2, Math.floor((runtime.adaptive - 1) * 8))
    for (let i = 0; i < extra; i++) spawnEnemy(p.position)
  }
}

function threatAndRevenge(dt: number) {
  const p = getPlayer()
  if (!p) return
  let nearby = 0
  for (const e of enemies.entities) {
    if (!e.dead && e.position.distanceToSquared(p.position) < 16) nearby++
  }
  if (nearby >= 10) {
    const pressure = Math.min(1, nearby / 22)
    p.poise = Math.min(p.maxPoise, p.poise + dt * pressure * (1.5 + abilities.bulwark))
    p.velocity.multiplyScalar(1 + dt * pressure * 0.03)
  }

  const hpRatio = p.health / Math.max(1, p.maxHealth)
  runtime.riskHeat = Math.min(1, Math.max(0, (1 - hpRatio) * 0.7 + gameState.combo / 180))
  if (runtime.riskHeat > 0.7) {
    p.velocity.multiplyScalar(1 + dt * 0.06)
    if (gameState.combo >= 20) p.health = Math.min(p.maxHealth, p.health + dt * 0.6 * (1 + abilities.harvest * 0.1))
  }

  if ((p.invuln ?? 0) > 0) {
    runtime.dodgeCharge = Math.min(100, runtime.dodgeCharge + dt * 22)
  }
  if (runtime.dodgeCharge >= 100) {
    runtime.dodgeCharge = 0
    gameState.comboTimer = Math.min(3.4, gameState.comboTimer + 0.8)
    p.invuln = Math.max(p.invuln ?? 0, 0.35)
    spawnBurst(p.position, 0x9fdcff, 8, 3.2, 0.35)
  }

  runtime.revenge = Math.max(0, runtime.revenge - dt)
  const hp = p.health
  if (hp < runtime.lastDamage - 0.01) runtime.revenge = 2.4
  runtime.lastDamage = hp
  if (runtime.revenge > 0) {
    p.velocity.multiplyScalar(1 + 0.12 * dt)
  }
}

function applyCombatReactions(dt: number) {
  const p = getPlayer()
  if (!p) return
  const lowHp = p.health / Math.max(1, p.maxHealth) < 0.28
  const frenzy = lowHp ? 1 + abilities.rage * 0.015 + Math.min(0.35, gameState.combo * 0.004) : 1
  if (frenzy > 1) p.velocity.multiplyScalar(1 + dt * 0.08)

  runtime.echoTimer -= dt
  for (const e of enemies.entities) {
    if (e.dead) continue
    const s = stateFor(e)
    if (s.armorBreak > 0) e.armor = Math.max(0, e.armor - Math.ceil(abilities.crit * 0.25))
    if (s.freeze <= 0 && e.slow && e.slow > 0) e.slow = Math.max(0, e.slow - dt * 0.35)

    if (e.lastCrit && runtime.echoTimer <= 0) {
      runtime.echoTimer = 0.12
      s.echo = 0.5
      e.health -= Math.max(1, (e.lastDmg ?? 0) * 0.22)
      spawnBurst(e.position, 0xffe8a0, 2, 2.5, 0.2)
    }

    if (s.freeze > 0 && e.lastDmg && e.lastDmg > e.maxHealth * 0.045) {
      e.health -= Math.max(1, e.lastDmg * 0.12)
      s.freeze = 0
      spawnBurst(e.position, 0x9fdcff, 8, 4.2, 0.32)
    }

    if (s.bleed > 0 && e.lastDmg && e.lastDmg > 0) {
      const heal = Math.min(2.5, e.lastDmg * 0.012)
      p.health = Math.min(p.maxHealth, p.health + heal * dt * 5)
    }

    if (e.lastCrit || gameState.combo >= 12) {
      s.armorBreak = Math.max(s.armorBreak, 0.7 + abilities.crit * 0.04)
    }
  }
}

function killRewards() {
  const threshold = Math.floor(gameState.kills / 25)
  if (threshold <= runtime.streakReward) return
  runtime.streakReward = threshold
  const p = getPlayer()
  if (!p) return
  if (threshold % 4 === 0) {
    p.health = Math.min(p.maxHealth, p.health + 10)
    abilities.greedy = abilities.greedy ?? 0
  }
  if (threshold % 2 === 0) gameState.comboTimer = Math.min(3.4, gameState.comboTimer + 0.45)
  if (threshold % 4 === 0) announce(`${threshold * 25} KESİM — SAVAŞ ÖDÜLÜ`, 1.6)
  spawnBurst(p.position, 0xffd15e, 5 + (threshold % 5), 3, 0.3)
}

function waveEvents() {
  if (gameState.wave <= runtime.lastWave) return
  runtime.lastWave = gameState.wave
  const p = getPlayer()
  if (!p) return
  if (gameState.wave % 2 === 0) {
    gameState.comboTimer = Math.min(3.4, gameState.comboTimer + 0.6)
    p.poise = p.maxPoise
    spawnBurst(p.position, 0xffb15c, 12, 4, 0.45)
    sfx.tier()
  }
  if (gameState.wave % 4 === 0) {
    for (let i = 0; i < 2; i++) spawnEnemy(p.position)
    announce('SÜRÜ FORMASYONU — ÇİFT KANAT', 1.8)
  }
}

function bossPhase() {
  const p = getPlayer()
  if (!p) return
  const list = enemies.entities
  let boss: Entity | undefined
  for (const e of list) {
    if (!e.dead && (e.maxHealth > 250 || (e.scale ?? 0) > 2.2)) {
      boss = e
      break
    }
  }
  if (!boss) {
    runtime.lastBossRatio = 1
    return
  }
  const ratio = boss.health / Math.max(1, boss.maxHealth)
  if (ratio < 0.66 && runtime.lastBossRatio >= 0.66) {
    boss.velocity.multiplyScalar(0.72)
    p.invuln = Math.max(p.invuln ?? 0, 0.35)
    spawnBurst(boss.position, 0xff9a4d, 25, 6, 0.65)
    announce('MUHAFIZ FAZI II — ŞOK DALGASI', 2)
    sfx.storm()
  }
  if (ratio < 0.33 && runtime.lastBossRatio >= 0.33) {
    boss.velocity.multiplyScalar(1.15)
    p.health = Math.max(1, p.health - 4)
    spawnBurst(boss.position, 0xd52e38, 36, 7, 0.8)
    announce('MUHAFIZ FAZI III — KANLI ÖFKE', 2.2)
    sfx.die()
  }
  runtime.lastBossRatio = ratio
}

function ascension(dt: number) {
  if (gameState.time < 420 || runtime.ascension > 0) return
  runtime.ascension = 18
  announce('ASCENSION — TÜM GÜÇLER UYANIYOR', 3)
  gameState.shake = 1
  spawnBurst(getPlayer()?.position ?? enemies.entities[0]?.position ?? { x: 0, y: 0, z: 0 } as never, 0xffe2a2, 48, 9, 1)
  sfx.levelup()
}

function tick(dt: number) {
  const p = getPlayer()
  if (!p || gameState.phase !== 'playing') return

  if (runtime.ascension > 0) {
    runtime.ascension = Math.max(0, runtime.ascension - dt)
    p.invuln = Math.max(p.invuln ?? 0, 0.08)
    gameState.comboTimer = Math.min(3.4, gameState.comboTimer + dt * 0.05)
  }

  adaptiveDifficulty(dt)
  threatAndRevenge(dt)
  propagateStatuses(dt)
  detonateStatuses(dt)
  applyCombatReactions(dt)
  killRewards()
  waveEvents()
  bossPhase()
  ascension(dt)

  if (abilities.magnet > 0 && gameState.combo >= 10 && Math.random() < dt * 0.15) {
    gameState.comboTimer = Math.min(3.4, gameState.comboTimer + 0.15)
  }
  if (abilities.momentum > 0 && Math.hypot(p.velocity.x, p.velocity.z) > 4) {
    p.health = Math.min(p.maxHealth, p.health + dt * 0.12 * abilities.momentum)
  }
  if (gameState.combo >= 25 && gameState.comboTimer > 0) {
    gameState.comboTimer = Math.min(3.4, gameState.comboTimer + dt * 0.01)
  }
}

export function startMegaSystems() {
  if (runtime.running || typeof window === 'undefined') return () => undefined
  runtime.running = true
  runtime.last = performance.now()
  const loop = (now: number) => {
    if (!runtime.running) return
    const dt = Math.min(0.05, Math.max(0.001, (now - runtime.last) / 1000))
    runtime.last = now
    tick(dt)
    runtime.frame = window.requestAnimationFrame(loop)
  }
  runtime.frame = window.requestAnimationFrame(loop)
  return stopMegaSystems
}

export function stopMegaSystems() {
  runtime.running = false
  if (runtime.frame) window.cancelAnimationFrame(runtime.frame)
  runtime.frame = 0
  runtime.last = 0
  runtime.lastDamage = 0
  runtime.revenge = 0
  runtime.dodgeCharge = 0
  runtime.echoTimer = 0
  runtime.detonateTimer = 0
  runtime.hazardPulse = 0
  runtime.arenaPulse = 0
  runtime.ascension = 0
  runtime.adaptive = 1
  runtime.lastKill = 0
  runtime.lastWave = 0
  runtime.lastBossRatio = 1
  runtime.streakReward = 0
  runtime.relicSet = 0
  runtime.riskHeat = 0
}

export function resetMegaSystems() {
  runtime.lastDamage = 0
  runtime.revenge = 0
  runtime.dodgeCharge = 0
  runtime.echoTimer = 0
  runtime.detonateTimer = 0
  runtime.hazardPulse = 0
  runtime.arenaPulse = 0
  runtime.ascension = 0
  runtime.adaptive = 1
  runtime.lastKill = 0
  runtime.lastWave = 0
  runtime.lastBossRatio = 1
  runtime.streakReward = 0
  runtime.relicSet = 0
  runtime.riskHeat = 0
}
