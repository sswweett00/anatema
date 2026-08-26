import { getPlayer } from '../ecs/world'
import { getProgress } from './progression'
import { RELICS } from './combat_registry'
import { onSimulationTick } from './simulation_clock'

let unsubscribe: (() => void) | undefined
let lastHealth = 0
let lastMaxHealth = 0
let lastSpeed = 0

function tick(): void {
  const player = getPlayer()
  if (!player) return
  const owned = getProgress().relics
  let healthBonus = 0
  let speedBonus = 0
  let armorBonus = 0

  for (const id of owned) {
    const relic = RELICS.find((item) => item.id === id)
    if (!relic) continue
    if (relic.tags.includes('fire')) healthBonus += relic.power * 0.15
    if (relic.tags.includes('freeze')) armorBonus += relic.power * 0.04
    if (relic.tags.includes('cooldown')) speedBonus += relic.power * 0.0015
    if (relic.tags.includes('combo')) speedBonus += relic.power * 0.001
    if (relic.tags.includes('pull')) armorBonus += relic.power * 0.025
  }

  const targetMaxHealth = 100 + healthBonus
  if (Math.abs(lastMaxHealth - targetMaxHealth) > 0.05) {
    player.maxHealth = Math.max(player.maxHealth, targetMaxHealth)
    player.health = Math.min(player.maxHealth, player.health + Math.max(0, player.maxHealth - lastMaxHealth))
    lastMaxHealth = player.maxHealth
  }

  const targetSpeed = 5.4 + speedBonus
  if (Math.abs(lastSpeed - targetSpeed) > 0.001) {
    player.speed = Math.max(player.speed, targetSpeed)
    lastSpeed = player.speed
  }

  if (armorBonus > 0) player.armor = Math.max(player.armor, 3 + armorBonus)
  lastHealth = player.health
}

export function startRelicEffectRuntime(): () => void {
  if (unsubscribe) return stopRelicEffectRuntime
  unsubscribe = onSimulationTick(tick)
  return stopRelicEffectRuntime
}

export function stopRelicEffectRuntime(): void {
  unsubscribe?.()
  unsubscribe = undefined
}

export function resetRelicEffectRuntime(): void {
  stopRelicEffectRuntime()
  lastHealth = 0
  lastMaxHealth = 0
  lastSpeed = 0
}
