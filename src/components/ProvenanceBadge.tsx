import type { Provenance } from '../types'

const META: Record<Provenance, { label: string; cls: string; note: string }> = {
  measured: { label: 'Measured', cls: 'bg-leaf-soft text-leaf', note: 'From a field sensor or manual reading (none yet in this prototype).' },
  'live-weather': { label: 'Live weather', cls: 'bg-water-soft text-water', note: 'Open-Meteo forecast, fetched live or from cache.' },
  simulated: { label: 'Simulated', cls: 'bg-sun-soft text-sun', note: 'Sample data bundled with the demo.' },
  estimated: { label: 'Estimated', cls: 'bg-paper text-muted ring-1 ring-inset ring-line', note: 'Calculated by the FAO-56 rules engine.' },
  projected: { label: 'Projected', cls: 'bg-navy-soft text-navy', note: 'Modelled outcome, not validated in the field.' },
}

export default function ProvenanceBadge({ p }: { p: Provenance }) {
  const m = META[p]
  return (
    <span title={m.note} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide whitespace-nowrap ${m.cls}`}>
      {m.label}
    </span>
  )
}

export function ProvenanceLegend() {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
      {(Object.keys(META) as Provenance[]).map((p) => (
        <div key={p} className="flex flex-col gap-1">
          <dt>
            <ProvenanceBadge p={p} />
          </dt>
          <dd className="text-muted">{META[p].note}</dd>
        </div>
      ))}
    </dl>
  )
}
