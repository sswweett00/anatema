import { gameState, getPlayer, type Entity } from '../ecs/world'
import { abilities, hasSynergy, synLevel, type AbilityId } from './abilities'
import { events, type DamageElement } from './events'
import { nextRandom, randomInt, randomRange } from './rng'
import { onSimulationTick } from './simulation_clock'

/**
 * ANATEMA SKILL MASTERY V3
 *
 * This runtime layers a lightweight mastery/tempo system over the existing
 * ability engine. It does not replace ability damage; it reacts to the same
 * typed combat events and adds bounded, deterministic state transitions.
 */

type Stop = () => void
type ResonanceElement = 'fire' | 'ice' | 'shock' | 'poison' | 'bleed' | 'void'
type MasteryRank = 'novice' | 'adept' | 'veteran' | 'master' | 'ascendant'

interface AbilityMastery {
  uses: number
  hits: number
  crits: number
  kills: number
  reactions: number
  score: number
  rank: MasteryRank
}

interface ElementState {
  stacks: number
  expiresAt: number
  lastAt: number
  resonanceCount: number
}

interface PlayerTempo {
  overdrive: number
  stamina: number
  maxStamina: number
  perfectWindow: number
  castStreak: number
  hitStreak: number
  lastCastAt: number
  lastHitAt: number
  bossPhaseBonus: number
  waveBonus: number
}

interface WaveRewardState {
  wave: number
  claimed: boolean
  bonusXp: number
  bonusMultiplier: number
}

const mastery = new Map<AbilityId, AbilityMastery>()
const elementState = new Map<ResonanceElement, ElementState>()
const tempo: PlayerTempo = {
  overdrive: 0,
  stamina: 100,
  maxStamina: 100,
  perfectWindow: 0,
  castStreak: 0,
  hitStreak: 0,
  lastCastAt: -Infinity,
  lastHitAt: -Infinity,
  bossPhaseBonus: 0,
  waveBonus: 0,
}

const waveReward: WaveRewardState = {
  wave: 0,
  claimed: false,
  bonusXp: 0,
  bonusMultiplier: 1,
}

const elementColors: Record<ResonanceElement, number> = {
  fire: 0xff7042,
  ice: 0x9adfff,
  shock: 0xffe58a,
  poison: 0x7cff9c,
  bleed: 0xd94a6b,
  void: 0x9a72d8,
}

const rankThresholds: readonly [number, MasteryRank][] = [
  [0, 'novice'],
  [25, 'adept'],
  [100, 'veteran'],
  [350, 'master'],
  [900, 'ascendant'],
]

let running = false
let unsubscribeTick: Stop | undefined
let unsubscribeHit: Stop | undefined
let unsubscribeKill: Stop | undefined
let unsubscribeStatus: Stop | undefined
let unsubscribeReaction: Stop | undefined
let unsubscribeDodge: Stop | undefined
let unsubscribeLevel: Stop | undefined
let unsubscribeBossPhase: Stop | undefined
let unsubscribeWaveStart: Stop | undefined
let unsubscribeWaveEnd: Stop | undefined
let lastResonanceAt = -Infinity
let resonancePulse = 0
let masteryPulse = 0
let castDecay = 0
let hitDecay = 0
let staminaRegenCooldown = 0
let deterministicIndex = 0

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getOrCreateMastery(id: AbilityId): AbilityMastery {
  let state = mastery.get(id)
  if (!state) {
    state = { uses: 0, hits: 0, crits: 0, kills: 0, reactions: 0, score: 0, rank: 'novice' }
    mastery.set(id, state)
  }
  return state
}

function rankForScore(score: number): MasteryRank {
  let rank: MasteryRank = 'novice'
  for (const [threshold, candidate] of rankThresholds) {
    if (score >= threshold) rank = candidate
  }
  return rank
}

function masteryMultiplier(rank: MasteryRank): number {
  switch (rank) {
    case 'novice': return 1
    case 'adept': return 1.025
    case 'veteran': return 1.06
    case 'master': return 1.1
    case 'ascendant': return 1.16
  }
}

function player(): Entity | undefined {
  return getPlayer()
}

