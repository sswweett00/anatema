import { getPlayer, gameState, type Entity } from '../ecs/world'

/*
 * YETENEK SİSTEMİ — SINIRSIZ
 * · Seviye atlayınca 3 seçenekten biri seçilir.
 * · Aynı yetenek tekrar seçildikçe SEVİYESİ SINIRSIZ büyür.
 * · İki yetenek bir aradaysa SİNERJİ doğar; sinerjinin de seviyesi
 *   sınırsızdır (çiftin küçüğü) ve etkisi katlanarak güçlenir.
 * · Sinerji etkinleşince HUD'daki yeteneğin ADI sinerji adına dönüşür.
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
  | 'spikes'
  | 'pyre'
  | 'phantom'
  | 'venom'
  | 'heart'
  | 'swift'
  | 'armor'
  | 'crit'
  | 'magnet'
  | 'rage'
  | 'vamp'
  | 'stone'
  | 'ghoststep'
  | 'ferocity'
  | 'mend'

const ids: AbilityId[] = [
  'steel', 'arrows', 'nova', 'orbit', 'chain', 'storm', 'frost', 'vortex',
  'spikes', 'pyre', 'phantom', 'venom', 'heart', 'swift', 'armor', 'crit',
  'magnet', 'rage', 'vamp', 'stone', 'ghoststep', 'ferocity', 'mend',
]

export const abilities: Record<AbilityId, number> = Object.fromEntries(
  ids.map((i) => [i, 0])
) as Record<AbilityId, number>

export function resetAbilities() {
  for (const k of ids) abilities[k] = 0
}

export const PIP_SHOW = 5 /* rozette gösterilen pip sayısı (seviye sınırsız) */

export interface AbilityDef {
  id: AbilityId
  name: string
  type: 'AKTİF' | 'PASİF'
  desc: string
}

