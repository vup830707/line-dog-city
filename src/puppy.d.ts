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
    }
  }
}
