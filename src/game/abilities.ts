import { getPlayer, gameState, type Entity } from '../ecs/world'

/*
 * YETENEK SİSTEMİ — SINIRSIZ
 * Seviye atlayınca 3 seçenekten biri seçilir; aynı yetenek sınırsız yükselir.
 * Aktif/pasif davranışlar runtime katmanları tarafından gerçek zamanlı uygulanır.
 */

export type AbilityId =
  | 'steel' | 'arrows' | 'nova' | 'orbit' | 'chain' | 'storm' | 'frost' | 'vortex'
  | 'spikes' | 'pyre' | 'phantom' | 'venom' | 'heart' | 'swift' | 'armor' | 'crit'
  | 'magnet' | 'rage' | 'vamp' | 'stone' | 'ghoststep' | 'ferocity' | 'thorns'
  | 'laststand' | 'focus' | 'momentum' | 'adrenaline' | 'bulwark' | 'greed' | 'harvest'
  | 'scholar' | 'warlord' | 'mend'
  | 'meteor' | 'gravitywell' | 'soulbolts' | 'bladestorm' | 'arcanemine' | 'bloodnova'
  | 'voidrift' | 'mirrors' | 'wolfpack' | 'seismic' | 'runeprison' | 'frostfire'
  | 'ward' | 'overcharge' | 'executioner' | 'berserker' | 'resilience' | 'siphon'
  | 'evasion' | 'precision' | 'conduit' | 'detonation' | 'fortunesfavor' | 'lifeforge'
  | 'aegis' | 'hemocraft' | 'celerity' | 'deathsmark' | 'soulharvest'

const ids: AbilityId[] = [
  'steel','arrows','nova','orbit','chain','storm','frost','vortex','spikes','pyre','phantom','venom',
  'heart','swift','armor','crit','magnet','rage','vamp','stone','ghoststep','ferocity','thorns','laststand',
  'focus','momentum','adrenaline','bulwark','greed','harvest','scholar','warlord','mend',
  'meteor','gravitywell','soulbolts','bladestorm','arcanemine','bloodnova','voidrift','mirrors','wolfpack','seismic','runeprison','frostfire',
  'ward','overcharge','executioner','berserker','resilience','siphon','evasion','precision','conduit','detonation','fortunesfavor','lifeforge',
  'aegis','hemocraft','celerity','deathsmark','soulharvest',
]

export const abilities: Record<AbilityId, number> = Object.fromEntries(ids.map((i) => [i, 0])) as Record<AbilityId, number>
export function resetAbilities() { for (const k of ids) abilities[k] = 0 }
export const PIP_SHOW = 5

export interface AbilityDef { id: AbilityId; name: string; type: 'AKTİF' | 'PASİF'; desc: string }

