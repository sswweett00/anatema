import { ABILITIES, MEND_DEF, type AbilityId, abilities } from './abilities'
import { events } from './events'

export type AbilityRuntimeKind = 'active' | 'passive'
export type AbilityActivationSource = 'legacy-combat' | 'expanded-runtime' | 'derived-stat' | 'event-runtime'

const ACTIVE_IDS = new Set<AbilityId>([
  'arrows', 'nova', 'orbit', 'chain', 'storm', 'frost', 'vortex', 'spikes', 'pyre', 'phantom', 'venom',
  'meteor', 'gravitywell', 'soulbolts', 'bladestorm', 'arcanemine', 'bloodnova', 'voidrift', 'mirrors',
  'wolfpack', 'seismic', 'runeprison', 'frostfire',
])

const EXPANDED_IDS = new Set<AbilityId>([
  'meteor', 'gravitywell', 'soulbolts', 'bladestorm', 'arcanemine', 'bloodnova', 'voidrift', 'mirrors',
  'wolfpack', 'seismic', 'runeprison', 'frostfire', 'ward', 'overcharge', 'executioner', 'berserker',
  'resilience', 'siphon', 'evasion', 'precision', 'conduit', 'detonation', 'fortunesfavor', 'lifeforge',
  'aegis', 'hemocraft', 'celerity', 'deathsmark', 'soulharvest',
])

const LEGACY_ACTIVE_IDS = new Set<AbilityId>([
  'arrows', 'nova', 'orbit', 'chain', 'storm', 'frost', 'vortex', 'spikes', 'pyre', 'phantom', 'venom',
])

const ids = [...new Set<AbilityId>([
  ...ABILITIES.map(({ id }) => id),
  MEND_DEF.id,
])]

export function allAbilityIds(): readonly AbilityId[] { return ids }
export function abilityKind(id: AbilityId): AbilityRuntimeKind { return ACTIVE_IDS.has(id) ? 'active' : 'passive' }

export function activationSource(id: AbilityId): AbilityActivationSource {
  if (EXPANDED_IDS.has(id)) return 'expanded-runtime'
  if (LEGACY_ACTIVE_IDS.has(id)) return 'legacy-combat'
  return 'derived-stat'
}

export function activeAbilityIds(): AbilityId[] { return ids.filter((id) => ACTIVE_IDS.has(id)) }
export function passiveAbilityIds(): AbilityId[] { return ids.filter((id) => !ACTIVE_IDS.has(id)) }

export function validateAbilityActivation(): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const seen = new Set<AbilityId>()

  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicate ability activation id: ${id}`)
    seen.add(id)
    if (abilities[id] === undefined) errors.push(`missing mutable ability state: ${id}`)

    const kind = abilityKind(id)
    const source = activationSource(id)
    if (kind === 'active' && source !== 'legacy-combat' && source !== 'expanded-runtime') {
      errors.push(`active ability has no gameplay source: ${id}`)
    }
    if (kind === 'passive' && source !== 'derived-stat' && source !== 'expanded-runtime' && source !== 'event-runtime') {
      errors.push(`passive ability has no gameplay source: ${id}`)
    }
  }

  for (const id of ACTIVE_IDS) {
    if (!seen.has(id)) errors.push(`active ability missing from catalog: ${id}`)
  }

  const result = { valid: errors.length === 0, errors }
  if (!result.valid) events.emit('runtime:error', { system: 'ability-activation', message: errors.join(' | ') })
  return result
}

export function emitAbilityActivationSnapshot(): void {
  const owned = ids.filter((id) => (abilities[id] ?? 0) > 0)
  events.emit('ability:snapshot', {
    total: ids.length,
    activeOwned: activeAbilityIds().filter((id) => (abilities[id] ?? 0) > 0).length,
    passiveOwned: passiveAbilityIds().filter((id) => (abilities[id] ?? 0) > 0).length,
    owned,
  })
}
