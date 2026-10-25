// Reports > Outcomes: water, waterings and labour avoided vs a baseline, with cost as a secondary estimate.
// Two views: a 14-day projection vs a fixed schedule, and logged history vs the previous period.
import { useMemo } from 'react'
import { AlertTriangle, History, TrendingDown } from 'lucide-react'
import { useFarm } from '../state/farmStore'
import { compareHistory, type Outcome } from '../engine/outcomes'
import { useProjection } from '../ui/farm'
import { Card, fmtLitres } from '../ui/kit'
import { SectionTitle } from '../ui/widgets'
import ProvenanceBadge from './ProvenanceBadge'
import { confidenceWord } from './TrustBadge'

const fmtH = (h: number) => `${Math.round(h * 10) / 10} h`
const fmtMoney = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (saved: number, base: number) => (base > 0 ? Math.round((saved / base) * 100) : null)
const plural = (n: number, w: string) => `${n} ${w}${Math.abs(n) === 1 ? '' : 's'}`

/** "1,200 L less" / "300 L more": savings can be negative, so say which way. */
const less = (n: number, fmt: (x: number) => string, word = 'less') => (n >= 0 ? `${fmt(n)} ${word}` : `${fmt(-n)} more`)

function Headline({ saved, base }: { saved: Outcome; base: Outcome }) {
  const p = pct(saved.litres, base.litres)
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-water-soft p-3">
        <dt className="text-sm text-muted">Water</dt>
        <dd className="text-2xl font-bold tabular-nums text-water">{less(saved.litres, fmtLitres)}</dd>
        {p !== null && <dd className="text-sm text-muted">{p >= 0 ? `${p}% less` : `${-p}% more`} than the baseline</dd>}
      </div>
      <div className="rounded-xl bg-leaf-soft p-3">
        <dt className="text-sm text-muted">Waterings</dt>
        <dd className="text-2xl font-bold tabular-nums text-leaf">{saved.events >= 0 ? `${plural(saved.events, 'watering')} avoided` : `${plural(-saved.events, 'extra watering')}`}</dd>
        <dd className="text-sm text-muted">{base.events} on the baseline</dd>
      </div>
      <div className="rounded-xl bg-sun-soft p-3">
        <dt className="text-sm text-muted">Labour</dt>
        <dd className="text-2xl font-bold tabular-nums text-sun">{less(saved.labourH, fmtH, 'saved')}</dd>
        <dd className="text-sm text-muted">at your minutes per watering</dd>
      </div>
    </dl>
  )
}

function CostLine({ saved }: { saved: Outcome }) {
  const c = saved.cost
  return (
    <p className="mt-3 text-sm">
      <span className="font-semibold">Estimated cost difference: {fmtMoney(c.total)}</span>{' '}
      <span className="text-muted">(water {fmtMoney(c.water)}, pumping {fmtMoney(c.energy)}, labour {fmtMoney(c.labour)})</span>{' '}
      <ProvenanceBadge p="estimated" />{' '}
      <a href="#/settings" className="font-semibold text-water underline">Use your own costs</a>
    </p>
  )
}

export function ProjectionCard() {
  const { outcomeSettings, zones } = useFarm()
  const p = useProjection()
  const nameOf = (id: string) => zones.find((z) => z.id === id)?.name ?? id
  const { mmPerEvent, eventsPerWeek } = outcomeSettings.schedule
  const caveats = p.zones.filter((z) => z.confidence < 0.75 || z.discounted.length)
  return (
    <Card>
      <SectionTitle icon={<TrendingDown aria-hidden className="size-5 text-water" />} title="Next 14 days: following GeoViva vs a fixed schedule" action={<ProvenanceBadge p="projected" />} />
      <p className="mb-3 text-muted">
        Baseline: {mmPerEvent} mm, {eventsPerWeek}× a week in every field section. This is a model of the weeks ahead, not a measured result.{' '}
        <a href="#/settings" className="font-semibold text-water underline">Change baseline</a>
      </p>
      {p.zones.length === 0 ? (
        <p className="text-muted">Needs a soil moisture reading in at least one field section to project from.</p>
      ) : (
        <>
          <Headline saved={p.saved} base={p.baseline} />
          {p.saved.litres < 0 && (
            <p className="mt-3 text-sm">GeoViva uses more water than the fixed schedule here because the schedule would under-water some field sections; see the field sections below.</p>
          )}
          <CostLine saved={p.saved} />
          <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
            {p.zones.map((z) => (
              <li key={z.zoneId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                <span className="min-w-36 font-semibold">{nameOf(z.zoneId)}</span>
                <span className="tabular-nums">{fmtLitres(z.geoviva.litres)} <span className="text-muted">vs {fmtLitres(z.baseline.litres)}</span></span>
                <span className="tabular-nums text-muted">{plural(z.geoviva.events, 'watering')} vs {z.baseline.events}</span>
                <span className="tabular-nums sm:ml-auto">{less(z.saved.litres, fmtLitres)}</span>
                {z.baselineStressDays > 0 && (
                  <span className="w-full text-muted">
                    The fixed schedule would leave this field section below its refill point (crop stress) on {z.baselineStressDays} of {z.days} days
                    {z.saved.litres < 0 ? ', so GeoViva applies more water here.' : '.'}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {caveats.map((z) => (
            <p key={z.zoneId} className="mt-2 flex gap-2 text-sm text-sun">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {nameOf(z.zoneId)}: {z.discounted.length ? `${z.discounted.join(', ')} left out as likely faulty; ` : ''}sensor confidence {confidenceWord(z.confidence)}. Treat this field section's projection with care.
            </p>
          ))}
          {p.missing.length > 0 && <p className="mt-2 text-sm text-muted">Not included (no reading yet): {p.missing.join(', ')}.</p>}
        </>
      )}
    </Card>
  )
}

export function HistoryCard({ days }: { days: number }) {
  const { zones, events, dataset, outcomeSettings } = useFarm()
  const h = useMemo(
    () => compareHistory(events, zones, days, Date.now(), outcomeSettings.schedule, outcomeSettings.costs),
    [events, zones, days, outcomeSettings],
  )
  const prov = dataset === 'sample' ? 'simulated' : 'measured'
  const saved = {
    litres: h.previous.litres - h.current.litres,
    events: h.previous.events - h.current.events,
  }
  return (
    <Card>
      <SectionTitle icon={<History aria-hidden className="size-5 text-leaf" />} title={`So far: last ${days} days vs the ${days} days before`} action={<ProvenanceBadge p={prov} />} />
      <p className="mb-3 text-muted">From waterings you logged. Weather differences between the two periods are not adjusted.</p>
      {!h.enough ? (
        <p className="text-muted">Not enough history yet. Log at least 2 waterings from a field section's page and this comparison fills in after {days} days.</p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            {([
              { label: 'This period', o: h.current },
              { label: 'Previous period', o: h.previous },
              { label: 'Fixed schedule would apply', o: h.schedule },
            ] satisfies { label: string; o: Outcome }[]).map(({ label, o }) => (
              <div key={label} className="rounded-xl border border-line p-3">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-xl font-bold tabular-nums">{fmtLitres(o.litres)}</dd>
                <dd className="text-sm text-muted tabular-nums">{plural(o.events, 'watering')} · {fmtH(o.labourH)} · {fmtMoney(o.cost.total)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm">
            Compared with the previous {days} days: <b>{less(saved.litres, fmtLitres)}</b> water, <b>{saved.events >= 0 ? `${plural(saved.events, 'watering')} fewer` : `${plural(-saved.events, 'watering')} more`}</b>.
          </p>
        </>
      )}
    </Card>
  )
}