export const ABILITIES: AbilityDef[] = [
  { id:'steel', name:'Keskin Çelik', type:'PASİF', desc:'Büyük kılıcın hasarı artar, daha hızlı savrulur.' },
  { id:'arrows', name:'Kül Okları', type:'AKTİF', desc:'Kor okları yakın hedeflere saplanır ve seviye başına ek mermi kazanır.' },
  { id:'nova', name:'Kül Fırtınası', type:'AKTİF', desc:'Çevrene genişleyen bir kor şoku gönderir.' },
  { id:'orbit', name:'Yörünge Korları', type:'AKTİF', desc:'Yörünge parçaları temas hasarı verir.' },
  { id:'chain', name:'Zincir Kıvılcım', type:'AKTİF', desc:'Elektrik atlamaları hedefler arasında zincirlenir.' },
  { id:'storm', name:'Gök Yargısı', type:'AKTİF', desc:'Gökyüzünden hedeflere yüksek güçlü yıldırım düşer.' },
  { id:'frost', name:'Buz Nefesi', type:'AKTİF', desc:'Ayaz halkası hasar verir ve yavaşlatır.' },
  { id:'vortex', name:'Kül Girdabı', type:'AKTİF', desc:'Düşmanları merkeze çeken yıkıcı bir girdap.' },
  { id:'spikes', name:'Toprak Dikeni', type:'AKTİF', desc:'Zeminden çoklu dikenler fışkırır.' },
  { id:'pyre', name:'Alev İzi', type:'AKTİF', desc:'Hareket yolunda süreli ateş alanları bırakır.' },
  { id:'phantom', name:'Hayalet Kılıç', type:'AKTİF', desc:'Uzak hedefleri biçen spektral kılıç yayı.' },
  { id:'venom', name:'Zehir Bulutu', type:'AKTİF', desc:'Alanı zehirleyerek zamanla hasar verir.' },
  { id:'heart', name:'Demir Yürek', type:'PASİF', desc:'Azami can ve iyileşme yükselir.' },
  { id:'swift', name:'Kül Adımı', type:'PASİF', desc:'Hareket ve atılma döngüsü hızlanır.' },
  { id:'armor', name:'Paslı Zırh', type:'PASİF', desc:'Zırh ve duruş kapasitesini yükseltir.' },
  { id:'crit', name:'Keskin Göz', type:'PASİF', desc:'Kritik vuruş şansını yükseltir.' },
  { id:'magnet', name:'Ruh Mıknatısı', type:'PASİF', desc:'Tecrübe toplama gücü artar.' },
  { id:'rage', name:'Kan Hırsı', type:'PASİF', desc:'Düşük canlıyken saldırı ve hız artar.' },
  { id:'vamp', name:'Vampirizm', type:'PASİF', desc:'Kesimler küçük can yenilemeleri sağlar.' },
  { id:'stone', name:'Taş Deri', type:'PASİF', desc:'Gelen hasar azaltılır.' },
  { id:'ghoststep', name:'Gölge Adımı', type:'PASİF', desc:'Atılma başlangıcında gölge patlaması oluşturur.' },
  { id:'ferocity', name:'Gaddarlık', type:'PASİF', desc:'Hasar tabanını yükseltir.' },
  { id:'thorns', name:'Dikenli Plaka', type:'PASİF', desc:'Yakın saldırganlara geri hasar verir.' },
  { id:'laststand', name:'Son Direniş', type:'PASİF', desc:'Ölümcül darbeyi bir kez engeller.' },
  { id:'focus', name:'Ölüm Odağı', type:'PASİF', desc:'Kritik hasarı güçlendirir.' },
  { id:'momentum', name:'Momentum', type:'PASİF', desc:'Hareket ederken saldırı gücünü büyütür.' },
  { id:'adrenaline', name:'Adrenalin', type:'PASİF', desc:'Kombo yükseldikçe cooldown ve tempo hızlanır.' },
  { id:'bulwark', name:'Kalkan Duvarı', type:'PASİF', desc:'Kalabalık içinde hasar azaltır.' },
  { id:'greed', name:'Altın Göz', type:'PASİF', desc:'Ödül verimliliğini artırır.' },
  { id:'harvest', name:'Can Hasadı', type:'PASİF', desc:'Kesimlerin iyileştirme şansını artırır.' },
  { id:'scholar', name:'Kadim Bilgelik', type:'PASİF', desc:'Seviye deneyim ihtiyacını azaltır.' },
  { id:'warlord', name:'Savaş Lordu', type:'PASİF', desc:'Aktif yetenek cooldownlarını hızlandırır.' },
  { id:'mend', name:'Kor Kalp', type:'PASİF', desc:'Seçildiğinde anlık can yeniler.' },

  { id:'meteor', name:'Kıyamet Meteoru', type:'AKTİF', desc:'Gecikmeli telegraph sonrası hedef bölgeye düşen dev meteor; merkezde ağır fiziksel hasar, kenarlarda savurma ve alev alanı bırakır.' },
  { id:'gravitywell', name:'Yerçekimi Kuyusu', type:'AKTİF', desc:'Düşmanları zamana bağlı olarak merkeze çeker; son vuruşta çöküş patlaması oluşturur.' },
  { id:'soulbolts', name:'Ruh İğneleri', type:'AKTİF', desc:'Birden fazla ruh mermisi hedef seçer, düşük canlı hedeflere ekstra hasar verir ve öldürmede zincirlenir.' },
  { id:'bladestorm', name:'Kılıç Kasırgası', type:'AKTİF', desc:'Oyuncunun etrafında çok aşamalı dönen spektral bıçaklar oluşturur; combo ile dönüş ve yarıçap artar.' },
  { id:'arcanemine', name:'Kadim Mayın', type:'AKTİF', desc:'Yakına gelen düşmanları algılayan rune mayınları kurar; patlama zincir reaksiyonu başlatabilir.' },
  { id:'bloodnova', name:'Kan Nova', type:'AKTİF', desc:'Yakındaki düşmanların canından güç alan patlama; kayıp oyuncu canına göre hasar artar ve iyileştirme bırakır.' },
  { id:'voidrift', name:'Hiçlik Yarığı', type:'AKTİF', desc:'Haritada kısa süreli karanlık yarık açar; düşmanları zayıflatır ve belirli aralıklarla void darbeleri yollar.' },
  { id:'mirrors', name:'Ayna Ruhlar', type:'AKTİF', desc:'Oyuncunun saldırı ritmini taklit eden spektral yansımalar; yakın hedeflere yönlü çift darbe yapar.' },
  { id:'wolfpack', name:'Ruh Kurtları', type:'AKTİF', desc:'Kısa ömürlü avcı ruhlar üretir; hedefi çevreleyip ısırır ve kritiklerde ek kurt çağırabilir.' },
  { id:'seismic', name:'Sismik Hüküm', type:'AKTİF', desc:'Konik zeminde dalga ilerler; hedefleri havaya kaldırır, duvara yaklaşanları ekstra sarsar.' },
  { id:'runeprison', name:'Rün Hapishanesi', type:'AKTİF', desc:'Elit/boss çevresinde kısa süreli rün kafesi kurar; çıkışta patlayan keskin enerji duvarları oluşturur.' },
  { id:'frostfire', name:'Kriyopire', type:'AKTİF', desc:'Ateş ve buzu aynı anda uygular; yanmış hedefleri dondurup kırılma patlaması tetikleyebilir.' },
  { id:'ward', name:'Astral Bariyer', type:'PASİF', desc:'Hasar aldığında kısa süreli enerji kalkanı kazanır; tekrar eden isabetlerde kalkan güçlenir.' },
  { id:'overcharge', name:'Aşırı Yük', type:'PASİF', desc:'Cooldown bekleme sırasında enerji biriktirir; dolunca bir sonraki aktif yeteneğin etkisini patlatır.' },
  { id:'executioner', name:'Cellat Mührü', type:'PASİF', desc:'Düşük canlı düşmanlara karşı gerçek execute eşiğini yükseltir ve execute sonrası kısa güçlenme verir.' },
  { id:'berserker', name:'Çılgın Savaşçı', type:'PASİF', desc:'Uzun süre hasar almadan kaldıkça saldırı gücü ve hareket ivmesi kademe kademe büyür; hasar alınca düşer.' },
  { id:'resilience', name:'Kırılmazlık', type:'PASİF', desc:'Aynı kaynaktan kısa sürede gelen tekrar hasarları giderek azaltır.' },
  { id:'siphon', name:'Ruh Sömürüsü', type:'PASİF', desc:'Elite ve boss hasarı verdiğinde parçalı olarak can ve enerji geri kazanır.' },
  { id:'evasion', name:'Gölge Refleksi', type:'PASİF', desc:'Hızlı hareket ve zamanlamaya bağlı kaçınma şansı kazanır; başarılı kaçınma kısa invulnerability verir.' },
  { id:'precision', name:'Mükemmel Geometri', type:'PASİF', desc:'Aynı hedefe art arda vuruşlarda isabet başına hedef açığı birikir.' },
  { id:'conduit', name:'Ruh İletkeni', type:'PASİF', desc:'Elemental durumlar yayıldıkça yakındaki başka hedeflere düşük güçlü kopyalar taşır.' },
  { id:'detonation', name:'Zamanlı Patlayıcı', type:'PASİF', desc:'Kritik veya elemental reaksiyon işaretli hedefler gecikmeli iç patlama kazanır.' },
  { id:'fortunesfavor', name:'Talihin Eli', type:'PASİF', desc:'Nadir loot, relic ve güçlü ödüllerin ağırlığını artırır; düşük ihtimalli zincir ödüller açar.' },
  { id:'lifeforge', name:'Yaşam Ocağı', type:'PASİF', desc:'Maksimum can arttıkça kalkan/iyileşme verimi de artar.' },
  { id:'aegis', name:'Aegis', type:'PASİF', desc:'Belirli can eşiğinde tüm yakın hasarı emen katmanlı koruma sağlar.' },
  { id:'hemocraft', name:'Kan Sanatı', type:'PASİF', desc:'Kayıp canı geçici güce çevirir; iyileşince yük bir kısmı dönüşür.' },
  { id:'celerity', name:'Çeviklik', type:'PASİF', desc:'Animasyon recovery ve hareket başlangıç ivmesini sürekli iyileştirir.' },
  { id:'deathsmark', name:'Ölüm İşareti', type:'PASİF', desc:'Uzun süre hayatta kalan elitlerde işaret birikir; işaretli hedefler daha kolay execute olur.' },
  { id:'soulharvest', name:'Ruh Hasadı', type:'PASİF', desc:'Her 25 kesimde kalıcı bir ruh yükü üretir; yükler aktif yetenekleri ve pickup çekimini güçlendirir.' },
]

