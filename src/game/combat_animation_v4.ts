import * as THREE from 'three'
import { enemies, gameState, getPlayer, type Entity } from '../ecs/world'
import { abilities } from './abilities'
import { getEliteAffixes, getEliteShield } from './advanced_mechanics_v3'
import { getEnemyAnimationV4 } from './enemy_animation_v4'
import { getPlayerAnimationV4 } from './player_animation_v4'
import { onSimulationTick } from './simulation_clock'
import { clamp, clamp01, decay, finite, Spring1D, Spring3D, signedPulse, noiseSigned, radialFalloff } from './animation_math_v4'

type Stop = () => void
export type CombatPresentation = 'neutral' | 'telegraph' | 'impact' | 'critical' | 'execute' | 'reaction' | 'parry' | 'perfect' | 'stagger' | 'finisher'

export interface CombatAnimationSnapshot {
  presentation: CombatPresentation
  time: number
  intensity: number
  impact: number
  critical: number
  execute: number
  reaction: number
  parry: number
  perfect: number
  stagger: number
  finisher: number
  screenShake: number
  hitStop: number
  hitPauseScale: number
  attackerRecoil: number
  targetRecoil: number
  cameraKickX: number
  cameraKickY: number
  cameraKickZ: number
  radialBurst: number
  trail: number
  sparkCount: number
  flash: number
  vignette: number
  chroma: number
  audioPitch: number
  slowMo: number
}

interface ImpactEvent {
  position: THREE.Vector3
  amount: number
  critical: boolean
  age: number
  target: Entity | null
  source: 'player' | 'enemy' | 'system'
}

interface CombatState {
  active: boolean
  time: number
  cooldown: number
  presentation: CombatPresentation
  impact: Spring1D
  critical: Spring1D
  execute: Spring1D
  reaction: Spring1D
  parry: Spring1D
  perfect: Spring1D
  stagger: Spring1D
  finisher: Spring1D
  shake: Spring1D
  hitStop: Spring1D
  targetRecoil: Spring1D
  attackerRecoil: Spring1D
  trail: Spring1D
  flash: Spring1D
  vignette: Spring1D
  chroma: Spring1D
  slowMo: Spring1D
  cameraKick: Spring3D
  impacts: ImpactEvent[]
  lastKills: number
  lastCombo: number
  lastDamageFlash: number
  lastSlash: number
  lastPhase: string
}

const state: CombatState = {
  active: false,
  time: 0,
  cooldown: 0,
  presentation: 'neutral',
  impact: new Spring1D(),
  critical: new Spring1D(),
  execute: new Spring1D(),
  reaction: new Spring1D(),
  parry: new Spring1D(),
  perfect: new Spring1D(),
  stagger: new Spring1D(),
  finisher: new Spring1D(),
  shake: new Spring1D(),
  hitStop: new Spring1D(),
  targetRecoil: new Spring1D(),
  attackerRecoil: new Spring1D(),
  trail: new Spring1D(),
  flash: new Spring1D(),
  vignette: new Spring1D(),
  chroma: new Spring1D(),
  slowMo: new Spring1D(),
  cameraKick: new Spring3D(),
  impacts: [],
  lastKills: 0,
  lastCombo: 0,
  lastDamageFlash: 0,
  lastSlash: 0,
  lastPhase: '',
}

const snapshot: CombatAnimationSnapshot = {
  presentation: 'neutral', time: 0, intensity: 0, impact: 0, critical: 0, execute: 0,
  reaction: 0, parry: 0, perfect: 0, stagger: 0, finisher: 0, screenShake: 0,
  hitStop: 0, hitPauseScale: 1, attackerRecoil: 0, targetRecoil: 0, cameraKickX: 0,
  cameraKickY: 0, cameraKickZ: 0, radialBurst: 0, trail: 0, sparkCount: 0, flash: 0,
  vignette: 0, chroma: 0, audioPitch: 1, slowMo: 0,
}

let unsubscribe: Stop | undefined

function pushImpact(event: ImpactEvent): void {
  state.impacts.push(event)
  if (state.impacts.length > 32) state.impacts.splice(0, state.impacts.length - 32)
}

function detectCombat(player: Entity): void {
  if ((gameState.damageFlash ?? 0) > state.lastDamageFlash + 0.035) {
    const strength = clamp01((gameState.damageFlash ?? 0) * 1.8)
    state.impact.velocity += strength * 6
    state.attackerRecoil.velocity += strength * 4
    state.shake.velocity += strength * 7
    state.vignette.velocity += strength * 2
    state.presentation = 'impact'
    pushImpact({ position: player.position.clone(), amount: strength * 8, critical: false, age: 0, target: null, source: 'enemy' })
  }
  state.lastDamageFlash = gameState.damageFlash ?? 0

  const combo = gameState.combo
  if (combo > state.lastCombo) {
    const delta = combo - state.lastCombo
    const critical = delta >= 4 || combo % 10 === 0
    state.impact.velocity += Math.min(5, delta * 0.6)
    state.trail.velocity += critical ? 3 : 1.2
    state.shake.velocity += critical ? 3 : 0.5
    if (critical) state.critical.velocity += 3
    state.presentation = critical ? 'critical' : 'impact'
  }
  state.lastCombo = combo

  const kills = gameState.kills
  if (kills > state.lastKills) {
    const delta = kills - state.lastKills
    state.finisher.velocity += delta >= 3 ? 4 : 1.2
    state.execute.velocity += combo >= 25 ? 1.5 : 0
    state.radialBurst = Math.min(1, state.radialBurst + delta * 0.16)
    if (delta >= 3) state.presentation = 'finisher'
  }
  state.lastKills = kills

  const slash = gameState.slashAnim ?? 0
  if (slash > state.lastSlash + 0.04) {
    state.attackTrigger(player)
  }
  state.lastSlash = slash
}

