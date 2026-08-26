import { abilities } from './abilities'
import { sfx } from './audio'
import { announce, enemies, gameState, getPlayer, spawnBurst, spawnEnemy, type Entity } from '../ecs/world'

export interface MegaFeature { id: number; name: string; description: string }

export const MEGA_FEATURES: MegaFeature[] = [
  { id: 1, name: 'Execution Chain', description: 'Zayıf hedefleri combo içinde ardışık infaz eder.' },
  { id: 2, name: 'Overkill Burst', description: 'Fazla öldürme hasarını yakındaki hedeflere taşır.' },
  { id: 3, name: 'Revenge Window', description: 'Hasar aldıktan sonra kısa süreli güç/hız kazanılır.' },
  { id: 4, name: 'Near-Death Frenzy', description: 'Düşük can durumunda savaş temposu yükselir.' },
  { id: 5, name: 'Perfect Dodge Charge', description: 'Dokunulmazlık pencereleri combo enerjisi üretir.' },
  { id: 6, name: 'Threat Pressure', description: 'Yoğun yakın sürü ekstra poise desteği verir.' },
  { id: 7, name: 'Armor Break', description: 'Kritik seri düşman zırhını geçici olarak kırar.' },
  { id: 8, name: 'Crit Echo', description: 'Kritikler gecikmeli ikinci darbe bırakır.' },
  { id: 9, name: 'Status Detonation', description: 'Birden çok status birleşince patlar.' },
  { id: 10, name: 'Freeze Shatter', description: 'Donmuş hedefler ağır darbede parçalanır.' },
  { id: 11, name: 'Burn Spread', description: 'Yanma yakındaki düşmanlara sıçrar.' },
  { id: 12, name: 'Shock Chain', description: 'Şoklu hedef elektrik sıçraması yapar.' },
  { id: 13, name: 'Poison Rupture', description: 'Düşük canlı zehirli hedefler zehir patlaması bırakır.' },
  { id: 14, name: 'Bleed Siphon', description: 'Kanayan hedefler küçük iyileşme sağlar.' },
  { id: 15, name: 'Void Implosion', description: 'Void odaklı build sürüyü merkeze çeker.' },
  { id: 16, name: 'Elemental Overdrive', description: 'Dominant element güç seviyelerine göre yoğunlaşır.' },
  { id: 17, name: 'Combo Time Extension', description: 'Yüksek combo zaman penceresini uzatır.' },
  { id: 18, name: 'Adaptive Difficulty', description: 'Run gücüne göre spawn baskısı ayarlanır.' },
  { id: 19, name: 'Elite Aura', description: 'Elite çevresindeki düşmanları güçlendirir.' },
  { id: 20, name: 'Boss Phase Shockwave', description: 'Boss faz değişimlerinde alan şoku oluşur.' },
  { id: 21, name: 'Boss Soft Enrage', description: 'Uzayan boss savaşı kontrollü şekilde hızlanır.' },
  { id: 22, name: 'Swarm Formations', description: 'Dalga dönemeçlerinde formasyon baskısı oluşur.' },
  { id: 23, name: 'Hazard Evolution', description: 'Uzun run hazard yoğunluğunu arttırır.' },
  { id: 24, name: 'Mutator Escalation', description: 'Uzun run mutator baskısını kademeli yükseltir.' },
  { id: 25, name: 'Shrine Gambit', description: 'Yüksek risk sırasında shrine ödülleri güçlenir.' },
  { id: 26, name: 'Relic Resonance', description: 'Biriken kalıcı güçlendirmeler sinerji oluşturur.' },
  { id: 27, name: 'Momentum Banking', description: 'Yüksek hareket hızı savaş temposuna dönüşür.' },
  { id: 28, name: 'Magnet Surge', description: 'Combo yükselince XP çekim hissi güçlenir.' },
  { id: 29, name: 'Last Stand Charge', description: 'Uzun süre hasarsız kalmak ikinci şansı güçlendirir.' },
  { id: 30, name: 'Arena Pulse', description: 'Dalga değişimlerinde arena enerji darbesi oluşur.' },
  { id: 31, name: 'Kill Streak Rewards', description: 'Kesim eşikleri mikro ödül verir.' },
  { id: 32, name: 'Risk Heat', description: 'Düşük can + yüksek combo risk çarpanı üretir.' },
  { id: 33, name: 'Ascension Threshold', description: 'Uzun run sonunda geçici Ascension modu açılır.' },
]

