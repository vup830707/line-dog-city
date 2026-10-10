import { assetMap, type Sprite } from '../assets/assetMap'

export function SpriteThumb({ sprite, className = '' }: { sprite: Sprite; className?: string }) {
  return (
    <span
      className={`sprite ${className}`}
      role="img"
      aria-label={sprite.label}
      style={{ backgroundImage: `url(${sprite.src})`, backgroundSize: sprite.size, backgroundPosition: sprite.position }}
    />
  )
}

export function PlaceholderThumb({ label, accent }: { label: string; accent: string }) {
  return (
    <svg className="placeholder" viewBox="0 0 80 80" aria-hidden="true">
      <rect x="2" y="2" width="76" height="76" rx="16" fill="#fffdf9" stroke="#24170f" strokeWidth="3" />
      <ellipse cx="24" cy="24" rx="8" ry="12" fill={accent} stroke="#24170f" strokeWidth="2" />
      <ellipse cx="56" cy="24" rx="8" ry="12" fill="#fff" stroke="#24170f" strokeWidth="2" />
      <circle cx="40" cy="44" r="16" fill="#fff" stroke="#24170f" strokeWidth="2" />
      <circle cx="34" cy="42" r="2" fill="#24170f" />
      <circle cx="46" cy="42" r="2" fill="#24170f" />
      <text x="40" y="74" textAnchor="middle" fontSize="8" fill="#24170f">
        {label.slice(0, 6)}
      </text>
    </svg>
  )
}

export function FigureArt({ figureId, name }: { figureId: string; name: string }) {
  const art = assetMap.figures[figureId as keyof typeof assetMap.figures]
  if (!art) return <PlaceholderThumb label={name} accent="#e7a0c4" />
  if (art.kind === 'placeholder') return <PlaceholderThumb label={name} accent={art.accent} />
  const sprite = assetMap.crops[art.spriteKey]
  return <SpriteThumb sprite={sprite} />
}

export function PairArt() {
  return <SpriteThumb sprite={assetMap.crops.stallDuo} className="sprite-wide" />
}
