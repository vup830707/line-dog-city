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

export function Swatch({ accent, label }: { accent: string; label: string }) {
  return (
    <span className="swatch" style={{ background: accent }} aria-hidden="true">
      {label.slice(0, 1)}
    </span>
  )
}

export function PairArt() {
  return <SpriteThumb sprite={assetMap.crops.stallDuo} className="sprite-wide" />
}
