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

/* büyü rünü dokusu */
export function arcaneRuneTexture(): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas2d(size)
  const cx = size / 2
  const cy = size / 2

  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, 100, 0, Math.PI * 2)
  ctx.stroke()

  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, 80, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3
    const x = cx + Math.cos(a) * 80
    const y = cy + Math.sin(a) * 80
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()

  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80)
    ctx.lineTo(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100)
    ctx.stroke()
  }

  return toTexture(c)
}

/* girdap / vortex spiral dokusu */
export function vortexSpiralTexture(): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas2d(size)
  const cx = size / 2
  const cy = size / 2

  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  for (let arm = 0; arm < 3; arm++) {
    const baseAngle = (arm * Math.PI * 2) / 3
    ctx.beginPath()
    for (let r = 10; r < 110; r += 2) {
      const a = baseAngle + r * 0.08
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      if (r === 10) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  return toTexture(c)
}

/* gerçekçi alevli hilal kılıç savuruş dalgası (kavisli, uçlara incelen, yumuşak kor ışıltılı) */
export function crescentSlashTexture(): THREE.CanvasTexture {
  const size = 512
  const [c, ctx] = canvas2d(size)
  const cx = size / 2
  const cy = size / 2
  const outerR = size * 0.44
  const innerR = size * 0.28
  const span = Math.PI * 0.85
  const startAngle = -Math.PI / 2 - span / 2

  ctx.clearRect(0, 0, size, size)

  // Çok katmanlı yumuşak alev kavis izi
  const steps = 120
  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1)
    const angle = startAngle + f * span
    const alpha = Math.pow(Math.sin(f * Math.PI), 1.2)
    const rMid = innerR + (outerR - innerR) * (0.3 + 0.4 * alpha)
    const thickness = (outerR - innerR) * (0.15 + 0.85 * alpha)

    const grad = ctx.createRadialGradient(cx, cy, rMid - thickness * 0.5, cx, cy, rMid + thickness * 0.5)
    grad.addColorStop(0, 'rgba(255, 120, 30, 0)')
    grad.addColorStop(0.3, `rgba(255, 170, 60, ${0.45 * alpha})`)
    grad.addColorStop(0.55, `rgba(255, 245, 210, ${0.98 * alpha})`)
    grad.addColorStop(0.75, `rgba(255, 130, 35, ${0.5 * alpha})`)
    grad.addColorStop(1, 'rgba(180, 40, 10, 0)')

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, rMid + thickness * 0.5 + 2, angle, angle + (span / steps) * 1.5)
    ctx.arc(cx, cy, Math.max(1, rMid - thickness * 0.5 - 2), angle + (span / steps) * 1.5, angle, true)
    ctx.closePath()
    ctx.fill()
  }

  // Keskin kılıç bıçağı ön kenar çizgisi
  ctx.strokeStyle = 'rgba(255, 255, 240, 0.95)'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i <= 60; i++) {
    const f = i / 60
    const a = startAngle + f * span
    const r = outerR * (0.88 + 0.08 * Math.sin(f * Math.PI))
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  return toTexture(c)
}

/* yüksek kaliteli parlayan plazma / kor küresi dokusu (merkez çekirdek + akkor hale + alev tacı) */
export function plasmaOrbTexture(): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas2d(size)
  const cx = size / 2
  const cy = size / 2

  // Dış sıcak parlama halesi
  const outerG = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx)
  outerG.addColorStop(0, 'rgba(255, 255, 255, 1)')
  outerG.addColorStop(0.18, 'rgba(255, 235, 180, 0.95)')
  outerG.addColorStop(0.38, 'rgba(255, 150, 50, 0.75)')
  outerG.addColorStop(0.65, 'rgba(240, 70, 20, 0.35)')
  outerG.addColorStop(0.88, 'rgba(180, 30, 10, 0.08)')
  outerG.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = outerG
  ctx.fillRect(0, 0, size, size)

  // 8 kollu parıltı ışık hüzmeleri (starflare)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * (cx * 0.8), cy + Math.sin(a) * (cx * 0.8))
    ctx.lineTo(cx - Math.cos(a) * (cx * 0.8), cy - Math.sin(a) * (cx * 0.8))
    ctx.stroke()
  }

  // Ultra parlak beyaz çekirdek
  const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.22)
  coreG.addColorStop(0, 'rgba(255, 255, 255, 1)')
  coreG.addColorStop(0.6, 'rgba(255, 250, 220, 0.9)')
  coreG.addColorStop(1, 'rgba(255, 200, 120, 0)')
  ctx.fillStyle = coreG
  ctx.beginPath()
  ctx.arc(cx, cy, cx * 0.22, 0, Math.PI * 2)
  ctx.fill()

  return toTexture(c)
}

