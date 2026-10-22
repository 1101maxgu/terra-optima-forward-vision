import { useMemo, useState, type FormEvent } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Droplets, Gauge } from 'lucide-react'
import type { Zone } from '../../types'
import { useFarm, type ZoneStatus } from '../../state/farmStore'
import { Card, fmtLitres, timeAgo } from '../../ui/kit'
import { SOILS } from '../../data/soils'
import ProvenanceBadge from '../ProvenanceBadge'
import { Field, inputCls } from './parts'
import { chartRows, historyTimeline, litresToMm, mmToLitres } from './helpers'
import { RecommendationCard } from './Overview'

const H2 = 'text-lg font-bold'
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6'] // validated categorical order (dataviz reference palette)
const DAY = 86_400_000
const fmtDate = (t: number | string) => new Date(t).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })

/** Local midnights inside the data range, for one x tick per day. */
const dayTicks = (rows: Record<string, number>[]) => {
  if (!rows.length) return []
  const d = new Date(rows[0].t)
  d.setHours(24, 0, 0, 0)
  const out: number[] = []
  for (; d.getTime() <= rows[rows.length - 1].t; d.setDate(d.getDate() + 1)) out.push(d.getTime())
  return out
}

type Msg = { ok: boolean; text: string } | null
const Status = ({ msg }: { msg: Msg }) => (msg ? <p role="status" className={msg.ok ? 'text-leaf' : 'font-medium text-alert'}>{msg.text}</p> : null)

