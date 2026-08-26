import * as THREE from 'three'
import { enemies, gameState, getPlayer, spawnEnemy, spawnBurst, type Entity } from '../ecs/world'
import { events } from './events'
import { SpatialHash } from './spatial'

type BossState = {
  phase: 1 | 2 | 3
  timer: number
  attackCooldown: number
  summonCooldown: number
  telegraph: number
  enraged: boolean
  anchor: THREE.Vector3
}

const states = new WeakMap<Entity, BossState>()
const spatial = new SpatialHash(4)

function isBoss(entity: Entity): boolean {
  return entity.isEnemy === true && ((entity as Entity & { boss?: boolean }).boss === true || (entity.scale ?? 0) >= 2.2)
}

function stateFor(entity: Entity): BossState {
  let state = states.get(entity)
  if (!state) {
    state = {
      phase: 1,
      timer: 0,
      attackCooldown: 1.4,
      summonCooldown: 6,
      telegraph: 0,
      enraged: false,
      anchor: entity.position.clone(),
    }
    states.set(entity, state)
  }
  return state
}

function shockwave(boss: Entity, radius: number, damage: number): void {
  const player = getPlayer()
  if (!player) return
  const dx = player.position.x - boss.position.x
  const dz = player.position.z - boss.position.z
  const distance = Math.hypot(dx, dz)
  if (distance <= radius) {
    const falloff = 1 - Math.min(0.75, distance / radius * 0.75)
    player.health = Math.max(0, player.health - damage * falloff)
    player.velocity.x += (dx / Math.max(0.1, distance)) * 4
    player.velocity.z += (dz / Math.max(0.1, distance)) * 4
  }
  gameState.shake = Math.min(1, gameState.shake + 0.24)
  spawnBurst(boss.position, 0xff6a3d, 18, 5.5, 0.75)
}

function summonRing(boss: Entity, count: number): void {
  const countSafe = Math.min(8, Math.max(2, count))
  for (let i = 0; i < countSafe; i++) {
    const angle = i / countSafe * Math.PI * 2
    const point = new THREE.Vector3(
      boss.position.x + Math.cos(angle) * 5.2,
      0,
      boss.position.z + Math.sin(angle) * 5.2,
    )
    spawnEnemy(point)
  }
}

function tickBoss(boss: Entity, dt: number): void {
  const state = stateFor(boss)
  const ratio = boss.maxHealth > 0 ? boss.health / boss.maxHealth : 0
  state.timer += dt
  state.attackCooldown -= dt
  state.summonCooldown -= dt
  state.telegraph = Math.max(0, state.telegraph - dt)

  const previousPhase = state.phase
  state.phase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1
  if (state.phase !== previousPhase) {
    events.emit('boss:phase', { bossId: String(boss.enemyKind ?? 'boss'), phase: state.phase })
    gameState.announceText = state.phase === 3 ? 'BOSS — ÖFKE AŞAMASI' : 'BOSS — YENİ FAZ'
    gameState.announceUntil = gameState.time + 1.5
    spawnBurst(boss.position, state.phase === 3 ? 0xff3e3e : 0xffb15c, 20, 4.5, 0.7)
    state.attackCooldown = 0.5
  }

  if (!state.enraged && state.phase === 3) {
    state.enraged = true
    boss.speed = Math.min(10, boss.speed * 1.25)
    boss.damage = Math.max(1, (boss.damage ?? 1) * 1.35)
    events.emit('run:mutator', { mutator: 'boss-enrage', level: 3, active: true })
  }

  if (state.attackCooldown <= 0) {
    state.attackCooldown = state.phase === 1 ? 2.2 : state.phase === 2 ? 1.45 : 0.95
    state.telegraph = 0.48
    shockwave(boss, state.phase === 3 ? 8.5 : 6.5, state.phase === 3 ? 22 : 14)
  }

  if (state.summonCooldown <= 0) {
    state.summonCooldown = state.phase === 1 ? 10 : state.phase === 2 ? 7 : 5
    spatial.build(enemies.entities)
    summonRing(boss, state.phase + 2)
  }

  if (state.telegraph > 0) boss.hitFlash = Math.max(boss.hitFlash ?? 0, 0.15)
}

let running = false
let frame = 0
let last = 0

function tick(dt: number): void {
  if (gameState.phase !== 'playing') return
  const list = enemies.entities
  for (let i = 0; i < list.length; i++) {
    if (isBoss(list[i]) && !list[i].dead) tickBoss(list[i], dt)
  }
}

export function startBossAI() {
  if (running || typeof window === 'undefined') return stopBossAI
  running = true
  last = performance.now()
  const loop = (now: number) => {
    if (!running) return
    const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000))
    last = now
    tick(dt)
    frame = window.requestAnimationFrame(loop)
  }
  frame = window.requestAnimationFrame(loop)
  return stopBossAI
}

export function stopBossAI() {
  running = false
  if (frame) window.cancelAnimationFrame(frame)
  frame = 0
  last = 0
  spatial.clear()
}

export function resetBossAI() {
  for (const boss of enemies.entities) states.delete(boss)
  spatial.clear()
}
