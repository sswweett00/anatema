import type { DamageElement } from './events'

export type StatusId = 'burn' | 'poison' | 'shock' | 'bleed' | 'freeze' | 'armor_break'
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'

export interface AbilityDefinition {
  id: string
  name: string
  element: DamageElement
  baseDamage: number
  cooldown: number
  projectileCount: number
  pierce: number
  area: number
  status?: StatusId
  evolutionAt: number
  evolutionId: string
}

export interface EnemyArchetype {
  id: string
  hp: number
  speed: number
  damage: number
  armor: number
  radius: number
  mass: number
  eliteWeight: number
  bossEligible: boolean
  statuses: Partial<Record<StatusId, number>>
}

export interface RelicDefinition {
  id: string
  rarity: Rarity
  name: string
  description: string
  power: number
  tags: readonly string[]
}

export const ABILITIES: readonly AbilityDefinition[] = [
  { id: 'ember_bolt', name: 'Ember Bolt', element: 'fire', baseDamage: 14, cooldown: 0.42, projectileCount: 1, pierce: 0, area: 0.7, status: 'burn', evolutionAt: 8, evolutionId: 'inferno_lance' },
  { id: 'frost_ring', name: 'Frost Ring', element: 'ice', baseDamage: 9, cooldown: 1.15, projectileCount: 1, pierce: 99, area: 3.4, status: 'freeze', evolutionAt: 8, evolutionId: 'absolute_zero' },
  { id: 'storm_chain', name: 'Storm Chain', element: 'shock', baseDamage: 11, cooldown: 0.8, projectileCount: 2, pierce: 3, area: 1.2, status: 'shock', evolutionAt: 10, evolutionId: 'tempest_web' },
  { id: 'venom_spike', name: 'Venom Spike', element: 'poison', baseDamage: 12, cooldown: 0.65, projectileCount: 2, pierce: 2, area: 0.8, status: 'poison', evolutionAt: 10, evolutionId: 'plague_blossom' },
  { id: 'blood_surge', name: 'Blood Surge', element: 'bleed', baseDamage: 18, cooldown: 1.35, projectileCount: 1, pierce: 5, area: 1.6, status: 'bleed', evolutionAt: 12, evolutionId: 'crimson_tide' },
  { id: 'void_lance', name: 'Void Lance', element: 'void', baseDamage: 25, cooldown: 1.8, projectileCount: 1, pierce: 8, area: 1.0, status: 'armor_break', evolutionAt: 12, evolutionId: 'singularity' },
] as const

export const ENEMIES: readonly EnemyArchetype[] = [
  { id: 'goblin', hp: 30, speed: 3.2, damage: 7, armor: 0, radius: 0.6, mass: 1, eliteWeight: 1, bossEligible: false, statuses: {} },
  { id: 'skeleton', hp: 48, speed: 2.7, damage: 10, armor: 2, radius: 0.7, mass: 1.1, eliteWeight: 0.8, bossEligible: false, statuses: {} },
  { id: 'slime', hp: 72, speed: 2.1, damage: 13, armor: 1, radius: 0.9, mass: 1.5, eliteWeight: 0.7, bossEligible: false, statuses: { poison: 0.15 } },
  { id: 'wraith', hp: 55, speed: 4.1, damage: 16, armor: 0, radius: 0.65, mass: 0.7, eliteWeight: 0.55, bossEligible: true, statuses: { freeze: 0.25 } },
  { id: 'juggernaut', hp: 220, speed: 1.25, damage: 28, armor: 10, radius: 1.25, mass: 4, eliteWeight: 0.3, bossEligible: true, statuses: { armor_break: 0.5 } },
] as const

export const RELICS: readonly RelicDefinition[] = [
  { id: 'cinder_core', rarity: 'rare', name: 'Cinder Core', description: '+18% fire damage and burning spread range.', power: 18, tags: ['fire', 'spread'] },
  { id: 'frozen_heart', rarity: 'rare', name: 'Frozen Heart', description: 'Freeze lasts longer and shatter deals burst damage.', power: 16, tags: ['ice', 'freeze'] },
  { id: 'storm_eye', rarity: 'epic', name: 'Storm Eye', description: 'Shock can chain to more targets and refunds part of cooldown.', power: 22, tags: ['shock', 'cooldown'] },
  { id: 'plague_crown', rarity: 'epic', name: 'Plague Crown', description: 'Poison stacks become stronger and rupture on death.', power: 24, tags: ['poison', 'rupture'] },
  { id: 'void_lens', rarity: 'legendary', name: 'Void Lens', description: 'Void damage ignores part of armor and pulls nearby enemies.', power: 31, tags: ['void', 'pull'] },
  { id: 'blood_oath', rarity: 'mythic', name: 'Blood Oath', description: 'Critical kills restore health and amplify combo generation.', power: 42, tags: ['bleed', 'crit', 'combo'] },
] as const

export function getAbility(id: string): AbilityDefinition | undefined {
  return ABILITIES.find((ability) => ability.id === id)
}

export function getEnemy(id: string): EnemyArchetype | undefined {
  return ENEMIES.find((enemy) => enemy.id === id)
}

export function getRelic(id: string): RelicDefinition | undefined {
  return RELICS.find((relic) => relic.id === id)
}