export const MEND_DEF: AbilityDef = { id:'mend', name:'Kor Kalp', type:'PASİF', desc:'Küller canlanır: anında +40 can.' }
export function getDef(id: AbilityId): AbilityDef { return id === 'mend' ? MEND_DEF : ABILITIES.find((a) => a.id === id)! }

export interface SynergyDef { id: string; pair: [AbilityId, AbilityId]; name: string; desc: string }

export const SYNERGIES: SynergyDef[] = [
  { id:'dance', pair:['steel','swift'], name:'Kılıç Dansı', desc:'Savuruşlar hızlanır.' },
  { id:'rain', pair:['arrows','nova'], name:'Kor Yağmuru', desc:'Oklar ek patlama kazanır.' },
  { id:'will', pair:['armor','heart'], name:'Demir İrade', desc:'Duruş direnci yükselir.' },
  { id:'lord', pair:['chain','storm'], name:'Fırtına Lordu', desc:'Yıldırım zinciri büyür.' },
  { id:'exec', pair:['crit','steel'], name:'Cellat', desc:'Kritik darbeler vahşileşir.' },
  { id:'icefire', pair:['frost','orbit'], name:'Buz ve Kor', desc:'Soğuk ve ateş birlikte patlar.' },
  { id:'skyarcher', pair:['arrows','storm'], name:'Gök Okçusu', desc:'Oklar gökten işaretlenir.' },
  { id:'glacier', pair:['frost','nova'], name:'Buz Patlaması', desc:'Nova dondurma uygular.' },
  { id:'reaper', pair:['vortex','crit'], name:'Girdap Celladı', desc:'Girdap kritik oranı yükseltir.' },
  { id:'bloodpact', pair:['rage','heart'], name:'Kan Ahdi', desc:'Kan hırsı daha uzun sürer.' },
  { id:'cataclysm', pair:['spikes','storm'], name:'Yer ve Gök', desc:'Zemin ve yıldırım birleşir.' },
  { id:'blazerunner', pair:['pyre','swift'], name:'Alev Koşucusu', desc:'Koşu alevi genişler.' },
  { id:'twinblades', pair:['phantom','steel'], name:'İkiz Kılıç', desc:'Hayalet kılıç fiziksel darbeyi kopyalar.' },
  { id:'toxicfrost', pair:['venom','frost'], name:'Zehirli Ayaz', desc:'Yavaş hedeflerde zehir yoğunlaşır.' },
  { id:'bloodlord', pair:['vamp','ferocity'], name:'Kan Lordu', desc:'Kan gücü katlanır.' },
  { id:'bastion', pair:['stone','armor'], name:'Kale', desc:'Hasar azaltma derinleşir.' },
  { id:'phoenix', pair:['laststand','heart'], name:'Anka Kuşu', desc:'Diriliş güçlenir.' },
  { id:'spikedshell', pair:['thorns','armor'], name:'Dikenli Kabuk', desc:'Geri hasar güçlenir.' },
  { id:'deadeye', pair:['focus','crit'], name:'Ölüm Gözü', desc:'Kritik şans ve çarpan artar.' },
  { id:'juggernaut', pair:['momentum','swift'], name:'Yıkım Topu', desc:'Hız saldırıya dönüşür.' },
  { id:'frenzy', pair:['adrenaline','rage'], name:'Çılgınlık', desc:'Kombo gücü hasara dönüşür.' },
  { id:'fortress', pair:['bulwark','stone'], name:'Ebedi Kale', desc:'Hasar azaltma tavanı yükselir.' },
  { id:'reaperking', pair:['harvest','vamp'], name:'Hasat Kralı', desc:'Kesim iyileştirmesi büyür.' },
  { id:'warmaster', pair:['warlord','steel'], name:'Savaş Ustası', desc:'Savuruşlar çok hızlanır.' },
  { id:'archivist', pair:['scholar','magnet'], name:'Ruh Arşivcisi', desc:'Tecrübe verimi artar.' },
  { id:'treasury', pair:['greed','heart'], name:'Hazine', desc:'Milestone ödülleri can da yeniler.' },
  { id:'meteorstorm', pair:['meteor','storm'], name:'Göktaşı Yağmuru', desc:'Meteorlar yıldırım çekirdeği bırakır.' },
  { id:'voidgravity', pair:['voidrift','gravitywell'], name:'Hiçlik Kuyusu', desc:'Rift içindeki çekim ve hasar katlanır.' },
  { id:'bloodfrost', pair:['bloodnova','frostfire'], name:'Kızıl Kırağı', desc:'Kan patlaması dondurulmuş hedefleri parçalar.' },
  { id:'soulmirror', pair:['soulbolts','mirrors'], name:'Ruh Aynası', desc:'Ruh mermileri kopyalanır.' },
  { id:'wolfrift', pair:['wolfpack','voidrift'], name:'Yarık Avcıları', desc:'Kurtlar işaretli hedeflere ışınlanır.' },
  { id:'arcblade', pair:['arcanemine','bladestorm'], name:'Rünlü Fırtına', desc:'Bıçaklar mayınları tetikler.' },
  { id:'seismicfrost', pair:['seismic','frost'], name:'Buz Kırığı', desc:'Havaya kalkan hedefler donup çatlar.' },
  { id:'runefire', pair:['runeprison','pyre'], name:'Kül Hapishanesi', desc:'Rün duvarları alevlenir.' },
  { id:'frostconduit', pair:['frostfire','conduit'], name:'Element İletimi', desc:'Ateş ve buz zincirleme taşınır.' },
  { id:'overchargeward', pair:['overcharge','ward'], name:'Enerji Kalkanı', desc:'Biriktirilen enerji savunmaya çevrilir.' },
  { id:'executionmark', pair:['executioner','deathsmark'], name:'Son Mühür', desc:'İşaretli hedefler daha erken execute edilir.' },
  { id:'berserkblood', pair:['berserker','hemocraft'], name:'Kan Çılgınlığı', desc:'Kayıp can güç ve hız olarak akar.' },
  { id:'aegislifeforge', pair:['aegis','lifeforge'], name:'Yaşam Kalesi', desc:'Kalkan maksimum can ile ölçeklenir.' },
  { id:'precisiondetonation', pair:['precision','detonation'], name:'Kusursuz Patlama', desc:'Isabet zinciri işaretli hedefleri patlatır.' },
  { id:'fortuneharvest', pair:['fortunesfavor','harvest'], name:'Bereketli Hasat', desc:'Nadir pickup ve iyileşme zinciri açılır.' },
  { id:'celeritymirror', pair:['celerity','mirrors'], name:'Çifte Tempo', desc:'Ayna saldırıları daha hızlı tekrarlar.' },
  { id:'soulconduit', pair:['soulharvest','conduit'], name:'Ruh Ağı', desc:'Ruh yükleri elemental yayılım üretir.' },
]

