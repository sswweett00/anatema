import type { Entity } from '../ecs/world'

/** Reusable 2D spatial hash for the arena plane. */
export class SpatialHash {
  private readonly buckets = new Map<string, number[]>()
  private readonly cellSize: number

  constructor(cellSize = 2.6) {
    this.cellSize = cellSize
  }

  private cell(value: number): number {
    return Math.floor(value / this.cellSize)
  }

  private key(x: number, z: number): string {
    return `${this.cell(x)}:${this.cell(z)}`
  }

  clear(): void {
    this.buckets.clear()
  }

  build(entities: readonly Entity[]): void {
    this.buckets.clear()
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i]
      if (entity.dead) continue
      const key = this.key(entity.position.x, entity.position.z)
      const bucket = this.buckets.get(key)
      if (bucket) bucket.push(i)
      else this.buckets.set(key, [i])
    }
  }

  nearest(origin: { x: number; z: number }, range: number, entities: readonly Entity[]): Entity | undefined {
    let best: Entity | undefined
    let bestD2 = range * range
    const cx = this.cell(origin.x)
    const cz = this.cell(origin.z)
    const cells = Math.max(1, Math.ceil(range / this.cellSize))

    for (let ox = -cells; ox <= cells; ox++) {
      for (let oz = -cells; oz <= cells; oz++) {
        const bucket = this.buckets.get(`${cx + ox}:${cz + oz}`)
        if (!bucket) continue
        for (const index of bucket) {
          const entity = entities[index]
          if (entity.dead) continue
          const dx = entity.position.x - origin.x
          const dz = entity.position.z - origin.z
          const d2 = dx * dx + dz * dz
          if (d2 < bestD2) {
            bestD2 = d2
            best = entity
          }
        }
      }
    }
    return best
  }

  forEachNearby(origin: { x: number; z: number }, radius: number, entities: readonly Entity[], visit: (entity: Entity, distanceSquared: number) => void): void {
    const cx = this.cell(origin.x)
    const cz = this.cell(origin.z)
    const cells = Math.max(1, Math.ceil(radius / this.cellSize))
    const r2 = radius * radius

    for (let ox = -cells; ox <= cells; ox++) {
      for (let oz = -cells; oz <= cells; oz++) {
        const bucket = this.buckets.get(`${cx + ox}:${cz + oz}`)
        if (!bucket) continue
        for (const index of bucket) {
          const entity = entities[index]
          if (entity.dead) continue
          const dx = entity.position.x - origin.x
          const dz = entity.position.z - origin.z
          const d2 = dx * dx + dz * dz
          if (d2 <= r2) visit(entity, d2)
        }
      }
    }
  }

  forEachNearbyIndex(
    origin: { x: number; z: number },
    radius: number,
    entities: readonly Entity[],
    visit: (index: number, entity: Entity, distanceSquared: number) => void,
  ): void {
    const cx = this.cell(origin.x)
    const cz = this.cell(origin.z)
    const cells = Math.max(1, Math.ceil(radius / this.cellSize))
    const r2 = radius * radius

    for (let ox = -cells; ox <= cells; ox++) {
      for (let oz = -cells; oz <= cells; oz++) {
        const bucket = this.buckets.get(`${cx + ox}:${cz + oz}`)
        if (!bucket) continue
        for (const index of bucket) {
          const entity = entities[index]
          if (entity.dead) continue
          const dx = entity.position.x - origin.x
          const dz = entity.position.z - origin.z
          const d2 = dx * dx + dz * dz
          if (d2 <= r2) visit(index, entity, d2)
        }
      }
    }
  }
}
