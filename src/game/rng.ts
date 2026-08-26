let state = 0x9e3779b9 >>> 0
let seedValue = 0x9e3779b9 >>> 0

export function setRunSeed(seed: number): void {
  const normalized = (Number.isFinite(seed) ? Math.trunc(seed) : 0x9e3779b9) >>> 0
  seedValue = normalized === 0 ? 0x9e3779b9 : normalized
  state = seedValue
}

export function getRunSeed(): number {
  return seedValue >>> 0
}

export function nextRandom(): number {
  let x = state >>> 0
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  state = x >>> 0
  return state / 0x100000000
}

export function randomRange(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return min
  if (max <= min) return min
  return min + (max - min) * nextRandom()
}

export function randomInt(min: number, maxExclusive: number): number {
  const lo = Math.ceil(min)
  const hi = Math.ceil(maxExclusive)
  if (hi <= lo) return lo
  return lo + Math.floor(nextRandom() * (hi - lo))
}

export function resetRunRng(seed?: number): number {
  if (seed === undefined) {
    const source = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
    setRunSeed(source)
  } else {
    setRunSeed(seed)
  }
  return getRunSeed()
}
