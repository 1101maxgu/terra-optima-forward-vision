import type { Zone } from '../types'
import { CROPS } from '../data/crops'
import { useFarm } from '../state/farmStore'
import ProvenanceBadge from './ProvenanceBadge'
import { STATUS, StatusChip, litres, pct } from './status'

export default function ZoneCard({ zone }: { zone: Zone }) {
  const { recommendations, latestReading, overrides, selectedZoneId, selectZone } = useFarm()
  const rec = recommendations[zone.id]
  const reading = latestReading(zone.id)
  const ov = overrides[zone.id]?.moisture
  const selected = selectedZoneId === zone.id
  const irrigating = rec.status === 'irrigate-now' || rec.status === 'irrigate-soon'

  return (
    <button
      type="button"
      onClick={() => selectZone(zone.id)}
      aria-pressed={selected}
      className={`group relative flex w-full flex-col gap-3 overflow-hidden rounded-xl border bg-surface p-5 pl-6 text-left transition hover:shadow-[0_2px_10px_rgba(0,0,0,0.05)] ${
        selected ? 'border-ink ring-2 ring-ink' : 'border-line'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${STATUS[rec.status].bar}`} aria-hidden />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold">{zone.name}</span>
        <span className="text-muted">{CROPS[zone.cropId].name}</span>
      </div>
      <div className="flex items-end gap-5">
        <div>
          <div className="text-4xl font-semibold tabular-nums leading-none">{pct(ov ?? reading.moisture)}</div>
          <div className="mt-1 text-sm text-muted">soil moisture</div>
        </div>
        <div>
          <div className="text-2xl font-medium tabular-nums leading-none">{reading.soilTempC.toFixed(0)}°C</div>
          <div className="mt-1 text-sm text-muted">soil temp</div>
        </div>
        <div className="ml-auto">
          <ProvenanceBadge p={ov !== undefined ? 'simulated' : reading.provenance} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusChip s={rec.status} />
        {irrigating && <span className="font-semibold tabular-nums">{litres(rec.litres)}</span>}
      </div>
    </button>
  )
}