function gainMastery(id: AbilityId, score: number, hit = false, crit = false, kill = false): void {
  const state = getOrCreateMastery(id)
  state.uses += 1
  if (hit) state.hits += 1
  if (crit) state.crits += 1
  if (kill) state.kills += 1
  state.score = clamp(state.score + Math.max(0, finite(score)), 0, 1000000)
  const previous = state.rank
  state.rank = rankForScore(state.score)
  if (state.rank !== previous) {
    events.emit('ability:evolve', {
      abilityId: id,
      level: abilities[id],
      evolutionId: `mastery_${state.rank}`,
    })
    const p = player()
    if (p) {
      p.velocity.multiplyScalar(1 + (masteryMultiplier(state.rank) - 1) * 0.12)
      events.emit('combat:reaction', {
        reaction: 'execution',
        targetId: 'mastery',
        power: state.score,
      })
    }
  }
}

function classifyRecentAbility(): AbilityId | undefined {
  const owned: AbilityId[] = []
  for (const [id] of mastery) {
    if (abilities[id] > 0) owned.push(id)
  }
  if (owned.length === 0) return undefined
  return owned[deterministicIndex++ % owned.length]
}

function addElement(element: ResonanceElement, intensity: number): void {
  const current = elementState.get(element) ?? { stacks: 0, expiresAt: 0, lastAt: -Infinity, resonanceCount: 0 }
  current.stacks = clamp(current.stacks + Math.max(1, Math.floor(intensity)), 0, 12)
  current.expiresAt = gameState.time + 3.2
  current.lastAt = gameState.time
  elementState.set(element, current)
}

function dominantElement(): ResonanceElement | undefined {
  let best: ResonanceElement | undefined
  let bestStacks = 0
  for (const [element, state] of elementState) {
    if (state.expiresAt <= gameState.time) continue
    if (state.stacks > bestStacks) {
      bestStacks = state.stacks
      best = element
    }
  }
  return best
}

function triggerResonance(elementA: ResonanceElement, elementB: ResonanceElement): void {
  const a = elementState.get(elementA)
  const b = elementState.get(elementB)
  if (!a || !b) return
  if (a.expiresAt <= gameState.time || b.expiresAt <= gameState.time) return
  if (a.stacks < 2 || b.stacks < 2) return
  if (gameState.time - lastResonanceAt < 0.45) return
  lastResonanceAt = gameState.time
  const power = 12 + a.stacks * 4 + b.stacks * 4 + tempo.overdrive * 8
  const pair = `${elementA}+${elementB}`
  const reaction = pair.includes('fire+ice') || pair.includes('ice+fire')
    ? 'shatter'
    : pair.includes('fire+shock') || pair.includes('shock+fire')
      ? 'overload'
      : pair.includes('poison+bleed') || pair.includes('bleed+poison')
        ? 'rupture'
        : pair.includes('void+shock') || pair.includes('shock+void')
          ? 'voidburst'
          : 'detonate'
  events.emit('combat:reaction', {
    reaction,
    targetId: 'resonance',
    power,
  })
  a.resonanceCount += 1
  b.resonanceCount += 1
  a.stacks = Math.max(0, a.stacks - 2)
  b.stacks = Math.max(0, b.stacks - 2)
  resonancePulse = 0.5
  if (hasSynergy('frostconduit')) tempo.overdrive = clamp(tempo.overdrive + 0.12, 0, 1)
}

function processElementPairs(): void {
  const elements = [...elementState.keys()]
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      triggerResonance(elements[i], elements[j])
    }
  }
}

function regenStamina(dt: number): void {
  if (staminaRegenCooldown > 0) {
    staminaRegenCooldown = Math.max(0, staminaRegenCooldown - dt)
    return
  }
  const regen = 16 + abilities.celerity * 1.6 + (hasSynergy('celeritymirror') ? synLevel('celeritymirror') * 2 : 0)
  tempo.stamina = Math.min(tempo.maxStamina, tempo.stamina + regen * dt)
}

