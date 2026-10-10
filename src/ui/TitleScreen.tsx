import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { assetMap } from '../assets/assetMap'
import { gameConfig } from '../config'
import { titleActionLabel, titleLightDuration } from './titleFlow'

type Phase = 'idle' | 'lighting' | 'lit'

export function TitleScreen({ hasSave, onBegin }: { hasSave: boolean; onBegin: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const doneRef = useRef(false)
  const timers = useRef<number[]>([])
  const buttonRef = useRef<HTMLButtonElement>(null)
  const onBeginRef = useRef(onBegin)
  onBeginRef.current = onBegin
  const label = titleActionLabel(hasSave)
  const lightMs = gameConfig.titleLightMs

  useEffect(() => {
    buttonRef.current?.focus()
    return () => {
      for (const id of timers.current) window.clearTimeout(id)
    }
  }, [])

  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
    onBeginRef.current()
  }

  function begin() {
    if (doneRef.current) return
    if (phaseRef.current !== 'idle') {
      finish()
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const ms = titleLightDuration(reduced, lightMs)
    if (reduced) {
      phaseRef.current = 'lit'
      setPhase('lit')
      timers.current.push(window.setTimeout(finish, ms))
      return
    }
    phaseRef.current = 'lighting'
    setPhase('lighting')
    const shotHold = new URLSearchParams(window.location.search).has('titleShot') ? 2000 : 0
    timers.current.push(
      window.setTimeout(() => {
        phaseRef.current = 'lit'
        setPhase('lit')
      }, Math.round(ms * 0.82)),
    )
    timers.current.push(window.setTimeout(finish, ms + shotHold))
  }

  return (
    <main
      className="title-screen"
      data-testid="title-screen"
      data-phase={phase}
      style={{ '--title-light': `${lightMs}ms` } as CSSProperties}
    >
      <div className="title-dock title-dock-unlit" />
      <div className="title-dock title-dock-lit" />
      <img className="title-bg title-bg-unlit" src={assetMap.title.unlit} alt="" />
      <div className="title-wash" />
      <img className="title-bg title-bg-lit" src={assetMap.title.lit} alt="" />
      <div className="title-glow" />
      <h1 className="title-logo-wrap">
        <img className="title-logo" src={assetMap.title.logo} alt="動物夜市" />
      </h1>
      <button ref={buttonRef} type="button" className="title-start" data-testid="title-start" autoFocus onClick={begin}>
        <Leaf className="title-leaf title-leaf-left" />
        <span className="title-start-label">{label}</span>
        <Leaf className="title-leaf title-leaf-right" />
        <Paw />
      </button>
    </main>
  )
}

function Leaf({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 42c14-2 22-20 40-32-8 20-14 36-28 46-6-4-10-8-12-14z" fill="#6f8f45" />
      <path d="M18 44c10-8 18-20 28-30" fill="none" stroke="#3d5a26" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function Paw() {
  return (
    <svg className="title-paw" viewBox="0 0 64 52" aria-hidden="true">
      <ellipse cx="32" cy="34" rx="14" ry="12" fill="#5a3718" />
      <ellipse cx="14" cy="18" rx="6.5" ry="8" fill="#5a3718" />
      <ellipse cx="27" cy="11" rx="6" ry="8" fill="#5a3718" />
      <ellipse cx="40" cy="12" rx="5.5" ry="7.5" fill="#5a3718" />
      <ellipse cx="51" cy="20" rx="5.5" ry="7" fill="#5a3718" />
    </svg>
  )
}