const state = {
  running: false, frame: 0, last: 0, revenge: 0, dodge: 0, detonate: 0, echo: 0,
  adaptive: 1, lastWave: 0, streak: 0, lastBossHp: 1, ascension: 0, lastHitHp: 100,
}

interface Reaction { burn: number; poison: number; shock: number; bleed: number; freeze: number; armorBreak: number }
const reactions = new WeakMap<Entity, Reaction>()

function reaction(e: Entity): Reaction {
  let r = reactions.get(e)
  if (!r) {
    r = { burn: 0, poison: 0, shock: 0, bleed: 0, freeze: 0, armorBreak: 0 }
    reactions.set(e, r)
  }
  return r
}

function near(e: Entity, radius: number, max = Infinity): Entity[] {
  const out: Entity[] = []
  const r2 = radius * radius
  for (const other of enemies.entities) {
    if (other.dead || other === e) continue
    if (other.position.distanceToSquared(e.position) <= r2) {
      out.push(other)
      if (out.length >= max) break
    }
  }
  return out
}

function statusReactions(dt: number) {
  for (const e of enemies.entities) {
    if (e.dead) continue
    const r = reaction(e)
    if (r.burn > 0) {
      r.burn = Math.max(0, r.burn - dt)
      if (Math.random() < dt * 0.9) for (const n of near(e, 1.8, 2)) reaction(n).burn = Math.max(reaction(n).burn, 0.8)
    }
    if (r.poison > 0) {
      r.poison = Math.max(0, r.poison - dt)
      if (r.poison < 0.7 && e.health / Math.max(1, e.maxHealth) < 0.2 && Math.random() < dt * 0.8) {
        e.health -= 4 + abilities.venom
        for (const n of near(e, 2.1, 4)) reaction(n).poison = Math.max(reaction(n).poison, 0.7)
        spawnBurst(e.position, 0x6fd889, 5, 2.8, 0.28)
      }
    }
    if (r.shock > 0) {
      r.shock = Math.max(0, r.shock - dt)
      if (Math.random() < dt * 1.4) {
        const n = near(e, 2.4, 1)[0]
        if (n) {
          reaction(n).shock = Math.max(reaction(n).shock, 0.8)
          n.health -= 2 + abilities.storm * 0.5
          spawnBurst(n.position, 0xcfeeff, 2, 2, 0.2)
        }
      }
    }
    if (r.bleed > 0) r.bleed = Math.max(0, r.bleed - dt)
    if (r.freeze > 0) r.freeze = Math.max(0, r.freeze - dt)
    r.armorBreak = Math.max(0, r.armorBreak - dt)
    if (e.health <= 0) e.dead = true
  }
}

function detonate(dt: number) {
  state.detonate -= dt
  if (state.detonate > 0) return
  state.detonate = 0.24
  for (const e of enemies.entities) {
    if (e.dead) continue
    const r = reaction(e)
    const stacks = Number(r.burn > 0) + Number(r.poison > 0) + Number(r.shock > 0) + Number(r.bleed > 0) + Number(r.freeze > 0)
    if (stacks < 2) continue
    e.health -= 3 + stacks * 2 + abilities.ferocity * 0.5
    e.hitFlash = 1
    if (e.health <= 0) e.dead = true
    if (stacks >= 4) {
      spawnBurst(e.position, r.freeze > 0 ? 0x9fdcff : 0xffb15c, 7, 4, 0.35)
      announce('DURUM PATLAMASI', 0.9)
    }
  }
}