export function MoistureTab({ zone, zs }: { zone: Zone; zs: ZoneStatus }) {
  const { readings, sensors, addManualReading } = useFarm()
  const soil = SOILS[zone.soilId]
  const refill = Math.round((zs.rec?.refillMoisture ?? soil.wiltingPoint) * 1000) / 10
  const fc = Math.round(soil.fieldCapacity * 1000) / 10
  // ponytail: 7-day window is anchored to load time; fine for a page that re-renders on new data.
  const { rows, keys } = useMemo(() => chartRows(readings.filter((r) => r.zoneId === zone.id), Date.now() - 7 * DAY), [readings, zone.id])
  const yMax = Math.ceil(Math.max(fc + 5, ...rows.flatMap((r) => keys.map((k) => r[k] ?? 0))) / 10) * 10
  const name = (k: string) => {
    const s = sensors.find((x) => x.id === k)
    return s ? `${s.name} · ${s.depthCm} cm` : k === 'csv' ? 'Imported (CSV)' : 'Manual readings'
  }

  const [m, setM] = useState('')
  const [t, setT] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const pct = Number(m)
    const temp = t.trim() ? Number(t) : undefined
    if (!m.trim() || !(pct >= 0 && pct <= 100)) return setMsg({ ok: false, text: 'Enter soil moisture between 0 and 100%.' })
    if (temp !== undefined && !(temp >= -20 && temp <= 60)) return setMsg({ ok: false, text: 'Soil temperature should be between −20 and 60 °C.' })
    setBusy(true)
    try {
      await addManualReading(zone.id, pct, temp)
      setM('')
      setT('')
      setMsg({ ok: true, text: 'Reading saved.' })
    } catch (err) {
      setMsg({ ok: false, text: `Could not save: ${err instanceof Error ? err.message : 'unknown error'}. Try again.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className={H2}>Soil moisture, last 7 days</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-muted">No readings in the last 7 days.</p>
        ) : (
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={dayTicks(rows)} tickFormatter={(v) => new Date(v).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} stroke="var(--color-muted)" fontSize={12} />
                <YAxis unit="%" domain={[0, yMax]} ticks={Array.from({ length: yMax / 10 + 1 }, (_, i) => i * 10)} stroke="var(--color-muted)" fontSize={12} />
                <Tooltip labelFormatter={(v) => new Date(v as number).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })} formatter={(v, n) => [`${v}%`, name(String(n))]} />
                <Legend formatter={(k) => <span className="text-ink">{name(String(k))}</span>} />
                <ReferenceLine y={fc} stroke="var(--color-water)" strokeDasharray="6 4" label={{ value: `Field capacity ${fc}%`, position: 'insideTopRight', fontSize: 12, fill: 'var(--color-muted)' }} />
                <ReferenceLine y={refill} stroke="var(--color-alert)" strokeDasharray="6 4" label={{ value: `Refill ${refill}%`, position: 'insideBottomRight', fontSize: 12, fill: 'var(--color-muted)' }} />
                {keys.slice(0, SERIES.length).map((k, i) => (
                  <Line key={k} dataKey={k} stroke={SERIES[i]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h2 id="add-reading" className={`${H2} scroll-mt-24`}>Add a manual reading</h2>
        <form onSubmit={submit} className="mt-3 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Soil moisture (%)">
            <input className={inputCls} type="number" inputMode="decimal" step="0.1" min={0} max={100} value={m} onChange={(e) => { setM(e.target.value); setMsg(null) }} required />
          </Field>
          <Field label="Soil temperature (°C, optional)">
            <input className={inputCls} type="number" inputMode="decimal" step="0.1" value={t} onChange={(e) => { setT(e.target.value); setMsg(null) }} />
          </Field>
          <button type="submit" disabled={busy} className="btn-primary min-h-11 disabled:opacity-60">{busy ? 'Saving…' : 'Save reading'}</button>
        </form>
        <div className="mt-2"><Status msg={msg} /></div>
      </Card>
    </div>
  )
}

export function IrrigationTab({ zone, zs, onAddReading }: { zone: Zone; zs: ZoneStatus; onAddReading: () => void }) {
  const { events, logIrrigation } = useFarm()
  const [unit, setUnit] = useState<'mm' | 'L'>('mm')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const n = Number(amount)
  const valid = amount.trim() !== '' && n > 0
  const mm = unit === 'mm' ? n : litresToMm(n, zone.areaM2)
  const litres = unit === 'L' ? Math.round(n) : mmToLitres(n, zone.areaM2)
  const past = events.filter((e) => e.zoneId === zone.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || mm > 200) return setMsg({ ok: false, text: 'Enter an amount above 0 (at most 200 mm).' })
    setBusy(true)
    try {
      await logIrrigation({ zoneId: zone.id, timestamp: new Date().toISOString(), mm, litres, note: note.trim() || undefined })
      setAmount('')
      setNote('')
      setMsg({ ok: true, text: 'Irrigation logged.' })
    } catch (err) {
      setMsg({ ok: false, text: `Could not save: ${err instanceof Error ? err.message : 'unknown error'}. Try again.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
      <RecommendationCard zone={zone} zs={zs} onAddReading={onAddReading} />
      <div className="flex flex-col gap-4">
        <Card>
          <h2 id="log-irrigation" className={`${H2} scroll-mt-24`}>Log irrigation</h2>
          <form onSubmit={submit} className="mt-3 flex flex-col gap-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Field label={`Amount applied (${unit === 'mm' ? 'mm' : 'litres'})`}>
                  <input className={inputCls} type="number" inputMode="decimal" step="any" min={0} value={amount} onChange={(e) => { setAmount(e.target.value); setMsg(null) }} required />
                </Field>
              </div>
              <div role="group" aria-label="Unit" className="flex self-end rounded-lg border border-line p-1">
                {(['mm', 'L'] as const).map((u) => (
                  <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={`min-h-10 min-w-12 rounded-md px-3 font-semibold ${unit === u ? 'bg-ink text-surface' : ''}`}>{u}</button>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted" aria-live="polite">
              {valid ? <>= <b className="text-ink">{mm} mm</b> over {zone.areaM2.toLocaleString('en-CA')} m² = <b className="text-ink">{fmtLitres(litres)}</b></> : '1 mm over 1 m² is 1 litre.'}
            </p>
            <Field label="Note (optional)">
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ran drip 2 h" />
            </Field>
            <button type="submit" disabled={busy} className="btn-primary min-h-11 disabled:opacity-60">{busy ? 'Saving…' : 'Log irrigation'}</button>
            <Status msg={msg} />
          </form>
        </Card>
        <Card>
          <h2 className={H2}>Past irrigation</h2>
          {past.length === 0 ? (
            <p className="mt-2 text-muted">Nothing logged yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {past.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 py-3">
                  <span className="font-semibold">{fmtDate(e.timestamp)}</span>
                  <span className="tabular-nums">{e.mm} mm · {fmtLitres(e.litres)}</span>
                  <span className="text-sm text-muted">{timeAgo(e.timestamp)}{e.source === 'sample' ? ' · sample' : ''}</span>
                  {e.note && <span className="w-full text-sm text-muted">{e.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

export function WeatherTab() {
  const { weather, weatherLabel } = useFarm()
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={H2}>Next 7 days</h2>
        <span className="flex items-center gap-2 text-sm text-muted">{weatherLabel} <ProvenanceBadge p={weather.provenance} /></span>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {weather.days.slice(0, 7).map((d, i) => (
          <li key={d.date} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 lg:flex-col lg:items-start">
            <span className="font-semibold">{i === 0 ? 'Today' : fmtDate(`${d.date}T12:00`)}</span>
            <span className="tabular-nums"><b>{Math.round(d.tMaxC)}°</b> <span className="text-muted">/ {Math.round(d.tMinC)}°</span></span>
            <span className="flex items-center gap-1 tabular-nums text-water"><Droplets className="size-4" aria-hidden />{Math.round(d.rainMm * 10) / 10} mm</span>
            <span className="flex items-center gap-1 text-sm tabular-nums text-muted" title="Reference evapotranspiration"><Gauge className="size-4" aria-hidden />ET₀ {Math.round(d.et0Mm * 10) / 10} mm</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">ET₀ is how much water a reference crop loses to the air each day. Higher means thirstier crops.</p>
    </Card>
  )
}

export function HistoryTab({ zone }: { zone: Zone }) {
  const { readings, events } = useFarm()
  const items = useMemo(
    () => historyTimeline(readings.filter((r) => r.zoneId === zone.id), events.filter((e) => e.zoneId === zone.id)).slice(0, 60),
    [readings, events, zone.id],
  )
  return (
    <Card>
      <h2 className={H2}>History</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-muted">No readings or irrigation recorded yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {items.map((it) =>
            it.kind === 'irrigation' ? (
              <li key={`e-${it.event.id}`} className="flex gap-3 rounded-xl bg-water-soft p-3">
                <Droplets className="mt-0.5 size-5 shrink-0 text-water" aria-hidden />
                <div>
                  <p><b>Irrigated {it.event.mm} mm</b> · {fmtLitres(it.event.litres)}</p>
                  <p className="text-sm text-muted">{fmtDate(it.event.timestamp)}{it.event.note ? ` · ${it.event.note}` : ''}{it.event.source === 'sample' ? ' · sample' : ''}</p>
                </div>
              </li>
            ) : (
              <li key={`d-${it.date}`} className="flex gap-3 rounded-xl border border-line p-3">
                <Gauge className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                <div>
                  <p><b>Soil moisture avg {it.day.avgPct}%</b> <span className="text-muted">({it.day.minPct}–{it.day.maxPct}%)</span></p>
                  <p className="text-sm text-muted">{fmtDate(`${it.date}T12:00`)} · {it.day.count} reading{it.day.count > 1 ? 's' : ''}</p>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </Card>
  )
}
