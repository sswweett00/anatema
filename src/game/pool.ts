export interface Resettable<T> {
  reset(): void
}

export class ObjectPool<T extends Resettable<T>> {
  private readonly items: T[] = []

  constructor(private readonly factory: () => T, initialSize = 0) {
    for (let i = 0; i < initialSize; i++) this.items.push(factory())
  }

  acquire(): T {
    return this.items.pop() ?? this.factory()
  }

  release(item: T): void {
    item.reset()
    this.items.push(item)
  }

  releaseMany(items: readonly T[]): void {
    for (const item of items) this.release(item)
  }

  get size(): number {
    return this.items.length
  }

  clear(): void {
    this.items.length = 0
  }
}

export class ArrayPool<T> {
  private readonly items: T[][] = []

  acquire(): T[] {
    return this.items.pop() ?? []
  }

  release(array: T[]): void {
    array.length = 0
    this.items.push(array)
  }

  clear(): void {
    this.items.length = 0
  }
}