export const ABILITIES: AbilityDef[] = [
  { id: 'steel', name: 'Keskin Çelik', type: 'PASİF', desc: 'Büyük kılıcın hasarı artar, daha hızlı savrulur.' },
  { id: 'arrows', name: 'Kül Okları', type: 'AKTİF', desc: 'Omzundan kor oklar fırlar, en yakın canavara uçar.' },
  { id: 'nova', name: 'Kül Fırtınası', type: 'AKTİF', desc: 'Çevrene kor halkası patlar, her seviyede genişler.' },
  { id: 'orbit', name: 'Yörünge Korları', type: 'AKTİF', desc: 'Çevrende dönen korlar temas eden canavarı yakar.' },
  { id: 'chain', name: 'Zincir Kıvılcım', type: 'AKTİF', desc: 'Kıvılcım canavara sıçrar, diğerlerine atlar.' },
  { id: 'storm', name: 'Gök Yargısı', type: 'AKTİF', desc: 'Sürünün üzerine gökten yıldırım direği iner.' },
  { id: 'frost', name: 'Buz Nefesi', type: 'AKTİF', desc: 'Ayaz halkası canavarları yavaşlatır ve ısırır.' },
  { id: 'vortex', name: 'Kül Girdabı', type: 'AKTİF', desc: 'Girdap canavarları içine çeker ve öğütür.' },
  { id: 'spikes', name: 'Toprak Dikeni', type: 'AKTİF', desc: 'Yerden fışkıran dikenler sürüyü altından deşer.' },
  { id: 'pyre', name: 'Alev İzi', type: 'AKTİF', desc: 'Koştuğun yerde alev izi kalır, basan yanar.' },
  { id: 'phantom', name: 'Hayalet Kılıç', type: 'AKTİF', desc: 'Görünmez bir kılıç kendi kendine kavisle biçer.' },
  { id: 'venom', name: 'Zehir Bulutu', type: 'AKTİF', desc: 'Sürünün üstüne zehir bulutu çöker, eritir.' },
  { id: 'heart', name: 'Demir Yürek', type: 'PASİF', desc: '+25 azami can ve daha hızlı yenilenme.' },
  { id: 'swift', name: 'Kül Adımı', type: 'PASİF', desc: 'Hareket hızlanır, atılma daha çabuk dolar.' },
  { id: 'armor', name: 'Paslı Zırh', type: 'PASİF', desc: '+1 zırh ve +30 duruş.' },
  { id: 'crit', name: 'Keskin Göz', type: 'PASİF', desc: 'Vuruşların kritik isabet şansı kazanır.' },
  { id: 'magnet', name: 'Ruh Mıknatısı', type: 'PASİF', desc: 'Kesilen canavarlardan daha çok tecrübe emilir.' },
  { id: 'rage', name: 'Kan Hırsı', type: 'PASİF', desc: 'Canın azaldıkça hızlanır, daha sert vurursun.' },
  { id: 'vamp', name: 'Vampirizm', type: 'PASİF', desc: 'Her kesimde azami canının bir kısmı yenilenir.' },
  { id: 'stone', name: 'Taş Deri', type: 'PASİF', desc: 'Aldığın tüm hasar kalıcı olarak azalır.' },
  { id: 'ghoststep', name: 'Gölge Adımı', type: 'PASİF', desc: 'Atıldığın noktada gölge patlaması bırakır.' },
  { id: 'ferocity', name: 'Gaddarlık', type: 'PASİF', desc: 'Tüm hasarların kalıcı olarak artar.' },
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

/* ---------------- sinerjiler (sınırsız seviyeli kombinasyonlar) ---------------- */

export interface SynergyDef {
  id: string
  pair: [AbilityId, AbilityId]
  name: string
  desc: string
}

export const SYNERGIES: SynergyDef[] = [
  { id: 'dance', pair: ['steel', 'swift'], name: 'Kılıç Dansı', desc: 'Savuruşlar her seviyede %15 hızlanır' },
  { id: 'rain', pair: ['arrows', 'nova'], name: 'Kor Yağmuru', desc: 'Ok hasarı %50 artar, seviyeyle büyür' },
  { id: 'will', pair: ['armor', 'heart'], name: 'Demir İrade', desc: 'Duruşun asla kırılmaz' },
  { id: 'lord', pair: ['chain', 'storm'], name: 'Fırtına Lordu', desc: 'Kıvılcım güçlenir, yıldırım +1 hedef' },
  { id: 'exec', pair: ['crit', 'steel'], name: 'Cellat', desc: 'Kritik vuruşlar ×3.2+ vurur' },
  { id: 'icefire', pair: ['frost', 'orbit'], name: 'Buz ve Kor', desc: 'Yörünge korları güçlenir, ayaz uzar' },
  { id: 'skyarcher', pair: ['arrows', 'storm'], name: 'Gök Okçusu', desc: 'Ok hasarı +%25, yıldırım hızlanır' },
  { id: 'glacier', pair: ['frost', 'nova'], name: 'Buz Patlaması', desc: 'Kül Fırtınası vurduklarını dondurur' },
  { id: 'reaper', pair: ['vortex', 'crit'], name: 'Girdap Celladı', desc: 'Kritik şansın +%20 artar' },
  { id: 'bloodpact', pair: ['rage', 'heart'], name: 'Kan Ahdi', desc: 'Kan Hırsı daha yüksek canda bile kudurur' },
  { id: 'cataclysm', pair: ['spikes', 'storm'], name: 'Yer ve Gök', desc: 'Diken hasarı %60, yıldırım %25 artar' },
  { id: 'blazerunner', pair: ['pyre', 'swift'], name: 'Alev Koşucusu', desc: 'Alev izi genişler ve güçlenir' },
  { id: 'twinblades', pair: ['phantom', 'steel'], name: 'İkiz Kılıç', desc: 'Hayalet kılıçlar kılıç hasarıyla vurur' },
  { id: 'toxicfrost', pair: ['venom', 'frost'], name: 'Zehirli Ayaz', desc: 'Zehir yavaşlatılmış düşmanlarda 2 kat işler' },
  { id: 'bloodlord', pair: ['vamp', 'ferocity'], name: 'Kan Lordu', desc: 'Vampirizm iki katına çıkar' },
  { id: 'bastion', pair: ['stone', 'armor'], name: 'Kale', desc: 'Hasar azaltma derinleşir, duruş %40 artar' },
]

/* sinerji seviyesi = çiftin küçüğü (sınırsız) */
export const synLevel = (id: string): number => {
  const s = SYNERGIES.find((x) => x.id === id)!
  return Math.min(abilities[s.pair[0]], abilities[s.pair[1]])
}
export const hasSynergy = (id: string) => synLevel(id) > 0
export const ownedSynergies = () => SYNERGIES.filter((s) => synLevel(s.id) > 0)

/* katlanarak artan sinerji çarpanı (sınırsız seviye için) */
export const synScale = (id: string, base: number, per = 0.1): number => {
  const l = synLevel(id)
  return l > 0 ? base + per * (l - 1) : 1
}

/* bir yeteneğin şu an görünen adı: sinerji etkinse SİNERJİ ADI */
export function displayName(id: AbilityId): { label: string; syn: SynergyDef | null; synLvl: number } {
  const base = getDef(id).name
  const syn = SYNERGIES.find((s) => s.pair.includes(id) && synLevel(s.id) > 0) ?? null
  return syn ? { label: syn.name, syn, synLvl: synLevel(syn.id) } : { label: base, syn: null, synLvl: 0 }
}

/* ---------------- türetilmiş değerler ---------------- */

export const ferocityDmg = () => abilities.ferocity * 6

export const swordDamage = () => 26 + abilities.steel * 12
export const swordInterval = () =>
  Math.max(0.26, (0.58 - abilities.steel * 0.04) * (hasSynergy('dance') ? Math.pow(0.85, synLevel('dance')) : 1))
export const swordRange = () => 3.4 + abilities.steel * 0.15

export const arrowCount = () => Math.min(1 + abilities.arrows, 8)
export const arrowDamage = () =>
  (6 + abilities.arrows * 3) *
  (hasSynergy('rain') ? synScale('rain', 1.5, 0.12) : 1) *
  (hasSynergy('skyarcher') ? synScale('skyarcher', 1.25, 0.08) : 1)
export const arrowInterval = () => Math.max(0.14, 0.34 - abilities.arrows * 0.03)

export const novaDamage = () => 12 + abilities.nova * 8
export const novaRadius = () => 5 + abilities.nova * 0.5
export const novaCooldown = () => Math.max(2.8, 9 - abilities.nova * 1.1)

export const orbitDamage = () =>
  (4 + abilities.orbit * 3) * (hasSynergy('icefire') ? synScale('icefire', 1.5, 0.12) : 1)
export const orbitRadius = () => 1.5 + abilities.orbit * 0.12
export const orbitCount = () => Math.min(10, 2 + abilities.orbit)

export const chainDamage = () =>
  (12 + abilities.chain * 7) * (hasSynergy('lord') ? synScale('lord', 1.5, 0.12) : 1)
export const chainTargets = () => Math.min(10, 2 + abilities.chain)
export const chainInterval = () => Math.max(0.7, 1.7 - abilities.chain * 0.14)

export const stormDamage = () =>
  (30 + abilities.storm * 12) *
  (hasSynergy('lord') ? synScale('lord', 1.2, 0.08) : 1) *
  (hasSynergy('cataclysm') ? synScale('cataclysm', 1.25, 0.06) : 1)
export const stormTargets = () => 1 + Math.ceil(abilities.storm / 2) + synLevel('lord')
export const stormInterval = () =>
  Math.max(1.6, 3.6 - abilities.storm * 0.3) * (hasSynergy('skyarcher') ? Math.pow(0.9, synLevel('skyarcher')) : 1)

export const frostDamage = () => 6 + abilities.frost * 4
export const frostRadius = () => 4 + abilities.frost * 0.8
export const frostInterval = () => Math.max(2.2, 5 - abilities.frost * 0.45)
export const frostSlowDur = () => 2 + synLevel('icefire') * 0.5

export const vortexDamage = () => 10 + abilities.vortex * 6
export const vortexRadius = () => 5.5 + abilities.vortex * 0.5
export const vortexInterval = () => Math.max(2.6, 6.5 - abilities.vortex * 0.6)

/* ---- yeniler ---- */
export const spikesDamage = () =>
  (16 + abilities.spikes * 8) * (hasSynergy('cataclysm') ? synScale('cataclysm', 1.6, 0.1) : 1)
export const spikesCount = () => Math.min(8, 1 + abilities.spikes)
export const spikesInterval = () => Math.max(1, 2.6 - abilities.spikes * 0.25)
export const spikesRadius = () => 1.7

export const pyreDamage = () => 4 + abilities.pyre * 2
export const pyreInterval = () => 0.24
export const pyreRadius = () => 1.25 * (hasSynergy('blazerunner') ? synScale('blazerunner', 1.6, 0.1) : 1)
export const pyreLife = () => 2.4

export const phantomDamage = () =>
  12 + abilities.phantom * 7 + (hasSynergy('twinblades') ? swordDamage() * 0.5 * synScale('twinblades', 1, 0.1) : 0)
export const phantomInterval = () => Math.max(0.9, 2.2 - abilities.phantom * 0.2)
export const phantomRange = () => 4.4

export const venomDamage = () => 3 + abilities.venom * 2
export const venomInterval = () => Math.max(1.8, 3.4 - abilities.venom * 0.25)
export const venomRadius = () => 2.6 + abilities.venom * 0.35
export const venomDur = () => 3

/* ---- pasif türevler ---- */
export const rageThreshold = () => Math.min(0.95, (hasSynergy('bloodpact') ? 0.85 : 0.7) + synLevel('bloodpact') * 0.01)
export const rageActive = (p: Entity) => abilities.rage > 0 && p.health < p.maxHealth * rageThreshold()
export const rageMul = (p: Entity) => (rageActive(p) ? 1 + abilities.rage * 0.12 : 1)

export const moveSpeed = (p?: Entity) => {
  const base = 5.4 + abilities.swift * 0.55
  const r = p && rageActive(p) ? 1 + abilities.rage * 0.06 : 1
  return base * r
}
export const dashCooldownMax = () => Math.max(0.7, 1.3 - abilities.swift * 0.12)
export const regenRate = () => 2 + abilities.heart * 2
export const armorValue = () => 1 + abilities.armor + Math.floor(gameState.level / 5)
export const poiseMax = () =>
  (100 + abilities.armor * 30) * (hasSynergy('bastion') ? synScale('bastion', 1.4, 0.05) : 1)

export const stoneReduction = () =>
  Math.min(0.6, abilities.stone * 0.07 + (hasSynergy('bastion') ? 0.1 + 0.02 * synLevel('bastion') : 0))
export const vampHealPct = () =>
  abilities.vamp * 0.02 * (hasSynergy('bloodlord') ? synScale('bloodlord', 2, 0.15) : 1)
export const ghoststepDamage = () => 14 + abilities.ghoststep * 10
export const ghoststepRadius = () => 2.4

/* kritik + gaddarlık + hırs: tüm giden hasarlarda */
export function rollDamage(base: number, p: Entity): { value: number; crit: boolean } {
  const raged = (base + ferocityDmg()) * rageMul(p)
  const chance =
    abilities.crit * 0.12 +
    (hasSynergy('exec') ? 0.15 + 0.03 * (synLevel('exec') - 1) : 0) +
    (hasSynergy('reaper') ? 0.2 + 0.05 * (synLevel('reaper') - 1) : 0)
  if (chance > 0 && Math.random() < chance) {
    return { value: raged * (hasSynergy('exec') ? 3.2 + 0.15 * (synLevel('exec') - 1) : 2.4), crit: true }
  }
  return { value: raged, crit: false }
}

/* ---------------- XP / seviye (NERF: daha yavaş gelişim) ---------------- */

export const XP_VALUES = [1, 2, 4]
export const xpForLevel = (level: number) => Math.floor(8 * Math.pow(level, 1.4) + level * 2)
export const xpMultiplier = (combo: number) =>
  (1 + Math.min(combo, 20) * 0.03) * (1 + abilities.magnet * 0.2)

/* ---------------- seçim & uygulama ---------------- */

export function rollChoices(): AbilityId[] {
  const pool = ABILITIES.map((a) => a.id) /* seviye sınırı yok */
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 3)
}

export function applyAbility(id: AbilityId) {
  abilities[id] += 1 /* sınırsız */
  const p = getPlayer()
  if (!p) return
  switch (id) {
    case 'heart':
      p.maxHealth += 25
      p.health = Math.min(p.maxHealth, p.health + 25)
      break
    case 'armor':
      p.maxPoise = poiseMax()
      p.poise = p.maxPoise
      break
    case 'nova':
      if (abilities.nova === 1) p.novaCooldown = 0.6
      break
    case 'mend':
      p.health = Math.min(p.maxHealth, p.health + 40)
      break
  }
}
