/** How long the reduced-motion path holds the lit plate before entering. */
export const TITLE_REDUCED_MOTION_MS = 80

export function titleActionLabel(hasSave: boolean): '開始營業' | '繼續營業' {
  return hasSave ? '繼續營業' : '開始營業'
}

export function titleLightDuration(reducedMotion: boolean, configuredMs: number): number {
  return reducedMotion ? TITLE_REDUCED_MOTION_MS : configuredMs
}
