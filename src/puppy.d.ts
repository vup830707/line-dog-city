export {}

declare global {
  interface Window {
    __puppy?: {
      pause: () => void
      resume: () => void
      runTicks: (count: number) => void
      rewindClock: (ms: number) => void
      spawn: (species: string) => void
      clearSlot: (index: number) => void
      setMoney: (amount: number) => void
      setStallLevel: (index: number, level: number) => void
      showLevel: (level: number) => void
      showEvent: (kind: 'rain' | 'festival-eve' | 'merchant') => void
      tune: (patch: { weather?: string; phase?: string; day?: number; clearEvent?: boolean }) => void
      setAffinity: (species: string, hearts: number, progress?: number) => void
    }
  }
}
