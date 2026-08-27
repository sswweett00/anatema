import { currentBiome, startBiomeRuntime, stopBiomeRuntime, resetBiomeRuntime } from './biome_runtime'

export function getBiome() {
  return currentBiome()
}

export function startArenaDirector(): () => void {
  return startBiomeRuntime()
}

export function stopArenaDirector(): void {
  stopBiomeRuntime()
}

export function resetArenaDirector(): void {
  resetBiomeRuntime()
}
