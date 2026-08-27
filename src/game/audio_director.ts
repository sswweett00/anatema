let running = false

export function startAudioDirector(): () => void {
  running = true
  return stopAudioDirector
}

export function stopAudioDirector(): void {
  running = false
}

export function resetAudioDirector(): void {
  running = false
}

export function tickAudioDirector(_dt: number): void {
  if (!running) return
}
