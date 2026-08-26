/*
 * UÇAN HASAR SAYILARI — halka tampon.
 * Oyun döngüsü buraya yazar; HUD'daki DamageNumbers RAF ile okur
 * ve kameradan ekran uzayına izdüşürür. Re-render yok.
 */

export const DMG_SLOTS = 48

export interface DmgEvent {
  x: number
  y: number
  z: number
  val: number
  crit: boolean
  soul: boolean /* kesim XP yazısı */
  t: number /* doğum zamanı (sn) */
}

export const dmgEvents: DmgEvent[] = Array.from({ length: DMG_SLOTS }, () => ({
  x: 0,
  y: 0,
  z: 0,
  val: 0,
  crit: false,
  soul: false,
  t: -100,
}))

let cursor = 0

export function pushDamage(x: number, y: number, z: number, val: number, crit = false) {
  const e = dmgEvents[cursor]
  cursor = (cursor + 1) % DMG_SLOTS
  e.x = x
  e.y = y + 1.15
  e.z = z
  e.val = Math.round(val)
  e.crit = crit
  e.soul = false
  e.t = performance.now() / 1000
}

/* kesimde çıkan küçük ruh/XP yazısı */
export function pushSoul(x: number, y: number, z: number, val: number) {
  const e = dmgEvents[cursor]
  cursor = (cursor + 1) % DMG_SLOTS
  e.x = x + (Math.random() - 0.5) * 0.6
  e.y = y + 0.7
  e.z = z + (Math.random() - 0.5) * 0.6
  e.val = Math.round(val)
  e.crit = false
  e.soul = true
  e.t = performance.now() / 1000
}