function decayTempo(dt: number): void {
  if (gameState.time - tempo.lastHitAt > 1.75) {
    hitDecay += dt
    if (hitDecay > 0.35) {
      hitDecay = 0
      tempo.hitStreak = Math.max(0, tempo.hitStreak - 1)
    }
  } else {
    hitDecay = 0
  }
  if (gameState.time - tempo.lastCastAt > 2.25) {
    castDecay += dt
    if (castDecay > 0.45) {
      castDecay = 0
      tempo.castStreak = Math.max(0, tempo.castStreak - 1)
    }
  } else {
    castDecay = 0
  }
  tempo.overdrive = clamp(
    tempo.overdrive - dt * (0.055 + (gameState.phase === 'playing' ? 0 : 0.02)),
    0,
    1,
  )
  tempo.perfectWindow = Math.max(0, tempo.perfectWindow - dt)
}

function updateOverdrive(dt: number): void {
  const hitGain = tempo.hitStreak * 0.0004
  const castGain = tempo.castStreak * 0.00025
  const masteryGain = masteryPulse > 0 ? 0.012 : 0
  tempo.overdrive = clamp(tempo.overdrive + dt * (hitGain + castGain) + masteryGain * dt, 0, 1)
  masteryPulse = Math.max(0, masteryPulse - dt)
  resonancePulse = Math.max(0, resonancePulse - dt)
  if (tempo.overdrive >= 0.85 && pulseTimerReady()) {
    const p = player()
    if (p) {
      p.invuln = Math.max(p.invuln ?? 0, 0.08)
      p.poise = Math.min(p.maxPoise, p.poise + 8)
    }
    gameState.shake = Math.min(1, gameState.shake + 0.04)
  }
}

let lastPulseAt = -Infinity
function pulseTimerReady(): boolean {
  if (gameState.time - lastPulseAt < 0.6) return false
  lastPulseAt = gameState.time
  return true
}

function tick(dt: number): void {
  if (gameState.phase !== 'playing') return
  regenStamina(dt)
  decayTempo(dt)
  updateOverdrive(dt)
  processElementPairs()
  for (const [element, state] of elementState) {
    if (state.expiresAt <= gameState.time) elementState.delete(element)
  }
  const p = player()
  if (!p) return
  tempo.maxStamina = 100 + abilities.celerity * 3 + abilities.resilience * 2
  if (tempo.stamina > tempo.maxStamina) tempo.stamina = tempo.maxStamina
  if (resonancePulse > 0 && hasSynergy('soulconduit')) {
    p.poise = Math.min(p.maxPoise, p.poise + dt * (4 + synLevel('soulconduit')))
  }
}

function onHit(payload: { damage: number; element: DamageElement; critical: boolean; targetId?: string }): void {
  if (gameState.phase !== 'playing') return
  tempo.hitStreak += 1
  tempo.lastHitAt = gameState.time
  const score = 1 + Math.min(10, payload.damage * 0.03) + (payload.critical ? 4 : 0)
  const ability = classifyRecentAbility()
  if (ability) gainMastery(ability, score, true, payload.critical)
  const supported: ResonanceElement[] = ['fire', 'ice', 'shock', 'poison', 'bleed', 'void']
  if (supported.includes(payload.element as ResonanceElement)) {
    addElement(payload.element as ResonanceElement, payload.critical ? 2 : 1)
  }
  if (payload.critical) {
    tempo.overdrive = clamp(tempo.overdrive + 0.035, 0, 1)
    masteryPulse = 0.2
  }
}

function onKill(payload: { damage: number; element: DamageElement; overkill: number; targetId?: string; elite: boolean; boss: boolean }): void {
  tempo.overdrive = clamp(tempo.overdrive + (payload.boss ? 0.08 : payload.elite ? 0.045 : 0.018), 0, 1)
  const ability = classifyRecentAbility()
  if (ability) gainMastery(ability, payload.boss ? 18 : payload.elite ? 7 : 2, false, false, true)
  if (payload.boss) {
    tempo.waveBonus += 0.08
    telemetryBossKillBoost()
  }
}

function telemetryBossKillBoost(): void {
  tempo.overdrive = clamp(tempo.overdrive + 0.06, 0, 1)
}

function onStatus(payload: { status: string; targetId?: string; duration: number; stacks: number }): void {
  const status = payload.status.toLowerCase()
  const supported: ResonanceElement[] = ['fire', 'ice', 'shock', 'poison', 'bleed', 'void']
  if (supported.includes(status as ResonanceElement)) addElement(status as ResonanceElement, payload.stacks)
}

