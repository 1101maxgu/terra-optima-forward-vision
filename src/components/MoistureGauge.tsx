import { pct } from './status'

const MAX = 0.45 // matches the 5–45% slider range

const at = (m: number) => `${(Math.min(Math.max(m, 0), MAX) / MAX) * 100}%`

/** Horizontal soil-water bar: wilting point, refill point, field capacity and current moisture. */
export default function MoistureGauge({ current, wp, refill, fc }: { current: number; wp: number; refill: number; fc: number }) {
  const bands = [
    { from: 0, to: wp, cls: 'bg-alert-soft', label: 'Below wilting point' },
    { from: wp, to: refill, cls: 'bg-sun-soft', label: 'Stress risk — refill' },
    { from: refill, to: fc, cls: 'bg-leaf-soft', label: 'Readily available' },
    { from: fc, to: MAX, cls: 'bg-water-soft', label: 'Above field capacity' },
  ]
  const ticks = [
    { m: wp, label: 'Wilting', row: 0 },
    { m: refill, label: 'Refill', row: 1 },
    { m: fc, label: 'Field cap.', row: 0 },
  ]
  return (
    <figure
      className="w-full"
      aria-label={`Soil moisture ${pct(current)}; wilting point ${pct(wp)}, refill point ${pct(refill)}, field capacity ${pct(fc)}`}
    >
      <div className="relative h-8">
        <span className="absolute bottom-0 -translate-x-1/2 rounded bg-ink px-2 py-0.5 text-sm font-semibold whitespace-nowrap text-surface tabular-nums" style={{ left: at(current) }}>
          Now {pct(current)}
        </span>
      </div>
      <div className="relative mt-1 h-7 overflow-hidden rounded-md ring-1 ring-line ring-inset">
        {bands.map((b) => (
          <div key={b.label} className={`absolute inset-y-0 ${b.cls}`} style={{ left: at(b.from), width: `calc(${at(b.to)} - ${at(b.from)})` }} />
        ))}
        {ticks.map((t) => (
          <div key={t.label} className="absolute inset-y-0 w-px bg-muted/60" style={{ left: at(t.m) }} />
        ))}
        <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-ink" style={{ left: at(current) }} />
      </div>
      <div className="relative h-11 text-xs text-muted">
        {ticks.map((t) => (
          <span key={t.label} className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: at(t.m), top: t.row ? '1.3rem' : '0.2rem' }}>
            {t.label} {pct(t.m)}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {bands.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1.5">
            <span className={`size-3 rounded-sm ring-1 ring-line ring-inset ${b.cls}`} aria-hidden />
            {b.label}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
