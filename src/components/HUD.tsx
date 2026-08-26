import { useEffect, useRef, useState } from 'react'
import {
  Skull,
  Ghost,
  Flame,
  Shield,
  Volume2,
  VolumeX,
  HeartPulse,
  Zap,
  Swords,
  Crosshair,
  Orbit,
  Wind,
  Heart,
  CloudLightning,
  Snowflake,
  Tornado,
  Eye,
  Magnet,
  Angry,
  Axe,
  Footprints,
  Bug,
  Droplet,
  Mountain,
  Moon,
  ShieldAlert,
  LifeBuoy,
  Target,
  Gauge,
  Activity,
  Castle,
  Gem,
  Wheat,
  BookOpen,
  Crown,
} from 'lucide-react'
import { clsx } from 'clsx'
import { enemies, getPlayer, gameState } from '../ecs/world'
import { abilities, ABILITIES, displayName, swordDamage, type AbilityId } from '../game/abilities'
import { isMuted, setMuted } from '../game/audio'

/*
 * HUD — tamamen transient. requestAnimationFrame döngüsü ECS dünyasını
 * ve yetenek durumunu ref'ler üzerinden günceller; oyun verisi için React
 * re-render zinciri oluşturmaz.
 */

function fmtTime(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const ABILITY_ICONS: Record<AbilityId, typeof Flame> = {
  steel: Swords,
  arrows: Crosshair,
  nova: Flame,
  orbit: Orbit,
  chain: Zap,
  storm: CloudLightning,
  frost: Snowflake,
  vortex: Tornado,
  spikes: Axe,
  pyre: Footprints,
  phantom: Ghost,
  venom: Bug,
  heart: HeartPulse,
  swift: Wind,
  armor: Shield,
  crit: Eye,
  magnet: Magnet,
  rage: Angry,
  vamp: Droplet,
  stone: Mountain,
  ghoststep: Moon,
  ferocity: Skull,
  thorns: ShieldAlert,
  laststand: LifeBuoy,
  focus: Target,
  momentum: Gauge,
  adrenaline: Activity,
  bulwark: Castle,
  greed: Gem,
  harvest: Wheat,
  scholar: BookOpen,
  warlord: Crown,
  mend: Heart,
}
