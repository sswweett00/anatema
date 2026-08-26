import * as THREE from 'three'

/*
 * PROSEDÜREL IŞIK DOKULARI — compositor (Bloom) gerektirmeden
 * "yüksek kaliteli ışıltı" hissi veren yumuşak radyal/ark dokuları.
 * Hepsi CanvasTexture; her WebGL bağlamında garantili çalışır.
 */

function canvas2d(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return [c, c.getContext('2d')!]
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* yumuşak ışık noktası (parçacık / kor / dekal) */
export function softDotTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas2d(128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.62)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.16)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return toTexture(c)
}

/* yumuşak kenarlı halka (şok dalgaları, ayaz, nova) */
export function softRingTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas2d(256)
  const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.62, 'rgba(255,255,255,0.08)')
  g.addColorStop(0.8, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.92, 'rgba(255,255,255,0.3)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return toTexture(c)
}

/* alev / köz zemini (meşale havuzu, alev izi) */
export function firePoolTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas2d(256)
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,240,200,0.95)')
  g.addColorStop(0.25, 'rgba(255,170,80,0.7)')
  g.addColorStop(0.55, 'rgba(230,100,40,0.32)')
  g.addColorStop(0.85, 'rgba(140,50,20,0.08)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return toTexture(c)
}

/* kavisli savuruş bandı: açısal sönümlü, yumuşak kenarlı ark */
export function arcTexture(): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas2d(size)
  const cx = size / 2
  const cy = size / 2
  const r0 = size * 0.26
  const r1 = size * 0.47
  const steps = 64
  const span = Math.PI * 1.15 /* bandın açısal genişliği */
  const start = -span / 2

  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1)
    const a = start + f * span
    /* uçlara doğru sön, ortada parlak */
    const along = Math.pow(Math.sin(f * Math.PI), 0.8)
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1)
    g.addColorStop(0, `rgba(255,255,255,0)`)
    g.addColorStop(0.35, `rgba(255,255,255,${0.55 * along})`)
    g.addColorStop(0.62, `rgba(255,255,255,${0.95 * along})`)
    g.addColorStop(1, `rgba(255,255,255,0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r1 + 6, a, a + span / steps + 0.02)
    ctx.closePath()
    ctx.fill()
  }
  return toTexture(c)
}

/* yıldırım çekirdeği: dikey parlak şerit */
export function boltTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas2d(128)
  const g = ctx.createLinearGradient(0, 0, 128, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.42, 'rgba(220,240,255,0.55)')
  g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(0.58, 'rgba(220,240,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  /* çentikli yıldırım çizgisi */
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(64, 0)
  ctx.lineTo(56, 34)
  ctx.lineTo(72, 52)
  ctx.lineTo(58, 84)
  ctx.lineTo(68, 128)
  ctx.stroke()
  return toTexture(c)
}