function attackTrigger(player: Entity): void {
  const animation = getPlayerAnimationV4()
  const power = clamp01(animation.attackWeight + gameState.combo * 0.005)
  state.impact.velocity += 1.4 + power * 2
  state.trail.velocity += 1.4 + power
  state.cameraKick.velocity.x += animation.additiveX * 0.2
  state.cameraKick.velocity.y += (Math.sin(animation.attackProgress * Math.PI) * 0.04 + 0.01) * (1 + power)
  state.cameraKick.velocity.z -= power * 0.12
  pushImpact({ position: player.position.clone(), amount: power * 12, critical: false, age: 0, target: null, source: 'player' })
}

function scanTargets(): void {
  const player = getPlayer()
  if (!player) return
  for (const entity of enemies.entities) {
    if (entity.dead) continue
    const stateAnim = getEnemyAnimationV4(entity)
    const shield = getEliteShield(entity)
    const shieldRatio = shield.max > 0 ? shield.current / shield.max : 0
    if (stateAnim.staggerWeight > 0.1) state.stagger.velocity += stateAnim.staggerWeight * 2
    if (shield.max > 0 && shieldRatio < 0.08) state.reaction.velocity += 1.3
    if (getEliteAffixes(entity).includes('volatile')) state.reaction.velocity += 0.03
  }
}

function updateImpacts(dt: number): void {
  for (let i = state.impacts.length - 1; i >= 0; i--) {
    const impact = state.impacts[i]
    impact.age += dt
    if (impact.age > 0.42) state.impacts.splice(i, 1)
  }
  let strongest = 0
  for (const impact of state.impacts) {
    const ageWeight = 1 - impact.age / 0.42
    strongest = Math.max(strongest, ageWeight * clamp01(impact.amount / 20))
  }
  state.impact.velocity += strongest * 0.8
  state.radialBurst = Math.max(0, state.radialBurst - dt * 3)
}

function classifyPresentation(): void {
  const values: Array<[CombatPresentation, number]> = [
    ['finisher', state.finisher.value],
    ['execute', state.execute.value],
    ['perfect', state.perfect.value],
    ['parry', state.parry.value],
    ['critical', state.critical.value],
    ['reaction', state.reaction.value],
    ['stagger', state.stagger.value],
    ['impact', state.impact.value],
  ]
  let best: CombatPresentation = 'neutral'
  let score = 0.06
  for (const [name, value] of values) {
    if (value > score) {
      score = value
      best = name
    }
  }
  state.presentation = best
}

function update(dt: number): void {
  const player = getPlayer()
  if (!player || gameState.phase !== 'playing') return
  state.time += dt
  state.cooldown = Math.max(0, state.cooldown - dt)
  detectCombat(player)
  scanTargets()
  updateImpacts(dt)

  const comboPressure = clamp01(gameState.combo / 50)
  const healthRisk = clamp01(1 - player.health / Math.max(1, player.maxHealth))
  const eliteCount = enemies.entities.reduce((count, e) => count + (getEliteAffixes(e).length > 0 ? 1 : 0), 0)
  const density = clamp01(enemies.entities.length / 180)
  const impactEnvelope = clamp01(state.impact.value + state.critical.value * 0.6 + state.execute.value * 0.8)

  state.impact.update(0, 17, 0.82, dt)
  state.critical.update(0, 12, 0.78, dt)
  state.execute.update(0, 10, 0.8, dt)
  state.reaction.update(0, 11, 0.8, dt)
  state.parry.update(0, 14, 0.8, dt)
  state.perfect.update(0, 13, 0.8, dt)
  state.stagger.update(0, 15, 0.82, dt)
  state.finisher.update(0, 9, 0.8, dt)
  state.shake.update(0, 12, 0.76, dt)
  state.hitStop.update(0, 8, 0.8, dt)
  state.targetRecoil.update(0, 14, 0.8, dt)
  state.attackerRecoil.update(0, 15, 0.8, dt)
  state.trail.update(0, 10, 0.78, dt)
  state.flash.update(0, 22, 0.74, dt)
  state.vignette.update(healthRisk * 0.18 + impactEnvelope * 0.25, 8, 0.84, dt)
  state.chroma.update(impactEnvelope * 0.08 + comboPressure * 0.02, 9, 0.8, dt)
  const baseSlow = impactEnvelope * 0.08 + (comboPressure > 0.85 ? 0.03 : 0)
  state.slowMo.update(baseSlow, 7, 0.85, dt)

  const chaos = noiseSigned(state.time * 2.3 + eliteCount * 9.3)
  state.cameraKick.value.x = damp(state.cameraKick.value.x, chaos * state.shake.value * 0.04, 16, dt)
  state.cameraKick.value.y = damp(state.cameraKick.value.y, impactEnvelope * 0.055, 18, dt)
  state.cameraKick.value.z = damp(state.cameraKick.value.z, -state.critical.value * 0.04, 16, dt)
  state.cameraKick.velocity.multiplyScalar(Math.exp(-10 * dt))

  state.critical.value = clamp01(state.critical.value)
  state.shake.value = clamp(state.shake.value + density * 0.02, 0, 1.25)
  classifyPresentation()
  assembleSnapshot(player)
}

