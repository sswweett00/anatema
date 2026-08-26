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
  warnings: string[]
  errors: string[]
}

const PLAYER_IDS = new Set<AbilityId>(PLAYER_ABILITIES.map((ability) => ability.id))
const WORLD_ENEMY_NAMES = new Set(ENEMY_KINDS.map((kind) => kind.name.toLowerCase()))

export function validateContentContract(): ContentContractReport {
  const warnings: string[] = []
  const errors: string[] = []
  const uniquePlayer = new Set<string>()

  for (const ability of PLAYER_ABILITIES) {
    if (uniquePlayer.has(ability.id)) errors.push(`duplicate player ability: ${ability.id}`)
    uniquePlayer.add(ability.id)
    if (!ability.name.trim() || !ability.desc.trim()) errors.push(`incomplete ability definition: ${ability.id}`)
  }

  for (const legacy of LEGACY_ABILITIES) {
    if (!PLAYER_IDS.has(legacy.id as AbilityId)) warnings.push(`legacy ability retained for compatibility: ${legacy.id}`)
  }

  for (const enemy of LEGACY_ENEMIES) {
    const normalized = enemy.id.toLowerCase()
    if (!WORLD_ENEMY_NAMES.has(normalized)) warnings.push(`legacy enemy retained for compatibility: ${enemy.id}`)
  }

  const relicIds = new Set<string>()
  for (const relic of RELICS) {
    if (relicIds.has(relic.id)) errors.push(`duplicate relic: ${relic.id}`)
    relicIds.add(relic.id)
    if (!relic.name.trim() || !relic.description.trim() || relic.tags.length === 0) errors.push(`incomplete relic definition: ${relic.id}`)
  }

  const report: ContentContractReport = {
    valid: errors.length === 0,
    playerAbilities: PLAYER_ABILITIES.length,
    legacyAbilities: LEGACY_ABILITIES.length,
    worldEnemies: ENEMY_KINDS.length,
    legacyEnemies: LEGACY_ENEMIES.length,
    relics: RELICS.length,
    warnings,
    errors,
  }

  if (errors.length) {
    events.emit('runtime:error', { system: 'content-contract', message: errors.join(' | ') })
  }
  return report
}
