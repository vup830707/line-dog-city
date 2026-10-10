export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="stepper">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label}減少`}>
          −
        </button>
        <input
          inputMode="numeric"
          value={value}
          aria-label={label}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, Math.round(next))))
          }}
        />
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label}增加`}>
          ＋
        </button>
      </span>
    </label>
  )
}
