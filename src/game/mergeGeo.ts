import * as THREE from 'three'

/*
 * BAĞIMSIZ GEOMETRİ BİRLEŞTİRİCİ
 * three-stdlib / three/addons gibi dış yardımcılara hiç dokunmadan,
 * boyalı (vertex-color) parçaları tek BufferGeometry'de toplar.
 * Yalnızca position + normal + color taşınır — materyallerde doku
 * (map) kullanılmadığı için uv gerekmez.
 */
export function mergePainted(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) return new THREE.CylinderGeometry(0.3, 0.28, 1.2, 14)
  if (parts.length === 1) return parts[0]

  let vertTotal = 0
  let idxTotal = 0
  for (const p of parts) {
    vertTotal += p.attributes.position.count
    idxTotal += p.index ? p.index.count : p.attributes.position.count
  }

  const pos = new Float32Array(vertTotal * 3)
  const nor = new Float32Array(vertTotal * 3)
  const col = new Float32Array(vertTotal * 3)
  const idx = new Uint32Array(idxTotal)
  let vo = 0
  let io = 0

  for (const p of parts) {
    const count = p.attributes.position.count
    pos.set(p.attributes.position.array as Float32Array, vo * 3)
    if (p.attributes.normal) nor.set(p.attributes.normal.array as Float32Array, vo * 3)
    if (p.attributes.color) col.set(p.attributes.color.array as Float32Array, vo * 3)

    if (p.index) {
      const ia = p.index.array
      for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo
      io += ia.length
    } else {
      for (let i = 0; i < count; i++) idx[io + i] = vo + i
      io += count
    }
    vo += count
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  return geo
}
