import { abilities } from './abilities'
import { events } from './events'

export type Evolution = {
  id: string
  requires: string
  level: number
  name: string
  description: string
  multiplier: number
}

export const EVOLUTIONS: readonly Evolution[] = [
  { id: 'inferno_lance', requires: 'pyre', level: 8, name: 'Cehennem Mızrağı', description: 'Alev darbeleri hedefi delip arkasında yanıcı iz bırakır.', multiplier: 1.35 },
  { id: 'absolute_zero', requires: 'frost', level: 8, name: 'Mutlak Sıfır', description: 'Tam donan hedefler parçalanarak alan hasarı üretir.', multiplier: 1.42 },
  { id: 'tempest_web', requires: 'storm', level: 10, name: 'Fırtına Ağı', description: 'Yıldırım zincirleri kritik hedeflerde ikinci kez sıçrar.', multiplier: 1.48 },
  { id: 'plague_blossom', requires: 'venom', level: 10, name: 'Veba Çiçeği', description: 'Zehir yığınları çevreye bulaşır ve ölümde patlar.', multiplier: 1.5 },
  { id: 'crimson_tide', requires: 'heart', level: 12, name: 'Kızıl Gelgit', description: 'Ağır vuruşlar kanı geri emerek kombo süresini uzatır.', multiplier: 1.55 },
  { id: 'singularity', requires: 'vortex', level: 12, name: 'Tekillik', description: 'Girdap zayıflamış düşmanları merkeze kilitler.', multiplier: 1.7 },
]

const owned = new Set<string>()
const bonus = new Map<string, number>()

export function resetEvolutions() {
  owned.clear()
  bonus.clear()
}

export function evaluateEvolutions() {
  for (const evolution of EVOLUTIONS) {
    if (owned.has(evolution.id)) continue
    const level = abilities[evolution.requires as keyof typeof abilities] ?? 0
    if (level < evolution.level) continue
    owned.add(evolution.id)
    bonus.set(evolution.requires, evolution.multiplier)
    events.emit('ability:evolve', {
      abilityId: evolution.requires,
      evolutionId: evolution.id,
      level,
    })
  }
}

export function isEvolved(abilityId: string): boolean {
  return bonus.has(abilityId)
}

export function multiplierFor(abilityId: string): number {
  return bonus.get(abilityId) ?? 1
}

export function activeEvolutions(): readonly Evolution[] {
  return EVOLUTIONS.filter((evolution) => owned.has(evolution.id))
}