function adaptive(dt: number) {
  const p = getPlayer()
  if (!p) return
  const target = 1 + Math.min(0.55, gameState.combo * 0.003) + Math.min(0.3, gameState.time / 900)
  state.adaptive += (target - state.adaptive) * Math.min(1, dt * 0.4)
  if (state.adaptive > 1.12 && gameState.time > 30 && Math.random() < dt * 0.14) spawnEnemy(p.position)
}

function threat(dt: number) {
  const p = getPlayer()
  if (!p) return
  let count = 0
  for (const e of enemies.entities) if (!e.dead && e.position.distanceToSquared(p.position) < 16) count++
  if (count >= 8) p.poise = Math.min(p.maxPoise, p.poise + dt * (1.2 + count * 0.08 + abilities.bulwark))

  const hpRatio = p.health / Math.max(1, p.maxHealth)
  const risk = Math.min(1, (1 - hpRatio) * 0.7 + gameState.combo / 180)
  if (risk > 0.7 && gameState.combo >= 20) p.health = Math.min(p.maxHealth, p.health + dt * 0.35 * (1 + abilities.harvest * 0.1))

  if ((p.invuln ?? 0) > 0) state.dodge = Math.min(100, state.dodge + dt * 24)
  if (state.dodge >= 100) {
    state.dodge = 0
    gameState.comboTimer = Math.min(3.4, gameState.comboTimer + 0.7)
    spawnBurst(p.position, 0x9fdcff, 8, 3.2, 0.3)
  }

  if (p.health < state.lastHitHp - 0.1) state.revenge = 2.4
  state.lastHitHp = p.health
  state.revenge = Math.max(0, state.revenge - dt)
  if (state.revenge > 0) p.velocity.multiplyScalar(1 + dt * 0.12)
}

function combatEcho(dt: number) {
  const p = getPlayer()
  if (!p) return
  state.echo -= dt
  for (const e of enemies.entities) {
    if (e.dead) continue
    const r = reaction(e)
    if (e.lastCrit && state.echo <= 0) {
      state.echo = 0.14
      e.health -= Math.max(1, (e.lastDmg ?? 0) * 0.22)
      spawnBurst(e.position, 0xffe8a0, 2, 2.5, 0.2)
    }
    if (r.freeze > 0 && (e.lastDmg ?? 0) > e.maxHealth * 0.045) {
      e.health -= Math.max(1, (e.lastDmg ?? 0) * 0.12)
      r.freeze = 0
      spawnBurst(e.position, 0x9fdcff, 8, 4, 0.3)
    }
    if (r.armorBreak > 0) e.armor = Math.max(0, e.armor - Math.ceil(abilities.crit * 0.2))
    if (e.lastCrit || gameState.combo >= 12) r.armorBreak = Math.max(r.armorBreak, 0.7 + abilities.crit * 0.04)
    if (r.bleed > 0) p.health = Math.min(p.maxHealth, p.health + Math.min(1.8, (e.lastDmg ?? 0) * 0.01) * dt * 4)
    if (e.health <= 0) e.dead = true
  }
}

function milestones() {
  const p = getPlayer()
  if (!p) return
  const streak = Math.floor(gameState.kills / 25)
  if (streak > state.streak) {
    state.streak = streak
    if (streak % 2 === 0) gameState.comboTimer = Math.min(3.4, gameState.comboTimer + 0.5)
    if (streak % 4 === 0) p.health = Math.min(p.maxHealth, p.health + 10)
    if (streak % 4 === 0) {
      announce(`${streak * 25} KESİM — SAVAŞ ÖDÜLÜ`, 1.5)
      spawnBurst(p.position, 0xffd15e, 8, 3.2, 0.3)
    }
  }
  if (gameState.wave > state.lastWave) {
    state.lastWave = gameState.wave
    p.poise = p.maxPoise
    if (gameState.wave % 2 === 0) gameState.comboTimer = Math.min(3.4, gameState.comboTimer + 0.6)
    if (gameState.wave % 4 === 0) {
      spawnEnemy(p.position)
      spawnEnemy(p.position)
      announce('SÜRÜ FORMASYONU — ÇİFT KANAT', 1.7)
    }
    spawnBurst(p.position, 0xffb15c, 10, 4, 0.4)
    sfx.tier()
  }
}

