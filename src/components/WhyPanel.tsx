import type { Factor } from '../types'
import ProvenanceBadge from './ProvenanceBadge'
import { confidenceWord } from './TrustBadge'

const EFFECT: Record<Factor['effect'], { arrow: string; text: string; cls: string }> = {
  raises: { arrow: '↑', text: 'raises need', cls: 'text-alert' },
  lowers: { arrow: '↓', text: 'lowers need', cls: 'text-water' },
  neutral: { arrow: '→', text: 'neutral', cls: 'text-muted' },
}

export default function WhyPanel({ factors, confidence }: { factors: Factor[]; confidence?: number }) {
  return (
    <section aria-labelledby="why-h">
      <h3 id="why-h" className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
        Why this recommendation
      </h3>
      {confidence !== undefined && confidence < 0.75 && (
        <p className="mb-2 text-sm text-sun">Confidence in the sensor data: {confidenceWord(confidence)} ({Math.round(confidence * 100)}%).</p>
      )}
      <ul className="divide-y divide-line border-y border-line">
        {factors.map((f) => {
          const e = EFFECT[f.effect]
          return (
            <li key={f.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className={`w-6 text-center text-xl font-bold ${e.cls}`} aria-hidden>
                {e.arrow}
              </span>
              <span className="font-medium">{f.label}</span>
              <span className="tabular-nums text-muted">{f.value}</span>
              <span className={`text-sm ${e.cls}`}>({e.text})</span>
              <span className="ml-auto">
                <ProvenanceBadge p={f.provenance} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
