import { getPlayer, gameState, type Entity } from '../ecs/world'

/*
 * YETENEK SİSTEMİ — seviye atlayınca 3 seçenekten biri seçilir.
 * Aynı yetenek tekrar seçilince seviyelenir; farklı yetenekler
 * bir araya gelip SİNERJİ (kombinasyon) açar.
 * Tüm durum MUTATIF — oyun döngüsünde re-render yok.
 */

export type AbilityId =
  | 'steel'
  | 'arrows'
  | 'nova'
  | 'orbit'
  | 'chain'
  | 'storm'
  | 'frost'
  | 'vortex'
  | 'heart'
  | 'swift'
  | 'armor'
  | 'crit'
  | 'magnet'
  | 'rage'
  | 'mend'

export const MAX_LVL = 5

export const abilities: Record<AbilityId, number> = {
  steel: 0,
  arrows: 0,
  nova: 0,
  orbit: 0,
  chain: 0,
  storm: 0,
  frost: 0,
  vortex: 0,
  heart: 0,
  swift: 0,
  armor: 0,
  crit: 0,
  magnet: 0,
  rage: 0,
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
    id: 'chain',
    name: 'Zincir Kıvılcım',
    type: 'AKTİF',
    desc: 'Kıvılcım en yakın canavara sıçrar, oradan diğerlerine atlar.',
  },
  {
    id: 'storm',
    name: 'Gök Yargısı',
    type: 'AKTİF',
    desc: 'Sürünün üzerine gökten yıldırım direği iner.',
  },
  {
    id: 'frost',
    name: 'Buz Nefesi',
    type: 'AKTİF',
    desc: 'Ayaz halkası çevredeki canavarları yavaşlatır ve ısırır.',
  },
  {
    id: 'vortex',
    name: 'Kül Girdabı',
    type: 'AKTİF',
    desc: 'Girdap canavarları içine çeker ve öğütür.',
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
  {
    id: 'crit',
    name: 'Keskin Göz',
    type: 'PASİF',
    desc: 'Vuruşların kritik isabet şansı kazanır (ağır hasar).',
  },
  {
    id: 'magnet',
    name: 'Ruh Mıknatısı',
    type: 'PASİF',
    desc: 'Kesilen canavarlardan daha çok tecrübe emilir.',
  },
  {
    id: 'rage',
    name: 'Kan Hırsı',
    type: 'PASİF',
    desc: 'Canın azaldıkça hızlanır ve daha sert vurursun.',
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

/* ---------------- sinerjiler (kombinasyonlar) ---------------- */

export interface SynergyDef {
  id: string
  pair: [AbilityId, AbilityId]
  name: string
  desc: string
}

export const SYNERGIES: SynergyDef[] = [
  {
    id: 'dance',
    pair: ['steel', 'swift'],
    name: 'Kılıç Dansı',
    desc: 'Savuruşlar %25 hızlanır',
  },
  {
    id: 'rain',
    pair: ['arrows', 'nova'],
    name: 'Kor Yağmuru',
    desc: 'Ok hasarı %50 artar',
  },
  {
    id: 'will',
    pair: ['armor', 'heart'],
    name: 'Demir İrade',
    desc: 'Duruşun asla kırılmaz',
  },
  {
    id: 'lord',
    pair: ['chain', 'storm'],
    name: 'Fırtına Lordu',
    desc: 'Kıvılcım %50 güçlenir, yıldırım +1 hedef',
  },
  {
    id: 'exec',
    pair: ['crit', 'steel'],
    name: 'Cellat',
    desc: 'Kritik vuruşlar ×3.2 vurur',
  },
  {
    id: 'icefire',
    pair: ['frost', 'orbit'],
    name: 'Buz ve Kor',
    desc: 'Yörünge korları %50 güçlenir, ayaz +1 sn',
  },
]

export const hasSynergy = (id: string) => {
  const s = SYNERGIES.find((x) => x.id === id)!
  return abilities[s.pair[0]] > 0 && abilities[s.pair[1]] > 0
}

export const ownedSynergies = () => SYNERGIES.filter((s) => hasSynergy(s.id))

/* ---------------- türetilmiş değerler (saf fonksiyonlar) ---------------- */

export const swordDamage = () => 26 + abilities.steel * 12
export const swordInterval = () =>
  Math.max(0.3, (0.58 - abilities.steel * 0.045) * (hasSynergy('dance') ? 0.75 : 1))
export const swordRange = () => 3.4 + abilities.steel * 0.15

export const arrowCount = () => Math.min(1 + abilities.arrows, 7)
export const arrowDamage = () =>
  (6 + abilities.arrows * 3) * (hasSynergy('rain') ? 1.5 : 1)
export const arrowInterval = () => Math.max(0.16, 0.34 - abilities.arrows * 0.035)

export const novaDamage = () => 12 + abilities.nova * 8
export const novaRadius = () => 5 + abilities.nova * 0.5
export const novaCooldown = () => Math.max(3.2, 9 - abilities.nova * 1.3)

export const orbitDamage = () =>
  (4 + abilities.orbit * 3) * (hasSynergy('icefire') ? 1.5 : 1)
export const orbitRadius = () => 1.5 + abilities.orbit * 0.12
export const orbitCount = () => Math.min(8, 2 + abilities.orbit)

export const chainDamage = () =>
  (12 + abilities.chain * 7) * (hasSynergy('lord') ? 1.5 : 1)
export const chainTargets = () => Math.min(9, 2 + abilities.chain)
export const chainInterval = () => Math.max(0.8, 1.7 - abilities.chain * 0.18)

export const stormDamage = () => 30 + abilities.storm * 12
export const stormTargets = () => 1 + Math.ceil(abilities.storm / 2) + (hasSynergy('lord') ? 1 : 0)
export const stormInterval = () => Math.max(1.8, 3.6 - abilities.storm * 0.35)

export const frostDamage = () => 6 + abilities.frost * 4
export const frostRadius = () => 4 + abilities.frost * 0.8
export const frostInterval = () => Math.max(2.4, 5 - abilities.frost * 0.5)
export const frostSlowDur = () => 2 + (hasSynergy('icefire') ? 1 : 0)

export const vortexDamage = () => 10 + abilities.vortex * 6
export const vortexRadius = () => 5.5 + abilities.vortex * 0.5
export const vortexInterval = () => Math.max(3, 6.5 - abilities.vortex * 0.7)

export const rageActive = (p: Entity) => abilities.rage > 0 && p.health < p.maxHealth * 0.7
export const rageMul = (p: Entity) => (rageActive(p) ? 1 + abilities.rage * 0.12 : 1)
export const moveSpeed = (p?: Entity) => {
  const base = 5.4 + abilities.swift * 0.55
  const r = p && abilities.rage > 0 && p.health < p.maxHealth * 0.7 ? 1 + abilities.rage * 0.06 : 1
  return base * r
}
export const dashCooldownMax = () => Math.max(0.7, 1.3 - abilities.swift * 0.12)
export const regenRate = () => 2 + abilities.heart * 2
export const armorValue = () => 1 + abilities.armor + Math.floor(gameState.level / 5)

/* kritik + hırs çarpanı: tüm giden hasarlarda kullanılır */
export function rollDamage(base: number, p: Entity): { value: number; crit: boolean } {
  const raged = base * rageMul(p)
  const chance = abilities.crit * 0.12 + (hasSynergy('exec') ? 0.15 : 0)
  if (chance > 0 && Math.random() < chance) {
    return { value: raged * (hasSynergy('exec') ? 3.2 : 2.4), crit: true }
  }
  return { value: raged, crit: false }
}

/* ---------------- XP / seviye / kombo ---------------- */

/* canavar türüne göre XP: goblin / iskelet / balçık */
export const XP_VALUES = [1, 2, 4]

export const xpForLevel = (level: number) => 5 + level * 4

/* kombo bonusu + ruh mıknatısı */
export const xpMultiplier = (combo: number) =>
  (1 + Math.min(combo, 25) * 0.05) * (1 + abilities.magnet * 0.3)

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