export const synLevel = (id: string): number => { const s = SYNERGIES.find((x) => x.id === id); return s ? Math.min(abilities[s.pair[0]], abilities[s.pair[1]]) : 0 }
export const hasSynergy = (id: string) => synLevel(id) > 0
export const ownedSynergies = () => SYNERGIES.filter((s) => synLevel(s.id) > 0)
export const synScale = (id: string, base: number, per = 0.1): number => { const l = synLevel(id); return l > 0 ? base + per * (l - 1) : 1 }
export function displayName(id: AbilityId): { label: string; syn: SynergyDef | null; synLvl: number } {
  const base = getDef(id).name
  const syn = SYNERGIES.find((s) => s.pair.includes(id) && synLevel(s.id) > 0) ?? null
  return syn ? { label: syn.name, syn, synLvl: synLevel(syn.id) } : { label: base, syn: null, synLvl: 0 }
}

export const ferocityDmg = () => abilities.ferocity * 6
export const haste = () => {
  let h = Math.pow(0.96, abilities.warlord) * Math.pow(0.985, abilities.celerity)
  if (abilities.adrenaline > 0 && gameState.combo >= 5) h *= Math.max(0.48, 1 - Math.min(gameState.combo, 30) * 0.012 * abilities.adrenaline)
  return h
}

