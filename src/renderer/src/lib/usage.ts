/** Normaliza amostras para uma barra sem dupla contagem. */
export function splitUsage(
  total: number,
  used: number,
  app?: number | null
): { app: number; other: number; free: number } {
  const finite = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0)
  const capacity = finite(total)
  if (!capacity) return { app: 0, other: 0, free: 100 }
  const occupied = Math.min(capacity, finite(used))
  const owned = Math.min(occupied, finite(app ?? 0))
  return {
    app: (owned / capacity) * 100,
    other: ((occupied - owned) / capacity) * 100,
    free: ((capacity - occupied) / capacity) * 100
  }
}