function onReaction(payload: { reaction: string; targetId?: string; power: number }): void {
  tempo.overdrive = clamp(tempo.overdrive + Math.min(0.12, payload.power * 0.001), 0, 1)
  const ability = classifyRecentAbility()
  if (ability) gainMastery(ability, 6 + payload.power * 0.02)
}

function onDodge(payload: { perfect: boolean }): void {
  const p = player()
  if (!p) return
  if (payload.perfect) {
    tempo.perfectWindow = 0.32
    tempo.stamina = Math.min(tempo.maxStamina, tempo.stamina + 22)
    tempo.overdrive = clamp(tempo.overdrive + 0.07, 0, 1)
    tempo.hitStreak += 2
    gameState.xp += 3
    events.emit('combat:reaction', { reaction: 'execution', targetId: 'perfect-defense', power: 8 })
  } else {
    staminaRegenCooldown = 0.35
  }
}

function onLevel(payload: { level: number }): void {
  tempo.maxStamina = 100 + payload.level * 2.5 + abilities.celerity * 3
  tempo.stamina = Math.min(tempo.maxStamina, tempo.stamina + 18)
  const p = player()
  if (p) p.poise = Math.min(p.maxPoise, p.poise + payload.level * 0.4)
}

function onBossPhase(payload: { bossId: string; phase: number }): void {
  tempo.bossPhaseBonus = clamp(payload.phase * 0.05, 0, 0.25)
  tempo.overdrive = clamp(tempo.overdrive + tempo.bossPhaseBonus, 0, 1)
  const p = player()
  if (p) p.invuln = Math.max(p.invuln ?? 0, 0.1 + payload.phase * 0.03)
}

function onWaveStart(payload: { wave: number; budget: number }): void {
  waveReward.wave = payload.wave
  waveReward.claimed = false
  waveReward.bonusXp = Math.floor(Math.max(0, payload.budget) * 0.04)
  waveReward.bonusMultiplier = 1 + Math.min(0.25, payload.wave * 0.006)
  tempo.waveBonus = 0
  tempo.overdrive = clamp(tempo.overdrive + Math.min(0.08, payload.wave * 0.004), 0, 1)
}

function onWaveEnd(payload: { wave: number; elapsed: number }): void {
  if (waveReward.claimed || payload.wave !== waveReward.wave) return
  waveReward.claimed = true
  const efficiency = clamp(1 - payload.elapsed / Math.max(10, payload.wave * 3.2), 0, 1)
  const reward = Math.floor(waveReward.bonusXp + efficiency * 8 * waveReward.bonusMultiplier)
  waveReward.bonusXp = reward
  gameState.xp += reward
  tempo.waveBonus = clamp(tempo.waveBonus + efficiency * 0.16, 0, 0.5)
  events.emit('loot:pickup', { kind: 'wave-bonus', rarity: efficiency > 0.75 ? 'epic' : 'rare' })
}

function startListeners(): void {
  unsubscribeHit = events.on('combat:hit', onHit)
  unsubscribeKill = events.on('combat:kill', onKill)
  unsubscribeStatus = events.on('combat:status', onStatus)
  unsubscribeReaction = events.on('combat:reaction', onReaction)
  unsubscribeDodge = events.on('player:dodge', onDodge)
  unsubscribeLevel = events.on('player:level', onLevel)
  unsubscribeBossPhase = events.on('boss:phase', onBossPhase)
  unsubscribeWaveStart = events.on('wave:start', onWaveStart)
  unsubscribeWaveEnd = events.on('wave:end', onWaveEnd)
}

function stopListeners(): void {
  unsubscribeHit?.()
  unsubscribeKill?.()
  unsubscribeStatus?.()
  unsubscribeReaction?.()
  unsubscribeDodge?.()
  unsubscribeLevel?.()
  unsubscribeBossPhase?.()
  unsubscribeWaveStart?.()
  unsubscribeWaveEnd?.()
  unsubscribeHit = undefined
  unsubscribeKill = undefined
  unsubscribeStatus = undefined
  unsubscribeReaction = undefined
  unsubscribeDodge = undefined
  unsubscribeLevel = undefined
  unsubscribeBossPhase = undefined
  unsubscribeWaveStart = undefined
  unsubscribeWaveEnd = undefined
}

