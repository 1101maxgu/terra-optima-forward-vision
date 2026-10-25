// Sensor trust chip + explanation panel. Verdicts come from src/engine/sensorTrust.ts via useFarm().assessments.
import type { SensorAssessment, TrustVerdict } from '../types'
import { useFarm } from '../state/farmStore'

const META: Record<TrustVerdict, { label: string; cls: string }> = {
  trusted: { label: 'Readings look right', cls: 'bg-leaf-soft text-leaf' },
  uncertain: { label: 'Unsure about readings', cls: 'bg-sun-soft text-sun' },
  'likely-faulty': { label: 'Likely faulty', cls: 'bg-alert-soft text-alert' },
  'real-event': { label: 'Big change, looks real', cls: 'bg-water-soft text-water' },
}

/** Confidence in words; the number is in the tooltip. */
export const confidenceWord = (c: number) => (c >= 0.75 ? 'high' : c >= 0.4 ? 'medium' : 'low')

export default function TrustBadge({ a }: { a?: SensorAssessment }) {
  if (!a) return null
  const m = a.ack ? { label: a.ack === 'fine' ? 'Marked fine' : 'Flag ignored', cls: 'bg-paper text-muted ring-1 ring-inset ring-line' } : META[a.verdict]
  return (
    <span title={`${a.explanation} Confidence ${Math.round(a.confidence * 100)}%.`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide whitespace-nowrap ${m.cls}`}>
      {m.label}
    </span>
  )
}

/** Explanation, what to do, and the farmer's response. Shown only for flags worth acting on. */
export function TrustPanel({ a, className = '' }: { a?: SensorAssessment; className?: string }) {
  const { acknowledge } = useFarm()
  if (!a || (a.verdict !== 'likely-faulty' && a.verdict !== 'uncertain')) return null
  if (a.ack)
    return (
      <p className={`text-sm text-muted ${className}`}>
        {a.ack === 'fine' ? 'You marked this probe as fine; its readings are used.' : 'Alerts silenced; readings still left out.'}{' '}
        <button type="button" className="font-semibold text-water underline" onClick={() => acknowledge(a.sensorId, null)}>Undo</button>
      </p>
    )
  return (
    <div className={`rounded-xl border p-3 text-sm ${className} ${a.verdict === 'likely-faulty' ? 'border-alert/30 bg-alert-soft' : 'border-sun/30 bg-sun-soft'}`}>
      <p className="font-medium text-ink">{a.explanation}</p>
      {a.signals.filter((x) => x.weight > 0).length > 1 && (
        <ul className="mt-1 list-disc pl-5 text-muted">{a.signals.filter((x) => x.weight > 0).map((x) => <li key={x.kind + x.detail}>It {x.detail}.</li>)}</ul>
      )}
      <p className="mt-1"><span className="text-muted">What to do: </span>{a.action}</p>
      <p className="mt-1 text-muted">
        Confidence in this probe: {confidenceWord(a.confidence)} ({Math.round(a.confidence * 100)}%).
        {a.verdict === 'likely-faulty' ? ' Its readings are left out of watering advice.' : ' Its readings are still used.'}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary min-h-11" onClick={() => acknowledge(a.sensorId, 'fine')}>I checked it, it's fine</button>
        <button type="button" className="btn-secondary min-h-11" onClick={() => acknowledge(a.sensorId, 'ignore')}>Ignore</button>
      </div>
    </div>
  )
}
