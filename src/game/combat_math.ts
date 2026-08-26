import type { DamageElement } from './events'

export interface DamageContext {
  base: number
  element: DamageElement
  armor: number
  critical: boolean
  critMultiplier: number
  armorPenetration: number
  flatBonus: number
  multiplier: number
  overdrive: number
}

export interface DamageResult {
  raw: number
  mitigated: number
  final: number
  absorbed: number
  critical: boolean
}

const ELEMENT_SCALE: Record<DamageElement, number> = {
  physical: 1,
  fire: 1.02,
  ice: 0.98,
  shock: 1,
  poison: 0.96,
  bleed: 1.04,
  void: 1.08,
}

export function resolveDamage(ctx: DamageContext): DamageResult {
  const base = Math.max(0, Number.isFinite(ctx.base) ? ctx.base : 0)
  const flat = Number.isFinite(ctx.flatBonus) ? ctx.flatBonus : 0
  const mult = Math.max(0, Number.isFinite(ctx.multiplier) ? ctx.multiplier : 1)
  const overdrive = Math.max(0, Number.isFinite(ctx.overdrive) ? ctx.overdrive : 0)
  const crit = ctx.critical ? Math.max(1, Number.isFinite(ctx.critMultiplier) ? ctx.critMultiplier : 1.5) : 1
  const armor = Math.max(0, Number.isFinite(ctx.armor) ? ctx.armor : 0)
  const pen = Math.max(0, Math.min(1, Number.isFinite(ctx.armorPenetration) ? ctx.armorPenetration : 0))
  const effectiveArmor = armor * (1 - pen)
  const mitigation = 100 / (100 + effectiveArmor)
  const raw = Math.max(0, (base + flat) * mult * crit * (1 + overdrive) * ELEMENT_SCALE[ctx.element])
  const mitigated = raw * mitigation
  const final = Math.max(1, mitigated)
  return {
    raw,
    mitigated,
    final,
    absorbed: Math.max(0, raw - mitigated),
    critical: ctx.critical,
  }
}

export function executeThreshold(maxHealth: number, combo: number): number {
  const hp = Math.max(1, maxHealth)
  const normalized = Math.max(0, Math.min(1, combo / 120))
  return Math.min(0.3, 0.08 + normalized * 0.22) * hp
}

export function overkillBurst(overkill: number, combo: number): number {
  const amount = Math.max(0, Number.isFinite(overkill) ? overkill : 0)
  const scaling = 0.35 + Math.min(0.85, Math.max(0, combo) / 140)
  return amount * scaling
}