export function startSkillMasteryRuntimeV3(): Stop {
  if (running || typeof window === 'undefined') return stopSkillMasteryRuntimeV3
  running = true
  deterministicIndex = 0
  startListeners()
  unsubscribeTick = onSimulationTick(tick)
  return stopSkillMasteryRuntimeV3
}

export function stopSkillMasteryRuntimeV3(): void {
  if (!running) return
  running = false
  unsubscribeTick?.()
  unsubscribeTick = undefined
  stopListeners()
}

export function resetSkillMasteryRuntimeV3(): void {
  const wasRunning = running
  stopSkillMasteryRuntimeV3()
  mastery.clear()
  elementState.clear()
  tempo.overdrive = 0
  tempo.stamina = 100
  tempo.maxStamina = 100
  tempo.perfectWindow = 0
  tempo.castStreak = 0
  tempo.hitStreak = 0
  tempo.lastCastAt = -Infinity
  tempo.lastHitAt = -Infinity
  tempo.bossPhaseBonus = 0
  tempo.waveBonus = 0
  waveReward.wave = 0
  waveReward.claimed = false
  waveReward.bonusXp = 0
  waveReward.bonusMultiplier = 1
  lastResonanceAt = -Infinity
  resonancePulse = 0
  masteryPulse = 0
  castDecay = 0
  hitDecay = 0
  staminaRegenCooldown = 0
  deterministicIndex = 0
  if (wasRunning) startSkillMasteryRuntimeV3()
}

export function getAbilityMastery(id: AbilityId): AbilityMastery {
  return { ...(mastery.get(id) ?? { uses: 0, hits: 0, crits: 0, kills: 0, reactions: 0, score: 0, rank: 'novice' }) }
}

export function getAllAbilityMastery(): ReadonlyMap<AbilityId, AbilityMastery> {
  return new Map(mastery)
}

export function getElementResonance(): ReadonlyMap<ResonanceElement, ElementState> {
  return new Map([...elementState.entries()].map(([k, v]) => [k, { ...v }]))
}

export function getSkillTempo(): Readonly<PlayerTempo> {
  return { ...tempo }
}

export function getWaveRewardState(): Readonly<WaveRewardState> {
  return { ...waveReward }
}

export function getDominantElement(): ResonanceElement | undefined {
  return dominantElement()
}

export function getMasteryDamageMultiplier(id: AbilityId): number {
  const state = mastery.get(id)
  if (!state) return 1
  return masteryMultiplier(state.rank)
}

export function spendStamina(amount: number): boolean {
  const cost = Math.max(0, finite(amount))
  if (cost <= 0) return true
  if (tempo.stamina < cost) return false
  tempo.stamina -= cost
  staminaRegenCooldown = Math.max(staminaRegenCooldown, 0.28)
  return true
}

export function addOverdrive(amount: number): void {
  tempo.overdrive = clamp(tempo.overdrive + finite(amount), 0, 1)
}

export function consumeOverdrive(amount = 0.25): boolean {
  const cost = clamp(finite(amount), 0, 1)
  if (tempo.overdrive < cost) return false
  tempo.overdrive -= cost
  return true
}

export function boostAbilityMastery(id: AbilityId, score: number): void {
  gainMastery(id, score)
}

export function forceResonancePulse(element: ResonanceElement): void {
  const state = elementState.get(element)
  if (!state) return
  state.stacks = clamp(state.stacks + 3, 0, 12)
  state.expiresAt = gameState.time + 2.2
  resonancePulse = 0.6
}

export function emitMasteryFlash(id: AbilityId): void {
  const state = getOrCreateMastery(id)
  const color = elementColors[(dominantElement() ?? 'void')]
  const count = randomInt(6, 14)
  const jitter = randomRange(0.8, 1.4)
  void color
  void count
  void jitter
  state.score += 0.5
  masteryPulse = 0.3
}

export const SKILL_MASTERY_V3_VERSION = 3
