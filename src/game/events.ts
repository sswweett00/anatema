export type DamageElement = 'physical' | 'fire' | 'ice' | 'shock' | 'poison' | 'bleed' | 'void'

export type GameplayEventMap = {
  'combat:hit': { damage: number; element: DamageElement; critical: boolean; targetId?: string }
  'combat:kill': { damage: number; element: DamageElement; overkill: number; targetId?: string; elite: boolean; boss: boolean }
  'combat:execute': { targetId?: string; damage: number }
  'combat:status': { status: string; targetId?: string; duration: number; stacks: number }
  'combat:reaction': { reaction: string; targetId?: string; power: number }
  'player:damage': { amount: number; source?: string }
  'player:dodge': { perfect: boolean }
  'player:level': { level: number }
  'player:heal': { amount: number }
  'wave:start': { wave: number; budget: number }
  'wave:end': { wave: number; elapsed: number }
  'boss:spawn': { bossId: string; wave: number }
  'boss:phase': { bossId: string; phase: number }
  'loot:drop': { kind: string; rarity: string; x: number; z: number }
  'loot:pickup': { kind: string; rarity: string }
  'relic:acquire': { relicId: string }
  'shrine:activate': { shrineId: string; reward: string }
  'run:mutator': { mutator: string; level: number; active: boolean }
  'run:ascend': { tier: number }
  'performance:pressure': { pressure: number; fps: number }
  'runtime:error': { system: string; message: string }
}

type Listener<T> = (event: T) => void

class TypedEventBus {
  private readonly listeners = new Map<keyof GameplayEventMap, Set<Listener<unknown>>>()

  on<K extends keyof GameplayEventMap>(type: K, listener: Listener<GameplayEventMap[K]>): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener as Listener<unknown>)
    return () => set?.delete(listener as Listener<unknown>)
  }

  emit<K extends keyof GameplayEventMap>(type: K, payload: GameplayEventMap[K]): void {
    const set = this.listeners.get(type)
    if (!set) return
    for (const listener of [...set]) {
      try {
        listener(payload)
      } catch (error) {
        console.error(`[ANATHEMA] event listener failed: ${String(type)}`, error)
      }
    }
  }

  clearListeners(): void {
    this.listeners.clear()
  }
}

export const events = new TypedEventBus()

/**
 * Events are transient notifications, not run state. Run reset must preserve
 * subscribers because HUD/VFX/progression components can stay mounted for the
 * entire application lifetime.
 */
export function resetEvents(): void {
  // Intentionally a no-op. There is no queued event state to reset.
}

export function clearEventListeners(): void {
  events.clearListeners()
}