export const swordDamage = () => 26 + abilities.steel * 12
export const swordInterval = () => Math.max(0.22, (0.58 - abilities.steel * 0.04) * (hasSynergy('dance') ? Math.pow(0.85, synLevel('dance')) : 1) * (hasSynergy('warmaster') ? Math.pow(0.9, synLevel('warmaster')) : 1) * haste())
export const swordRange = () => 3.4 + abilities.steel * 0.15
export const arrowCount = () => Math.min(1 + abilities.arrows, 8)
export const arrowDamage = () => (6 + abilities.arrows * 3) * (hasSynergy('rain') ? synScale('rain', 1.5, 0.12) : 1) * (hasSynergy('skyarcher') ? synScale('skyarcher', 1.25, 0.08) : 1)
export const arrowInterval = () => Math.max(0.14, (0.34 - abilities.arrows * 0.03) * haste())
export const novaDamage = () => 12 + abilities.nova * 8
export const novaRadius = () => 5 + abilities.nova * 0.5
export const novaCooldown = () => Math.max(2.4, (9 - abilities.nova * 1.1) * haste())
export const orbitDamage = () => (4 + abilities.orbit * 3) * (hasSynergy('icefire') ? synScale('icefire', 1.5, 0.12) : 1)
export const orbitRadius = () => 1.5 + abilities.orbit * 0.12
export const orbitCount = () => Math.min(10, 2 + abilities.orbit)
export const chainDamage = () => (12 + abilities.chain * 7) * (hasSynergy('lord') ? synScale('lord', 1.5, 0.12) : 1)
export const chainTargets = () => Math.min(10, 2 + abilities.chain)
export const chainInterval = () => Math.max(0.62, (1.7 - abilities.chain * 0.14) * haste())
export const stormDamage = () => (30 + abilities.storm * 12) * (hasSynergy('lord') ? synScale('lord', 1.2, 0.08) : 1) * (hasSynergy('cataclysm') ? synScale('cataclysm', 1.25, 0.06) : 1)
export const stormTargets = () => 1 + Math.ceil(abilities.storm / 2) + synLevel('lord')
export const stormInterval = () => Math.max(1.35, 3.6 - abilities.storm * 0.3) * (hasSynergy('skyarcher') ? Math.pow(0.9, synLevel('skyarcher')) : 1) * haste()
export const frostDamage = () => 6 + abilities.frost * 4
export const frostRadius = () => 4 + abilities.frost * 0.8
export const frostInterval = () => Math.max(2, (5 - abilities.frost * 0.45) * haste())
export const frostSlowDur = () => 2 + synLevel('icefire') * 0.5
export const vortexDamage = () => 10 + abilities.vortex * 6
export const vortexRadius = () => 5.5 + abilities.vortex * 0.5
export const vortexInterval = () => Math.max(2.4, (6.5 - abilities.vortex * 0.6) * haste())
export const spikesDamage = () => (16 + abilities.spikes * 8) * (hasSynergy('cataclysm') ? synScale('cataclysm', 1.6, 0.1) : 1)
export const spikesCount = () => Math.min(8, 1 + abilities.spikes)
export const spikesInterval = () => Math.max(0.9, (2.6 - abilities.spikes * 0.25) * haste())
export const spikesRadius = () => 1.7
export const pyreDamage = () => 4 + abilities.pyre * 2
export const pyreInterval = () => 0.24 * haste()
export const pyreRadius = () => 1.25 * (hasSynergy('blazerunner') ? synScale('blazerunner', 1.6, 0.1) : 1)
export const pyreLife = () => 2.4
export const phantomDamage = () => 12 + abilities.phantom * 7 + (hasSynergy('twinblades') ? swordDamage() * 0.5 * synScale('twinblades', 1, 0.1) : 0)
export const phantomInterval = () => Math.max(0.82, (2.2 - abilities.phantom * 0.2) * haste())
export const phantomRange = () => 4.4
export const venomDamage = () => 3 + abilities.venom * 2
export const venomInterval = () => Math.max(1.6, (3.4 - abilities.venom * 0.25) * haste())
export const venomRadius = () => 2.6 + abilities.venom * 0.35
export const venomDur = () => 3

