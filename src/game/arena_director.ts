import { events } from './events'
import { gameState } from '../ecs/world'

export type BiomeId = 'ash' | 'frost' | 'tempest' | 'plague' | 'void' | 'blood'

export interface BiomeState {
  id: BiomeId
  name: string
  hazard: string
  speedMultiplier: number
  damageMultiplier: number
  eliteBias: number
  fog: number
}

const BIOMES: readonly BiomeState[] = [
  { id: 'ash', name: 'Kül Ovası', hazard: 'ember', speedMultiplier: 1, damageMultiplier: 1, eliteBias: 1, fog: 0.45 },
  { id: 'frost', name: 'Donmuş Yarık', hazard: 'frost', speedMultiplier: 0.92, damageMultiplier: 1.08, eliteBias: 1.1, fog: 0.6 },
  { id: 'tempest', name: 'Fırtına Tahtı', hazard: 'lightning', speedMultiplier: 1.06, damageMultiplier: 1.14, eliteBias: 1.18, fog: 0.52 },
  { id: 'plague', name: 'Veba Bahçesi', hazard: 'poison', speedMultiplier: 0.96, damageMultiplier: 1.22, eliteBias: 1.24, fog: 0.66 },
  { id: 'void', name: 'Hiçlik Çukuru', hazard: 'collapse', speedMultiplier: 1.14, damageMultiplier: 1.28, eliteBias: 1.35, fog: 0.78 },
  { id: 'blood', name: 'Kızıl Mahzen', hazard: 'bloodmoon', speedMultiplier: 1.12, damageMultiplier: 1.36, eliteBias: 1.48, fog: 0.58 },
]

let current = BIOMES[0]
let rotation = 0
let timer = 0
let running = false
let frame = 0
let last = 0

export function getBiome(): BiomeState { return current }

function chooseBiome() {
  const index = Math.min(BIOMES.length - 1, Math.floor(gameState.wave / 4))
  const next = BIOMES[(index + rotation) % BIOMES.length]
  if (next.id === current.id) return
  current = next
  events.emit('arena:biome', { biome: current.id, hazard: current.hazard, wave: gameState.wave })
}

function tick(dt: number) {
  timer += dt
  if (timer >= 28) {
    timer = 0
    rotation = (rotation + 1) % BIOMES.length
    chooseBiome()
  }
}

export function startArenaDirector() {
  if (running || typeof window === 'undefined') return stopArenaDirector
  running = true
  last = performance.now()
  current = BIOMES[0]
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
    last = now
    if (gameState.phase === 'playing') tick(dt)
    frame = window.requestAnimationFrame(loop)
  }
  frame = window.requestAnimationFrame(loop)
  return stopArenaDirector
}

export function stopArenaDirector() {
  running = false
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
}

export function resetArenaDirector() {
  timer = 0
  rotation = 0
  current = BIOMES[0]
}
