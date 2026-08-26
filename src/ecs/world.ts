import { World } from 'miniplex'
import * as THREE from 'three'

/* ------------------------------------------------------------------ */
/*  ANATHEMA — ECS çekirdeği. Tüm oyun durumu burada MUTATIF yaşar;    */
/*  React tarafında oyun verisi için tek bir re-render bile olmaz.     */
/* ------------------------------------------------------------------ */

export type Phase = 'menu' | 'playing' | 'paused' | 'dead'

export type Entity = {
  position: THREE.Vector3
  velocity: THREE.Vector3
  health: number
  maxHealth: number
  armor: number
  poise: number
  maxPoise: number
  speed: number
  radius: number
  /* arketip bayrakları */
  isPlayer?: boolean
  isEnemy?: boolean
  isBullet?: boolean
  isParticle?: boolean
  /* düşman */
  enemyKind?: number
  scale?: number
  phase?: number
  hitFlash?: number
  attackCooldown?: number
  damage?: number
  dead?: boolean
  age?: number
  /* mermi */
  life?: number
  maxLife?: number
  pierce?: number
  spin?: number
  colorHex?: number
  /* oyuncu */
  stagger?: number
  regenDelay?: number
  /* oyuncu yetenekleri */
  dashTime?: number
  dashCooldown?: number
  dashX?: number
  dashZ?: number
  novaCooldown?: number
  invuln?: number
  facingX?: number
  facingZ?: number
}

export const world = new World<Entity>()

export const players = world.with('isPlayer')
export const enemies = world.with('isEnemy')
export const bullets = world.with('isBullet')
export const particles = world.with('isParticle')

/* ---------------- global, mutatif oyun durumu (UI bunu RAF ile okur) */

export const gameState = {
  phase: 'menu' as Phase,
  time: 0,
  kills: 0,
  tier: 1,
  shake: 0,
  damageFlash: 0,
  tierFlash: 0,
  wave: 0,
  waveTimer: 18,
  flashNova: 0,
  announceText: '',
  announceUntil: 0,
}

export function announce(text: string, dur = 2.6) {
  gameState.announceText = text
  gameState.announceUntil = gameState.time + dur
}

const phaseListeners = new Set<(p: Phase) => void>()

export function onPhase(fn: (p: Phase) => void): () => void {
  phaseListeners.add(fn)
  return () => {
    phaseListeners.delete(fn)
  }
}

export function setPhase(p: Phase) {
  gameState.phase = p
  phaseListeners.forEach((fn) => fn(p))
}

export const getPlayer = (): Entity | undefined => players.entities[0]

export const MAX_ENEMIES = 1400

/* ---------------- düşman türleri ---------------- */

/* 0: Goblin — hızlı, cılız | 1: İskelet — dengeli | 2: Balçık — yavaş, kalın */
export const ENEMY_KINDS = [
  { name: 'Goblin', hp: 12, speed: 3.5, scale: 0.8, dmg: 5, color: 0x7fae4a, radius: 0.34 },
  { name: 'İskelet', hp: 26, speed: 2.6, scale: 1.0, dmg: 8, color: 0xd9cfb4, radius: 0.42 },
  { name: 'Balçık', hp: 80, speed: 1.55, scale: 1.15, dmg: 13, color: 0x3fbf82, radius: 0.52 },
] as const

export function spawnEnemy(around: THREE.Vector3) {
  const t = gameState.time
  /* dalga ilerledikçe ağır canavarlar sürüye katılır */
  const w = gameState.wave
  const wGob = 5
  const wSkel = w >= 2 ? 3 + w * 0.25 : 0
  const wSlime = w >= 4 ? 2 + w * 0.3 : 0
  let roll = Math.random() * (wGob + wSkel + wSlime)
  const kind = roll < wGob ? 0 : roll < wGob + wSkel ? 1 : 2
  const k = ENEMY_KINDS[kind]
  const hpMul = 1 + (t / 120) * 0.35
  const dmgMul = 1 + (t / 240) * 0.5
  const ang = Math.random() * Math.PI * 2
  const dist = 14 + Math.random() * 18
  const e: Entity = {
    position: new THREE.Vector3(
      around.x + Math.cos(ang) * dist,
      0,
      around.z + Math.sin(ang) * dist
    ),
    velocity: new THREE.Vector3(),
    health: k.hp * hpMul,
    maxHealth: k.hp * hpMul,
    armor: kind === 2 ? 4 : kind === 1 ? 1 : 0,
    poise: 0,
    maxPoise: 1,
    speed: k.speed * (0.85 + Math.random() * 0.3),
    radius: k.radius,
    isEnemy: true,
    enemyKind: kind,
    scale: k.scale * (0.9 + Math.random() * 0.25),
    phase: Math.random() * Math.PI * 2,
    hitFlash: 0,
    attackCooldown: Math.random() * 0.4,
    damage: k.dmg * dmgMul,
    dead: false,
    age: 0,
  }
  world.add(e)
}