export const rageThreshold = () => Math.min(0.95, (hasSynergy('bloodpact') ? 0.85 : 0.7) + synLevel('bloodpact') * 0.01)
export const rageActive = (p: Entity) => abilities.rage > 0 && p.health < p.maxHealth * rageThreshold()
export const rageMul = (p: Entity) => rageActive(p) ? 1 + abilities.rage * 0.12 : 1
export const moveSpeed = (p?: Entity) => { const base = 5.4 + abilities.swift * 0.55 + abilities.celerity * 0.16; const r = p && rageActive(p) ? 1 + abilities.rage * 0.06 : 1; return base * r }
export const dashCooldownMax = () => Math.max(0.62, 1.3 - abilities.swift * 0.12) * (hasSynergy('juggernaut') ? Math.pow(0.85, synLevel('juggernaut')) : 1) * Math.pow(0.975, abilities.celerity)
export const regenRate = () => 2 + abilities.heart * 2 + abilities.lifeforge * 0.65
export const armorValue = () => 1 + abilities.armor + Math.floor(gameState.level / 5) + abilities.aegis * 0.25
export const poiseMax = () => (100 + abilities.armor * 30 + abilities.resilience * 8) * (hasSynergy('bastion') ? synScale('bastion', 1.4, 0.05) : 1)
export const stoneReduction = () => Math.min(hasSynergy('fortress') ? 0.75 : 0.6, abilities.stone * 0.07 + abilities.resilience * 0.025 + (hasSynergy('bastion') ? 0.1 + 0.02 * synLevel('bastion') : 0))
export const healMul = () => (hasSynergy('reaperking') ? synScale('reaperking', 1.6, 0.1) : 1) * (1 + abilities.lifeforge * 0.08)
export const vampHealPct = () => abilities.vamp * 0.02 * (hasSynergy('bloodlord') ? synScale('bloodlord', 2, 0.15) : 1) * healMul()
export const ghoststepDamage = () => 14 + abilities.ghoststep * 10
export const ghoststepRadius = () => 2.4
export const thornsDamage = () => (8 + abilities.thorns * 6 + abilities.hemocraft * 2) * (hasSynergy('spikedshell') ? synScale('spikedshell', 2.5, 0.2) : 1)
export const bulwarkReduction = (nearby: number) => abilities.bulwark > 0 ? Math.min(0.5, nearby * 0.04 * abilities.bulwark) : 0
export const harvestChance = () => Math.min(0.78, 0.2 + abilities.harvest * 0.05)
export const harvestHeal = () => 4 * healMul()
export const lastStandHpPct = () => hasSynergy('phoenix') ? 0.7 : 0.4
export const milestoneHeal = (maxHealth: number) => 10 + abilities.greed * 8 + (hasSynergy('treasury') ? maxHealth * 0.04 * synLevel('treasury') : 0)

