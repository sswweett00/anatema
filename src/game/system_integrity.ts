import { ABILITIES, MEND_DEF, SYNERGIES, type AbilityId } from './abilities'
import { events } from './events'

const EXPANDED_IDS: readonly AbilityId[] = [
  'meteor', 'gravitywell', 'soulbolts', 'bladestorm', 'arcanemine', 'bloodnova',
  'voidrift', 'mirrors', 'wolfpack', 'seismic', 'runeprison', 'frostfire',
  'ward', 'overcharge', 'executioner', 'berserker', 'unbreakable', 'soulsiphon',
  'shadowreflex', 'perfectgeometry', 'conduit', 'detonation', 'fortune', 'lifeforge',
  'aegis', 'bloodart', 'celerity', 'deathsmark', 'soulharvest',
]

type IntegrityResult = { valid: boolean; errors: string[] }

let lastReport = ''

export function validateSystemIntegrity(): IntegrityResult {
  const errors: string[] = []
  const defs = [...ABILITIES, MEND_DEF]
  const ids = new Set<string>()

  for (const def of defs) {
    if (ids.has(def.id)) errors.push(`duplicate ability definition: ${def.id}`)
    ids.add(def.id)
    if (!def.name.trim()) errors.push(`empty ability name: ${def.id}`)
    if (!def.desc.trim()) errors.push(`empty ability description: ${def.id}`)
  }

  for (const id of EXPANDED_IDS) {
    if (!ids.has(id)) errors.push(`expanded runtime ability missing from catalog: ${id}`)
  }

  for (const synergy of SYNERGIES) {
    const [a, b] = synergy.pair
    if (!ids.has(a) || !ids.has(b)) {
      errors.push(`synergy ${synergy.id} references unknown ability: ${a}/${b}`)
    }
    if (a === b) errors.push(`self synergy is not allowed: ${synergy.id}`)
    if (!synergy.name.trim() || !synergy.desc.trim()) errors.push(`incomplete synergy: ${synergy.id}`)
  }

  const result = { valid: errors.length === 0, errors }
  const signature = errors.join('|')
  if (signature !== lastReport) {
    lastReport = signature
    if (errors.length) {
      events.emit('runtime:error', {
        system: 'system-integrity',
        message: errors.join(' | '),
      })
    }
  }
  return result
}

let running = false
let interval: ReturnType<typeof setInterval> | undefined

export function startSystemIntegrity(): () => void {
  if (running || typeof window === 'undefined') return stopSystemIntegrity
  running = true
  validateSystemIntegrity()
  interval = window.setInterval(() => {
    if (running) validateSystemIntegrity()
  }, 4000)
  return stopSystemIntegrity
}

export function stopSystemIntegrity(): void {
  running = false
  if (interval !== undefined) window.clearInterval(interval)
  interval = undefined
}

export function resetSystemIntegrity(): void {
  lastReport = ''
  validateSystemIntegrity()
}