function bossPhases() {
  const p = getPlayer()
  if (!p) return
  let boss: Entity | undefined
  for (const e of enemies.entities) if (!e.dead && (e.maxHealth > 250 || (e.scale ?? 0) > 2.2)) { boss = e; break }
  if (!boss) { state.lastBossHp = 1; return }
  const ratio = boss.health / Math.max(1, boss.maxHealth)
  if (ratio < 0.66 && state.lastBossHp >= 0.66) {
    boss.velocity.multiplyScalar(0.72)
    p.invuln = Math.max(p.invuln ?? 0, 0.35)
    spawnBurst(boss.position, 0xff9a4d, 24, 6, 0.6)
    announce('MUHAFIZ FAZI II — ŞOK', 1.8)
    sfx.storm()
  }
  if (ratio < 0.33 && state.lastBossHp >= 0.33) {
    boss.velocity.multiplyScalar(1.15)
    p.health = Math.max(1, p.health - 4)
    spawnBurst(boss.position, 0xd52e38, 32, 7, 0.75)
    announce('MUHAFIZ FAZI III — KANLI ÖFKE', 2)
    sfx.die()
  }
  state.lastBossHp = ratio
}

function ascension() {
  if (gameState.time < 420 || state.ascension > 0) return
  const p = getPlayer()
  if (!p) return
  state.ascension = 18
  p.invuln = Math.max(p.invuln ?? 0, 0.5)
  gameState.shake = 1
  announce('ASCENSION — TÜM GÜÇLER UYANIYOR', 3)
  spawnBurst(p.position, 0xffe2a2, 48, 9, 1)
  sfx.levelup()
}

function tick(dt: number) {
  const p = getPlayer()
  if (!p || gameState.phase !== 'playing') return
  if (state.ascension > 0) {
    state.ascension = Math.max(0, state.ascension - dt)
    p.invuln = Math.max(p.invuln ?? 0, 0.08)
    gameState.comboTimer = Math.min(3.4, gameState.comboTimer + dt * 0.05)
  }
  adaptive(dt)
  threat(dt)
  statusReactions(dt)
  detonate(dt)
  combatEcho(dt)
  milestones()
  bossPhases()
  ascension()
  if (abilities.momentum > 0 && Math.hypot(p.velocity.x, p.velocity.z) > 4) p.health = Math.min(p.maxHealth, p.health + dt * 0.12 * abilities.momentum)
  if (abilities.magnet > 0 && gameState.combo >= 10 && Math.random() < dt * 0.15) gameState.comboTimer = Math.min(3.4, gameState.comboTimer + 0.15)
  if (gameState.combo >= 25 && gameState.comboTimer > 0) gameState.comboTimer = Math.min(3.4, gameState.comboTimer + dt * 0.01)
}

export function startMegaSystems() {
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
  return stopMegaSystems
}

export function stopMegaSystems() {
  state.running = false
  if (state.frame) window.cancelAnimationFrame(state.frame)
  state.frame = 0
  state.last = 0
}

export function resetMegaSystems() {
  state.last = 0
  state.revenge = 0
  state.dodge = 0
  state.echo = 0
  state.detonate = 0
  state.adaptive = 1
  state.lastWave = 0
  state.streak = 0
  state.lastBossHp = 1
  state.ascension = 0
  state.lastHitHp = 100
}
