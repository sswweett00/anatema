import * as THREE from 'three'
import { enemies, gameState, getPlayer, lootEntities, world, type Entity } from '../ecs/world'
import { events } from './events'
import { random } from './progression'

type LootKind = 'xp' | 'heal' | 'relic' | 'shrine' | 'chest'
type Loot = Entity

export const MAX_LOOT = 96
const tmp = new THREE.Vector3()
let running = false
let frame = 0
let last = 0

function spawn(kind: LootKind, position: THREE.Vector3, value: number, rarity = 'common') {
  if (lootEntities.entities.length >= MAX_LOOT) return

  const entity: Loot = {
    position: position.clone().setY(0.18),
    velocity: new THREE.Vector3((random() - 0.5) * 1.6, 2.5 + random() * 1.5, (random() - 0.5) * 1.6),
    health: 1,
    maxHealth: 1,
    armor: 0,
    poise: 0,
    maxPoise: 1,
    speed: 0,
    radius: kind === 'relic' || kind === 'chest' ? 0.42 : 0.22,
    isLoot: true,
    age: 0,
    life: 120,
    maxLife: 120,
    colorHex: kind === 'heal' ? 0x9affb4 : kind === 'relic' ? 0xd7a2ff : kind === 'shrine' ? 0xffd36a : kind === 'chest' ? 0xb58a62 : 0xffc56e,
    lootKind: kind,
    rarity,
    value,
  }
  world.add(entity)
  events.emit('loot:drop', { kind, rarity, x: position.x, z: position.z })
}

function dropFromEnemy(enemy: Entity) {
  const roll = random()
  if (roll < 0.035) spawn('relic', enemy.position, 1, roll < 0.01 ? 'legendary' : 'rare')
  else if (roll < 0.07) spawn('heal', enemy.position, 12 + gameState.level * 2)
  else spawn('xp', enemy.position, 1 + Math.max(1, Math.floor(gameState.wave / 3)))
}

function sweepDeadEnemies() {
  for (const enemy of enemies.entities) {
    if (!enemy.dead || enemy.lastDmg === undefined || enemy.lootDropped) continue
    enemy.lootDropped = true
    dropFromEnemy(enemy)
  }
}

function collect(item: Loot, player: Entity) {
  const kind = item.lootKind ?? 'xp'
  const value = Math.max(1, item.value ?? 1)

  if (kind === 'xp') {
    gameState.xp = Math.min(1_000_000, gameState.xp + value)
  } else if (kind === 'heal') {
    const before = player.health
    player.health = Math.min(player.maxHealth, player.health + value)
    if (player.health > before) events.emit('player:heal', { amount: player.health - before })
  } else if (kind === 'relic') {
    events.emit('relic:acquire', { relicId: `drop:${item.rarity ?? 'common'}` })
  } else if (kind === 'shrine') {
    events.emit('shrine:activate', { shrineId: `shrine-${Math.floor(item.position.x)}-${Math.floor(item.position.z)}`, reward: item.rarity ?? 'blessing' })
  } else if (kind === 'chest') {
    events.emit('loot:pickup', { kind: 'chest', rarity: item.rarity ?? 'rare' })
  }

  events.emit('loot:pickup', { kind, rarity: item.rarity ?? 'common' })
  world.remove(item)
}

function tick(dt: number) {
  const player = getPlayer()
  sweepDeadEnemies()

  const list = lootEntities.entities
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    item.age = (item.age ?? 0) + dt
    item.life = (item.life ?? 0) - dt

    if (item.life <= 0) {
      world.remove(item)
      continue
    }

    item.velocity.y -= 8 * dt
    item.velocity.multiplyScalar(Math.max(0, 1 - 3.5 * dt))
    item.position.addScaledVector(item.velocity, dt)

    if (item.position.y < 0.18) {
      item.position.y = 0.18
      item.velocity.y = Math.abs(item.velocity.y) * 0.28
    }

    if (!player) continue
    tmp.copy(player.position).sub(item.position)
    tmp.y = 0
    const dist = tmp.length()
    const radius = (item.lootKind === 'relic' ? 1.25 : 0.85) + Math.min(2.4, gameState.level * 0.04)

    if (dist < radius) {
      if (dist > 0.001) item.velocity.lerp(tmp.normalize().multiplyScalar(8), Math.min(1, dt * 8))
      if (dist < 0.55) collect(item, player)
    }
  }
}

export function startLootRuntime() {
  if (running || typeof window === 'undefined') return stopLootRuntime
  running = true
  last = performance.now()
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
    last = now
    if (gameState.phase === 'playing') tick(dt)
    frame = window.requestAnimationFrame(loop)
  }
  frame = window.requestAnimationFrame(loop)
  return stopLootRuntime
}

export function stopLootRuntime() {
  running = false
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
}

export function resetLootRuntime() {
  for (const item of [...lootEntities.entities]) world.remove(item)
}

export function spawnShrine(position: THREE.Vector3) { spawn('shrine', position, 1, 'blessing') }
export function spawnChest(position: THREE.Vector3, rarity = 'rare') { spawn('chest', position, 1, rarity) }
