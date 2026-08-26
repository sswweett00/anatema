import { ABILITIES as LEGACY_ABILITIES, ENEMIES as LEGACY_ENEMIES, RELICS } from './combat_registry'
import { ABILITIES as PLAYER_ABILITIES, type AbilityId } from './abilities'
import { ENEMY_KINDS } from '../ecs/world'
import { events } from './events'

export interface ContentContractReport {
  valid: boolean
  playerAbilities: number
  legacyAbilities: number
  worldEnemies: number
  legacyEnemies: number
  relics: number
  errors: string[]
}

const PLAYER_IDS = new Set<AbilityId>(PLAYER_ABILITIES.map((ability) => ability.id))

export function validateContentContract(): ContentContractReport {
  const errors: string[] = []
  const uniquePlayer = new Set<string>()
  for (const ability of PLAYER_ABILITIES) {
    if (uniquePlayer.has(ability.id)) errors.push(`duplicate player ability: ${ability.id}`)
    uniquePlayer.add(ability.id)
    if (!ability.name.trim() || !ability.desc.trim()) errors.push(`incomplete ability definition: ${ability.id}`)
  }

  for (const legacy of LEGACY_ABILITIES) {
    if (!PLAYER_IDS.has(legacy.id as AbilityId)) {
      // Legacy combat content is intentionally allowed, but must be explicitly visible
      // to diagnostics so it cannot silently become a second source of truth.
      errors.push(`orphan legacy ability: ${legacy.id}`)
    }
  }

  const worldNames = new Set(ENEMY_KINDS.map((kind) => kind.name.toLowerCase()))
  for (const enemy of LEGACY_ENEMIES) {
    if (!worldNames.has(enemy.id.toLowerCase()) && !worldNames.has(enemy.id.replace(/^./, (c) => c.toUpperCase()).toLowerCase())) {
      errors.push(`orphan legacy enemy: ${enemy.id}`)
    }
  }

  const relicIds = new Set<string>()
  for (const relic of RELICS) {
    if (relicIds.has(relic.id)) errors.push(`duplicate relic: ${relic.id}`)
    relicIds.add(relic.id)
  }

  const report = {
    valid: errors.length === 0,
    playerAbilities: PLAYER_ABILITIES.length,
    legacyAbilities: LEGACY_ABILITIES.length,
    worldEnemies: ENEMY_KINDS.length,
    legacyEnemies: LEGACY_ENEMIES.length,
    relics: RELICS.length,
    errors,
  }

  if (errors.length) {
    events.emit('runtime:error', { system: 'content-contract', message: errors.join(' | ') })
  }
  return report
}