export function rollDamage(base: number, p: Entity): { value: number; crit: boolean } {
  let value = (base + ferocityDmg()) * rageMul(p)
  if (abilities.momentum > 0 && Math.hypot(p.velocity.x, p.velocity.z) > 1.5) value *= 1 + Math.min(0.45, abilities.momentum * 0.04) * (hasSynergy('juggernaut') ? synScale('juggernaut', 1.5, 0.1) : 1)
  if (hasSynergy('frenzy') && gameState.combo >= 5) value *= 1 + Math.min(gameState.combo, 30) * 0.01 * synLevel('frenzy')
  if (abilities.berserker > 0 && gameState.combo > 8) value *= 1 + Math.min(0.5, gameState.combo * 0.005 * abilities.berserker)
  const chance = abilities.crit * 0.12 + abilities.precision * 0.015 + (hasSynergy('deadeye') ? 0.1 + 0.02 * synLevel('deadeye') : 0) + (hasSynergy('exec') ? 0.15 + 0.03 * (synLevel('exec') - 1) : 0) + (hasSynergy('reaper') ? 0.2 + 0.05 * (synLevel('reaper') - 1) : 0)
  if (chance > 0 && Math.random() < Math.min(0.95, chance)) {
    let mul = hasSynergy('exec') ? 3.2 + 0.15 * (synLevel('exec') - 1) : 2.4
    mul += abilities.focus * 0.5 + (hasSynergy('deadeye') ? 0.5 * synLevel('deadeye') : 0)
    return { value: value * mul, crit: true }
  }
  return { value, crit: false }
}

