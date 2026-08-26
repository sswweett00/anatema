import { getPlayer, gameState } from '../ecs/world'

/*
 * YETENEK SİSTEMİ — seviye atlayınca 3 seçenekten biri seçilir.
 * Aynı yetenek tekrar seçilince seviyelenir; farklı yetenekler
 * bir araya gelip kombinasyon (build) oluşturur.
 * Tüm durum MUTATIF — oyun döngüsünde re-render yok.
 */

export type AbilityId =
  | 'steel'
  | 'arrows'
  | 'nova'
  | 'orbit'
  | 'heart'
  | 'swift'
  | 'armor'
  | 'mend'

export const MAX_LVL = 5

export const abilities: Record<AbilityId, number> = {
  steel: 0,
  arrows: 0,
  nova: 0,
  orbit: 0,
  heart: 0,
  swift: 0,
  armor: 0,
  mend: 0,
}

export function resetAbilities() {
  ;(Object.keys(abilities) as AbilityId[]).forEach((k) => {
    abilities[k] = 0
  })
}

export interface AbilityDef {
  id: AbilityId
  name: string
  type: 'AKTİF' | 'PASİF'
  desc: string
}

export const ABILITIES: AbilityDef[] = [
  {
    id: 'steel',
    name: 'Keskin Çelik',
    type: 'PASİF',
    desc: 'Büyük kılıcın hasarı artar, daha hızlı savrulur.',
  },
  {
    id: 'arrows',
    name: 'Kül Okları',
    type: 'AKTİF',
    desc: 'Omzundan kor oklar fırlar, en yakın canavara uçar.',
  },
  {
    id: 'nova',
    name: 'Kül Fırtınası',
    type: 'AKTİF',
    desc: 'Her birkaç saniyede çevrene kor halkası patlar.',
  },
  {
    id: 'orbit',
    name: 'Yörünge Korları',
    type: 'AKTİF',
    desc: 'Çevrende dönen korlar temas eden canavarı yakar.',
  },
  {
    id: 'heart',
    name: 'Demir Yürek',
    type: 'PASİF',
    desc: '+25 azami can ve daha hızlı yenilenme.',
  },
  {
    id: 'swift',
    name: 'Kül Adımı',
    type: 'PASİF',
    desc: 'Hareket hızlanır, atılma daha çabuk dolar.',
  },
  {
    id: 'armor',
    name: 'Paslı Zırh',
    type: 'PASİF',
    desc: '+1 zırh ve +30 duruş.',
  },
]

export const MEND_DEF: AbilityDef = {
  id: 'mend',
  name: 'Kor Kalp',
  type: 'PASİF',
  desc: 'Küller canlanır: anında +40 can.',
}

export function getDef(id: AbilityId): AbilityDef {
  return id === 'mend' ? MEND_DEF : ABILITIES.find((a) => a.id === id)!
}

/* ---------------- türetilmiş değerler (saf fonksiyonlar) ---------------- */

export const swordDamage = () => 26 + abilities.steel * 12
export const swordInterval = () => Math.max(0.36, 0.58 - abilities.steel * 0.045)

export const arrowCount = () => Math.min(1 + abilities.arrows, 7)
export const arrowDamage = () => 6 + abilities.arrows * 3
export const arrowInterval = () => Math.max(0.16, 0.34 - abilities.arrows * 0.035)

export const novaDamage = () => 12 + abilities.nova * 8
export const novaRadius = () => 5 + abilities.nova * 0.5
export const novaCooldown = () => Math.max(3.2, 9 - abilities.nova * 1.3)

export const orbitDamage = () => 4 + abilities.orbit * 3
export const orbitRadius = () => 1.5 + abilities.orbit * 0.12
export const orbitCount = () => Math.min(8, 2 + abilities.orbit)

export const moveSpeed = () => 5.4 + abilities.swift * 0.55
export const dashCooldownMax = () => Math.max(0.7, 1.3 - abilities.swift * 0.12)
export const regenRate = () => 2 + abilities.heart * 2
export const armorValue = () => 1 + abilities.armor + Math.floor(gameState.level / 5)

/* ---------------- XP / seviye ---------------- */

/* canavar türüne göre XP: goblin / iskelet / balçık */
export const XP_VALUES = [1, 2, 4]

export const xpForLevel = (level: number) => 5 + level * 4

/* ---------------- seçim & uygulama ---------------- */

export function rollChoices(): AbilityId[] {
  const pool = ABILITIES.map((a) => a.id).filter((id) => abilities[id] < MAX_LVL)
  /* karıştır */
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picks = pool.slice(0, 3)
  while (picks.length < 3) picks.push('mend')
  return picks
}

export function applyAbility(id: AbilityId) {
  abilities[id] = Math.min(id === 'mend' ? 99 : MAX_LVL, abilities[id] + 1)
  const p = getPlayer()
  if (!p) return
  switch (id) {
    case 'heart':
      p.maxHealth += 25
      p.health = Math.min(p.maxHealth, p.health + 25)
      break
    case 'armor':
      p.maxPoise = 100 + abilities.armor * 30
      p.poise = p.maxPoise
      break
    case 'nova':
      if (abilities.nova === 1) p.novaCooldown = 0.6 /* ilk seçimde hemen patlasın */
      break
    case 'mend':
      p.health = Math.min(p.maxHealth, p.health + 40)
      break
  }
}
