import { ABILITIES, type AbilityId, abilities } from './abilities'
import { events } from './events'

export type AbilityRuntimeKind = 'active' | 'passive'
export type AbilityActivationSource = 'legacy-combat' | 'expanded-runtime' | 'derived-stat' | 'event-runtime'

const EXPANDED_IDS = new Set<AbilityId>([
  'meteor', 'gravitywell', 'soulbolts', 'bladestorm', 'arcanemine', 'bloodnova', 'voidrift', 'mirrors',
  'wolfpack', 'seismic', 'runeprison', 'frostfire', 'ward', 'overcharge', 'executioner', 'berserker',
  'resilience', 'siphon', 'evasion', 'precision', 'conduit', 'detonation', 'fortunesfavor', 'lifeforge',
  'aegis', 'hemocraft', 'celerity', 'deathsmark', 'soulharvest',
])

const LEGACY_ACTIVE_IDS = new Set<AbilityId>([
  'arrows', 'nova', 'orbit', 'chain', 'storm', 'frost', 'vortex', 'spikes', 'pyre', 'phantom', 'venom',
])

const ids = ABILITIES.map(({ id }) => id)
const defById = new Map(ABILITIES.map((def) => [def.id, def]))

export function allAbilityIds(): readonly AbilityId[] {
  return ids
}

export function abilityKind(id: AbilityId): AbilityRuntimeKind {
  return defById.get(id)?.type === 'AKTİF' ? 'active' : 'passive'
}

export function activationSource(id: AbilityId): AbilityActivationSource {
  if (EXPANDED_IDS.has(id)) return 'expanded-runtime'
  if (LEGACY_ACTIVE_IDS.has(id)) return 'legacy-combat'
  return 'derived-stat'
}

export function activeAbilityIds(): AbilityId[] {
  return ids.filter((id) => abilityKind(id) === 'active')
}

export function passiveAbilityIds(): AbilityId[] {
  return ids.filter((id) => abilityKind(id) === 'passive')
}

export function validateAbilityActivation(): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const seen = new Set<AbilityId>()

  for (const def of ABILITIES) {
    const id = def.id
    if (seen.has(id)) errors.push(`duplicate ability activation id: ${id}`)
    seen.add(id)

    const level = abilities[id]
    if (!Number.isFinite(level) || level < 0) errors.push(`invalid mutable ability state: ${id}`)

    const kind = abilityKind(id)
    const source = activationSource(id)
    if (kind === 'active' && source !== 'legacy-combat' && source !== 'expanded-runtime') {
      errors.push(`active ability has no gameplay source: ${id}`)
    }
    if (kind === 'passive' && source !== 'derived-stat' && source !== 'expanded-runtime' && source !== 'event-runtime') {
      errors.push(`passive ability has no gameplay source: ${id}`)
    }
  }

  for (const id of LEGACY_ACTIVE_IDS) {
    if (!seen.has(id)) errors.push(`legacy active ability missing from catalog: ${id}`)
    else if (abilityKind(id) !== 'active') errors.push(`legacy active ability typed as passive: ${id}`)
  }

  for (const id of EXPANDED_IDS) {
    if (!seen.has(id)) errors.push(`expanded ability missing from catalog: ${id}`)
  }

  const result = { valid: errors.length === 0, errors }
  if (!result.valid) {
    events.emit('runtime:error', {
      system: 'ability-activation',
      message: errors.join(' | '),
    })
  }
  return result
}

export function emitAbilityActivationSnapshot(): void {
  const owned = ids.filter((id) => Number.isFinite(abilities[id]) && abilities[id] > 0)
  const activeOwned = owned.filter((id) => abilityKind(id) === 'active').length
  const passiveOwned = owned.length - activeOwned

  events.emit('ability:snapshot', {
    total: ids.length,
    activeOwned,
    passiveOwned,
    owned,
  })
}
