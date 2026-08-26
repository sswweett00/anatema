import { ABILITIES, ENEMIES, RELICS } from './combat_registry'
import { events } from './events'

export interface ContentValidation {
  valid: boolean
  errors: string[]
}

export function validateCombatContent(): ContentValidation {
  const errors: string[] = []
  const ids = new Set<string>()

  for (const ability of ABILITIES) {
    if (ids.has(`ability:${ability.id}`)) errors.push(`duplicate ability id: ${ability.id}`)
    ids.add(`ability:${ability.id}`)
    if (ability.baseDamage <= 0 || ability.cooldown <= 0) errors.push(`invalid ability tuning: ${ability.id}`)
    if (ability.projectileCount < 1 || ability.pierce < 0 || ability.area < 0) errors.push(`invalid ability geometry: ${ability.id}`)
    if (ability.evolutionAt < 1 || !ability.evolutionId) errors.push(`missing evolution: ${ability.id}`)
  }

  for (const enemy of ENEMIES) {
    if (ids.has(`enemy:${enemy.id}`)) errors.push(`duplicate enemy id: ${enemy.id}`)
    ids.add(`enemy:${enemy.id}`)
    if (enemy.hp <= 0 || enemy.speed < 0 || enemy.damage < 0 || enemy.radius <= 0 || enemy.mass <= 0) errors.push(`invalid enemy tuning: ${enemy.id}`)
  }

  const validRarities = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'])
  for (const relic of RELICS) {
    if (ids.has(`relic:${relic.id}`)) errors.push(`duplicate relic id: ${relic.id}`)
    ids.add(`relic:${relic.id}`)
    if (!validRarities.has(relic.rarity) || relic.power <= 0 || relic.tags.length === 0) errors.push(`invalid relic definition: ${relic.id}`)
  }

  if (errors.length) {
    events.emit('runtime:error', { system: 'content', message: errors.join(' | ') })
  }
  return { valid: errors.length === 0, errors }
}