/* ---------------- oyuncu ---------------- */

export function spawnPlayer(): Entity {
  const existing = players.entities[0]
  if (existing) return existing
  const p: Entity = {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    health: 100,
    maxHealth: 100,
    armor: 3,
    poise: 100,
    maxPoise: 100,
    speed: 5.4,
    radius: 0.5,
    isPlayer: true,
    stagger: 0,
    regenDelay: 0,
    dashTime: 0,
    dashCooldown: 0,
    dashX: 0,
    dashZ: 1,
    novaCooldown: 8,
    invuln: 0,
    facingX: 0,
    facingZ: 1,
  }
  world.add(p)
  return p
}

/* ---------------- mermiler ---------------- */

const BULLET_SPEED = 26

export function spawnBullet(
  origin: THREE.Vector3,
  dx: number,
  dz: number,
  damage: number,
  pierce: number
) {
  const b: Entity = {
    position: new THREE.Vector3(origin.x, 0.7, origin.z),
    velocity: new THREE.Vector3(dx * BULLET_SPEED, 0, dz * BULLET_SPEED),
    health: 1,
    maxHealth: 1,
    armor: 0,
    poise: 0,
    maxPoise: 1,
    speed: BULLET_SPEED,
    radius: 0.22,
    isBullet: true,
    damage,
    pierce,
    life: 1.4,
    maxLife: 1.4,
    spin: Math.random() * Math.PI * 2,
  }
  world.add(b)
}

/* ---------------- parçacıklar (kor / kıvılcım) ---------------- */

const _pv = new THREE.Vector3()

export function spawnBurst(
  pos: THREE.Vector3,
  colorHex: number,
  count: number,
  power = 4,
  life = 0.6
) {
  if (particles.entities.length > 460) return
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const up = 1.5 + Math.random() * 3.5
    _pv.set(Math.cos(a) * (0.4 + Math.random()), up, Math.sin(a) * (0.4 + Math.random()))
    const l = life * (0.6 + Math.random() * 0.8)
    const p: Entity = {
      position: new THREE.Vector3(
        pos.x + (Math.random() - 0.5) * 0.3,
        pos.y + 0.35 + Math.random() * 0.35,
        pos.z + (Math.random() - 0.5) * 0.3
      ),
      velocity: _pv.clone().multiplyScalar(power * 0.35),
      health: 1,
      maxHealth: 1,
      armor: 0,
      poise: 0,
      maxPoise: 1,
      speed: 0,
      radius: 0.05 + Math.random() * 0.09,
      isParticle: true,
      life: l,
      maxLife: l,
      colorHex,
      spin: Math.random() * Math.PI * 2,
    }
    world.add(p)
  }
}

/* ---------------- koşu sıfırlama ---------------- */

export function resetRun() {
  for (const e of [...enemies.entities]) world.remove(e)
  for (const e of [...bullets.entities]) world.remove(e)
  for (const e of [...particles.entities]) world.remove(e)
  const p = spawnPlayer()
  p.position.set(0, 0, 0)
  p.velocity.set(0, 0, 0)
  p.health = p.maxHealth = 100
  p.poise = p.maxPoise = 100
  p.armor = 3
  p.stagger = 0
  p.regenDelay = 0
  p.dead = false
  p.dashTime = 0
  p.dashCooldown = 0
  p.dashX = 0
  p.dashZ = 1
  p.novaCooldown = 8
  p.invuln = 0
  p.facingX = 0
  p.facingZ = 1
  gameState.time = 0
  gameState.kills = 0
  gameState.tier = 1
  gameState.shake = 0
  gameState.damageFlash = 0
  gameState.tierFlash = 0
  gameState.wave = 0
  gameState.waveTimer = 18
  gameState.flashNova = 0
  gameState.announceText = 'OYUN BAŞLADI — SÜRÜ GELİYOR'
  gameState.announceUntil = 2.6
}

/* menü sahnesinde şövalye hemen görünsün */
spawnPlayer()
