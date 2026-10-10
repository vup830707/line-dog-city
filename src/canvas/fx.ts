/** Ease-out back. 0 at the start of the build, 1 once `durationMs` has passed. */
export function buildPopScale(elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0) || elapsedMs >= durationMs) return 1
  const t = Math.max(0, elapsedMs) / durationMs
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

/** Breathing opacity for an empty slot that can take the selected card. */
export function glowAlpha(timeMs: number): number {
  const wave = 0.5 + 0.5 * Math.sin(timeMs / 280)
  return 0.35 + 0.65 * wave
}