/* kadim büyülü rün çemberi (geometrik mandala, yıldız ve glifler) */
export function magicalRuneCircleTexture(): THREE.CanvasTexture {
  const size = 512
  const [c, ctx] = canvas2d(size)
  const cx = size / 2
  const cy = size / 2

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 3

  // Dış kalın halka
  ctx.beginPath()
  ctx.arc(cx, cy, 230, 0, Math.PI * 2)
  ctx.stroke()

  // Dış ince ikincil halka
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, 215, 0, Math.PI * 2)
  ctx.stroke()

  // Dış çeper rünik dişleri / glif işaretleri
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * 215, cy + Math.sin(a) * 215)
    ctx.lineTo(cx + Math.cos(a) * 230, cy + Math.sin(a) * 230)
    ctx.stroke()
  }

  // İç sekizgen yıldız (oktagram)
  ctx.lineWidth = 2.5
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a1 = (i * Math.PI * 2) / 8
    const a2 = ((i + 3) * Math.PI * 2) / 8
    const x1 = cx + Math.cos(a1) * 190
    const y1 = cy + Math.sin(a1) * 190
    const x2 = cx + Math.cos(a2) * 190
    const y2 = cy + Math.sin(a2) * 190
    if (i === 0) ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.stroke()

  // Orta halka
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, 110, 0, Math.PI * 2)
  ctx.stroke()

  // Merkez iç üçgenler
  for (let rot = 0; rot < 2; rot++) {
    const offset = (rot * Math.PI) / 3
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const a = offset + (i * Math.PI * 2) / 3
      const x = cx + Math.cos(a) * 90
      const y = cy + Math.sin(a) * 90
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
  }

  // Merkez parlayan rün çekirdeği
  const centerG = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50)
  centerG.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
  centerG.addColorStop(0.5, 'rgba(255, 255, 255, 0.25)')
  centerG.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = centerG
  ctx.beginPath()
  ctx.arc(cx, cy, 50, 0, Math.PI * 2)
  ctx.fill()

  return toTexture(c)
}

/* kristal ayaz / buz fraktal yıldızı dokusu */
export function frostCrystalTexture(): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas2d(size)
  const cx = size / 2
  const cy = size / 2

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'

  for (let arm = 0; arm < 6; arm++) {
    const a = (arm * Math.PI) / 3
    const cosA = Math.cos(a)
    const sinA = Math.sin(a)

    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + cosA * 105, cy + sinA * 105)
    ctx.stroke()

    // Yan buz dalları
    for (const dist of [40, 75]) {
      const px = cx + cosA * dist
      const py = cy + sinA * dist
      for (const s of [-1, 1]) {
        const branchA = a + s * (Math.PI / 4)
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px + Math.cos(branchA) * 26, py + Math.sin(branchA) * 26)
        ctx.stroke()
      }
    }
  }

  // Merkez ışıltı
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 45)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
  g.addColorStop(0.5, 'rgba(200, 240, 255, 0.4)')
  g.addColorStop(1, 'rgba(150, 220, 255, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, 45, 0, Math.PI * 2)
  ctx.fill()

  return toTexture(c)
}

/* kadim kan nova / kara büyü mühür dokusu */
export function bloodSigilTexture(): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas2d(size)
  const cx = size / 2
  const cy = size / 2

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 3

  // Dış kırık halka
  ctx.beginPath()
  ctx.arc(cx, cy, 105, 0, Math.PI * 2)
  ctx.stroke()

  // Pentagram & iç kan damarları
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a1 = (i * Math.PI * 2) / 5 - Math.PI / 2
    const a2 = ((i + 2) * Math.PI * 2) / 5 - Math.PI / 2
    const x1 = cx + Math.cos(a1) * 95
    const y1 = cy + Math.sin(a1) * 95
    const x2 = cx + Math.cos(a2) * 95
    const y2 = cy + Math.sin(a2) * 95
    if (i === 0) ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.stroke()

  // Yumuşak merkez sis
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 110)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  g.addColorStop(0.4, 'rgba(255, 200, 200, 0.35)')
  g.addColorStop(1, 'rgba(255, 0, 0, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, 110, 0, Math.PI * 2)
  ctx.fill()

  return toTexture(c)
}