function assembleSnapshot(player: Entity): void {
  const intensity = clamp01(state.impact.value * 0.55 + state.critical.value * 0.8 + state.execute.value + state.finisher.value * 0.75)
  snapshot.presentation = state.presentation
  snapshot.time = state.time
  snapshot.intensity = intensity
  snapshot.impact = state.impact.value
  snapshot.critical = state.critical.value
  snapshot.execute = state.execute.value
  snapshot.reaction = state.reaction.value
  snapshot.parry = state.parry.value
  snapshot.perfect = state.perfect.value
  snapshot.stagger = state.stagger.value
  snapshot.finisher = state.finisher.value
  snapshot.screenShake = state.shake.value
  snapshot.hitStop = state.hitStop.value
  snapshot.hitPauseScale = 1 - clamp01(state.hitStop.value) * 0.35
  snapshot.attackerRecoil = state.attackerRecoil.value
  snapshot.targetRecoil = state.targetRecoil.value
  snapshot.cameraKickX = state.cameraKick.value.x
  snapshot.cameraKickY = state.cameraKick.value.y
  snapshot.cameraKickZ = state.cameraKick.value.z
  snapshot.radialBurst = state.radialBurst
  snapshot.trail = state.trail.value
  snapshot.sparkCount = Math.round(3 + intensity * 22 + state.critical.value * 16)
  snapshot.flash = clamp01(state.flash.value + state.impact.value * 0.2)
  snapshot.vignette = clamp01(state.vignette.value)
  snapshot.chroma = clamp01(state.chroma.value)
  snapshot.audioPitch = 1 + state.critical.value * 0.08 - state.execute.value * 0.04
  snapshot.slowMo = clamp01(state.slowMo.value)
  void player
}

export function startCombatAnimationV4(): Stop {
  if (state.active || typeof window === 'undefined') return stopCombatAnimationV4
  state.active = true
  state.time = 0
  unsubscribe = onSimulationTick(update)
  return stopCombatAnimationV4
}

export function stopCombatAnimationV4(): void {
  if (!state.active) return
  state.active = false
  unsubscribe?.()
  unsubscribe = undefined
}

export function resetCombatAnimationV4(): void {
  const wasRunning = state.active
  stopCombatAnimationV4()
  state.time = 0
  state.presentation = 'neutral'
  state.cooldown = 0
  state.impacts.length = 0
  for (const spring of [state.impact, state.critical, state.execute, state.reaction, state.parry, state.perfect, state.stagger, state.finisher, state.shake, state.hitStop, state.targetRecoil, state.attackerRecoil, state.trail, state.flash, state.vignette, state.chroma, state.slowMo]) spring.reset()
  state.cameraKick.reset()
  if (wasRunning) startCombatAnimationV4()
}

export function getCombatAnimationV4(): Readonly<CombatAnimationSnapshot> {
  return snapshot
}

export function registerCombatImpact(position: THREE.Vector3, amount: number, critical = false, target: Entity | null = null): void {
  pushImpact({ position: position.clone(), amount: Math.max(0, finite(amount)), critical, age: 0, target, source: 'player' })
  state.impact.velocity += Math.min(5, Math.max(0, amount) * 0.03)
  if (critical) state.critical.velocity += 2.4
}

export function registerParry(perfect = false): void {
  state.parry.velocity += perfect ? 4 : 2
  state.perfect.velocity += perfect ? 3 : 0
  state.shake.velocity += 1.8
  state.presentation = perfect ? 'perfect' : 'parry'
}

export function registerExecution(power: number): void {
  state.execute.velocity += clamp(power * 0.02, 1.5, 6)
  state.finisher.velocity += clamp(power * 0.015, 1, 5)
  state.hitStop.velocity += 1.8
  state.cameraKick.velocity.z -= 0.12
  state.presentation = 'execute'
}

export function registerReaction(power: number): void {
  state.reaction.velocity += clamp(power * 0.025, 0.8, 5)
  state.impact.velocity += clamp(power * 0.015, 0.4, 2.5)
  state.presentation = 'reaction'
}

export function registerStagger(weight: number): void {
  state.stagger.velocity += clamp(weight, 0, 3)
  state.targetRecoil.velocity += clamp(weight * 0.7, 0, 2.5)
  state.presentation = 'stagger'
}
