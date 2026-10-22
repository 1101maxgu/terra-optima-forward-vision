import { CROPS } from '../data/crops'
import { SOILS } from '../data/soils'
import { splitSessions } from '../engine/irrigation'
import { useFarm } from '../state/farmStore'
import MoistureGauge from './MoistureGauge'
import ProvenanceBadge from './ProvenanceBadge'
import WhyPanel from './WhyPanel'
import { StatusChip, litres } from './status'

export default function ZoneDetail() {
  const { zones, selectedZoneId, recommendations, latestReading, overrides } = useFarm()
  const zone = zones.find((z) => z.id === selectedZoneId) ?? zones[0]
  const rec = recommendations[zone.id]
  const soil = SOILS[zone.soilId]
  const moisture = overrides[zone.id]?.moisture ?? latestReading(zone.id).moisture
  const irrigating = rec.status === 'irrigate-now' || rec.status === 'irrigate-soon'
  const split = splitSessions(rec.grossMm, zone.areaM2)

  return (
    <section aria-labelledby="detail-h" className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="detail-h" className="font-serif text-2xl tracking-tight">
          {zone.name} · {CROPS[zone.cropId].name}
        </h2>
        <span className="text-sm text-muted">
          {soil.name} · {zone.method} · {zone.areaM2} m²
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <StatusChip s={rec.status} large />
        {irrigating ? (
          <>
            <Stat value={`${rec.grossMm.toFixed(0)} mm`} label="to apply" />
            <Stat value={litres(rec.litres)} label="for this zone" />
          </>
        ) : (
          <Stat value="0 L" label="no water needed" />
        )}
        <div className="flex flex-col">
          <span className="text-lg font-semibold">{rec.timing}</span>
          <span className="text-sm text-muted">timing</span>
        </div>
        <ProvenanceBadge p="estimated" />
      </div>

      <p className="text-lg leading-relaxed">{rec.summary}</p>

      {irrigating && split.sessions > 1 && (
        <p className="rounded-lg border border-water bg-water-soft px-4 py-3 text-ink">
          <span className="font-semibold">Split it up:</span> {split.sessions} sessions of about {split.mmEach} mm ({litres(split.litresEach)} each),
          spread over 2 days, so water soaks in instead of running off.
        </p>
      )}

      <div>
        <MoistureGauge current={moisture} wp={soil.wiltingPoint} refill={rec.refillMoisture} fc={soil.fieldCapacity} />
        <p className="mt-2 text-sm text-muted tabular-nums">
          Root-zone deficit {rec.depletionMm.toFixed(0)} mm now → {rec.projectedDepletionMm.toFixed(0)} mm in 48 h · refill at {rec.rawMm.toFixed(0)} mm of{' '}
          {rec.tawMm.toFixed(0)} mm available water
        </p>
      </div>

      <WhyPanel factors={rec.factors} />
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-3xl font-semibold tabular-nums leading-tight">{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  )
}
