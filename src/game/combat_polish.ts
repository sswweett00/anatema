import * as THREE from 'three'
import { abilities } from './abilities'
import { bullets, enemies, gameState, getPlayer, type Entity } from '../ecs/world'
import { runtimeQuality } from './performance'
import { spawnBurst } from '../ecs/world'

const tmp = new THREE.Vector3()
const target = new THREE.Vector3()
let running = false
let frame = 0
let last = 0
let separationTimer = 0

const nearestEnemy = (origin: THREE.Vector3, range: number): Entity | undefined => {
  let best: Entity | undefined
  let bestD2 = range * range
  for (const e of enemies.entities) {
    if (e.dead) continue
    const d2 = e.position.distanceToSquared(origin)
    if (d2 < bestD2) {
      bestD2 = d2
      best = e
    }
  }
  return best
}

function steerProjectiles(dt: number) {
  const player = getPlayer()
  if (!player || abilities.arrows <= 0) return

  const strength = Math.min(0.85, 0.12 + abilities.arrows * 0.055)
  const acquireRange = 8 + Math.min(12, abilities.arrows * 0.65)
  const bulletsList = bullets.entities

  for (let i = 0; i < bulletsList.length; i++) {
    const bullet = bulletsList[i]
    if ((bullet.life ?? 0) <= 0) continue
    const enemy = nearestEnemy(bullet.position, acquireRange)
    if (!enemy) continue

    target.copy(enemy.position).sub(bullet.position)
    target.y = 0
    const len = target.length()
    if (len < 0.05) continue
    target.multiplyScalar(1 / len)

    const speed = Math.max(1, bullet.velocity.length())
    tmp.copy(bullet.velocity).setY(0)
    const currentLen = tmp.length()
    if (currentLen < 0.05) tmp.set(target.x, 0, target.z)
    else tmp.multiplyScalar(1 / currentLen)

    tmp.lerp(target, 1 - Math.exp(-strength * dt * 60)).normalize()
    bullet.velocity.x = tmp.x * speed
    bullet.velocity.z = tmp.z * speed
  }
}

function separateSwarm(dt: number) {
  const quality = runtimeQuality.enemyScale
  const list = enemies.entities
  if (list.length < 2) return

  const radius = 0.72 + (1 - quality) * 0.15
  const radius2 = radius * radius
  const maxNeighbors = list.length > 800 ? 3 : 5
  const repel = list.length > 800 ? 0.42 : 0.58

  // Spatial hashing burada kasıtlı olarak küçük sabit hücre sayısıyla tutuluyor:
  // 1400 entity'de tam O(n²) yerine ortalama küçük komşuluk kümeleri oluşur.
  const cellSize = 2.4
  const buckets = new Map<string, number[]>()
  const cell = (v: number) => Math.floor(v / cellSize)
  const key = (x: number, z: number) => `${cell(x)}:${cell(z)}`

  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (e.dead) continue
    const k = key(e.position.x, e.position.z)
    const bucket = buckets.get(k)
    if (bucket) bucket.push(i)
    else buckets.set(k, [i])
  }

  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (e.dead) continue
    const cx = cell(e.position.x)
    const cz = cell(e.position.z)
    let neighbors = 0

    for (let ox = -1; ox <= 1 && neighbors < maxNeighbors; ox++) {
      for (let oz = -1; oz <= 1 && neighbors < maxNeighbors; oz++) {
        const bucket = buckets.get(`${cx + ox}:${cz + oz}`)
        if (!bucket) continue
        for (let b = 0; b < bucket.length && neighbors < maxNeighbors; b++) {
          const j = bucket[b]
          if (j === i) continue
          const other = list[j]
          if (other.dead) continue
          const dx = e.position.x - other.position.x
          const dz = e.position.z - other.position.z
          const d2 = dx * dx + dz * dz
          if (d2 <= 0 || d2 > radius2) continue
          const d = Math.sqrt(d2)
          const push = (1 - d / radius) * repel
          e.velocity.x += (dx / d) * push * dt * 12
          e.velocity.z += (dz / d) * push * dt * 12
          neighbors++
        }
      }
    }
  }
}

function comboFeedback() {
  const combo = gameState.combo
  if (combo < 10) return
  const tier = combo >= 100 ? 5 : combo >= 60 ? 4 : combo >= 30 ? 3 : combo >= 20 ? 2 : 1
  const label = ['','RİTİM','FIRTINA','SAVAŞ MAKİNESİ','YIKIM','APOKALİPS'][tier]
  const colors = [0, 0xffb15c, 0x8fd8ff, 0xcaa7ff, 0xff7f4f, 0xffe2a2]
  // HUD announcement yalnızca tier değişiminde tetikleniyor; spam yok.
  if ((combo % (tier === 5 ? 20 : 10)) === 0 && gameState.time - lastTierNotice > 0.8) {
    lastTierNotice = gameState.time
    gameState.announceText = label
    gameState.announceUntil = gameState.time + 0.65
    const p = getPlayer()
    if (p) spawnBurst(p.position, colors[tier], 4 + tier * 2, 2.8 + tier * 0.5, 0.22)
  }
}

let lastTierNotice = -10

function tick(dt: number) {
  if (gameState.phase !== 'playing') return
  separationTimer -= dt
  steerProjectiles(dt)
  if (separationTimer <= 0) {
    separationTimer = enemies.entities.length > 900 ? 0.055 : 0.04
    separateSwarm(dt)
  }
  comboFeedback()
}

export function startCombatPolish() {
  if (running || typeof window === 'undefined') return () => undefined
  running = true
  last = performance.now()
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
    last = now
    tick(dt)
    frame = window.requestAnimationFrame(loop)
  }
  frame = window.requestAnimationFrame(loop)
  return stopCombatPolish
}

export function stopCombatPolish() {
  running = false
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
  separationTimer = 0
  lastTierNotice = -10
}

export function resetCombatPolish() {
  separationTimer = 0
  lastTierNotice = -10
}
