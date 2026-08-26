import { events } from './events'
import { gameState, getPlayer, spawnBurst } from '../ecs/world'
import { nextRandom } from './rng'

type Biome = {
  id: string
  name: string
  hazard: 'embers' | 'frost' | 'void' | 'blood' | 'storm'
  enemyBias: number
  damageMultiplier: number
  speedMultiplier: number
  color: number
}

const BIOMES: readonly Biome[] = [
  { id: 'ash_wastes', name: 'Kül Çölü', hazard: 'embers', enemyBias: 0, damageMultiplier: 1, speedMultiplier: 1, color: 0xff8a3d },
  { id: 'frozen_crypt', name: 'Donmuş Mahzen', hazard: 'frost', enemyBias: 0.15, damageMultiplier: 1.05, speedMultiplier: 0.94, color: 0x9ed8ff },
  { id: 'void_cathedral', name: 'Hiçlik Katedrali', hazard: 'void', enemyBias: 0.22, damageMultiplier: 1.16, speedMultiplier: 1.03, color: 0x9b73ff },
  { id: 'blood_mire', name: 'Kan Bataklığı', hazard: 'blood', enemyBias: 0.3, damageMultiplier: 1.22, speedMultiplier: 1.1, color: 0xff496b },
  { id: 'storm_ruins', name: 'Fırtına Harabeleri', hazard: 'storm', enemyBias: 0.38, damageMultiplier: 1.3, speedMultiplier: 1.16, color: 0x7ec8ff },
] as const

let activeIndex = 0
let lastAnnounced = -1
let hazardTimer = 0

function biomeIndexForWave(wave: number): number {
  return Math.min(BIOMES.length - 1, Math.floor(Math.max(0, wave - 1) / 4))
}

export function currentBiome(): Biome {
  return BIOMES[activeIndex]
}

function activate(index: number): void {
  const normalized = Math.max(0, Math.min(BIOMES.length - 1, index))
  if (normalized === activeIndex && lastAnnounced === gameState.wave) return
  activeIndex = normalized
  lastAnnounced = gameState.wave
  const biome = BIOMES[activeIndex]
  events.emit('arena:biome', { biome: biome.id, hazard: biome.hazard, wave: gameState.wave })
  const p = getPlayer()
  if (p) spawnBurst(p.position, biome.color, 18, 4.5, 0.7)
}

function tickHazard(dt: number): void {
  if (gameState.phase !== 'playing') return
  hazardTimer -= dt
  if (hazardTimer > 0) return
  const biome = currentBiome()
  hazardTimer = 2.2 + nextRandom() * 2.8
  const p = getPlayer()
  if (!p) return

  switch (biome.hazard) {
    case 'embers':
      if (nextRandom() < 0.65) p.regenDelay = Math.max(p.regenDelay ?? 0, 0.4)
      break
    case 'frost':
      if ((p.invuln ?? 0) <= 0) p.velocity.multiplyScalar(0.92)
      break
    case 'void':
      p.invuln = Math.max(p.invuln ?? 0, 0.12)
      break
    case 'blood':
      p.health = Math.min(p.maxHealth, p.health + Math.max(0.25, p.maxHealth * 0.004))
      break
    case 'storm':
      p.velocity.x += (nextRandom() - 0.5) * 0.55
      p.velocity.z += (nextRandom() - 0.5) * 0.55
      break
  }
}

export function startBiomeRuntime(): () => void {
  return () => undefined
}

export function tickBiomeRuntime(dt: number): void {
  activate(biomeIndexForWave(gameState.wave))
  tickHazard(dt)
}

export function resetBiomeRuntime(): void {
  activeIndex = 0
  lastAnnounced = -1
  hazardTimer = 0
}