export const XP_VALUES = [1, 2, 4]
export const xpForLevel = (level: number) => Math.max(6, Math.floor((8 * Math.pow(level, 1.4) + level * 2) * Math.max(0.45, 1 - abilities.scholar * 0.06)))
export const xpMultiplier = (combo: number) => (1 + Math.min(combo, 20) * 0.03) * (1 + abilities.magnet * 0.2) * (1 + abilities.soulharvest * 0.03) * (hasSynergy('archivist') ? synScale('archivist', 1.25, 0.08) : 1)

export function rollChoices(): AbilityId[] {
  const pool = ABILITIES.map((a) => a.id)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  return pool.slice(0, 3)
}

export function applyAbility(id: AbilityId) {
  abilities[id] += 1
  const p = getPlayer()
  if (!p) return
  switch (id) {
    case 'heart': p.maxHealth += 25; p.health = Math.min(p.maxHealth, p.health + 25); break
    case 'armor': p.maxPoise = poiseMax(); p.poise = p.maxPoise; break
    case 'nova': if (abilities.nova === 1) p.novaCooldown = 0.6; break
    case 'mend': p.health = Math.min(p.maxHealth, p.health + 40); break
    case 'lifeforge': p.maxHealth += 10; p.health = Math.min(p.maxHealth, p.health + 10); break
    case 'aegis': p.invuln = Math.max(p.invuln ?? 0, 0.25); break
  }
}
