import {
  ABILITIES as PLAYER_ABILITIES,
  abilities as PLAYER_ABILITY_STATE,
  type AbilityDef,
  type AbilityId,
} from './abilities'
import { ENEMIES as LEGACY_ENEMIES, RELICS } from './combat_registry'
import { ENEMY_KINDS } from '../ecs/world'

export interface CanonicalContentSnapshot {
  abilities: readonly AbilityDef[]
  abilityIds: readonly AbilityId[]
  abilityCount: number
  activeAbilityCount: number
  passiveAbilityCount: number
  enemyKinds: typeof ENEMY_KINDS
  legacyEnemyCount: number
  relics: typeof RELICS
}

const abilityIds = PLAYER_ABILITIES.map((ability) => ability.id)

export function getCanonicalContent(): CanonicalContentSnapshot {
  const activeAbilityCount = PLAYER_ABILITIES.reduce((count, ability) => count + (ability.type === 'AKTİF' ? 1 : 0), 0)
  return {
    abilities: PLAYER_ABILITIES,
    abilityIds,
    abilityCount: PLAYER_ABILITIES.length,
    activeAbilityCount,
    passiveAbilityCount: PLAYER_ABILITIES.length - activeAbilityCount,
    enemyKinds: ENEMY_KINDS,
    legacyEnemyCount: LEGACY_ENEMIES.length,
    relics: RELICS,
  }
}

export function getOwnedAbilityCount(): number {
  let count = 0
  for (const id of abilityIds) {
    if ((PLAYER_ABILITY_STATE[id] ?? 0) > 0) count++
  }
  return count
}

export function hasAbility(id: string): id is AbilityId {
  return Object.prototype.hasOwnProperty.call(PLAYER_ABILITY_STATE, id)
}
