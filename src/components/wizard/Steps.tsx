// Create-Zone wizard steps (layouts follow docs/design-refs/02–06). CreateZone owns navigation and saving.
import { Suspense, useState, type ReactNode } from 'react'
import { Check, Droplets, Layers, Pencil, Ruler, Sprout, SquareDashed } from 'lucide-react'
import type { CropId, IrrigationMethod, Sensor, SoilId, Zone } from '../../types'
import { useFarm } from '../../state/farmStore'
import { FarmLocator, FarmMap, MapSkeleton, ZoneDrawMap } from '../../map'
import { formatArea, type AreaUnit } from '../../map/geo'
import { CROPS } from '../../data/crops'
import { SOILS } from '../../data/soils'
import { EFFICIENCY } from '../../engine/irrigation'
import { ErrorNote, Field, Help, inputBase, inputCls } from '../../ui/controls'
import { Card } from '../../ui/kit'
import { Esp32Connect, LorawanConnect, MethodCards } from '../sensors/SensorConnect'
import { SensorSummary, TYPE_LABEL } from '../sensors/SensorMeta'
import { draftArea, STEPS, type WizardDraft } from './draft'

export interface StepProps {
  d: WizardDraft
  set: (p: Partial<WizardDraft>) => void
}

const SOIL_HINT: Record<SoilId, string> = {
  'sandy-loam': 'Gritty, drains fast — needs water more often.',
  loam: 'Crumbly and dark, holds water well — the most common.',
  'silt-loam': 'Smooth and floury, holds the most water.',
}
const METHOD_LABEL: Record<IrrigationMethod, string> = { drip: 'Drip', sprinkler: 'Sprinkler' }
const UNIT_M2: Record<AreaUnit, number> = { m2: 1, ha: 10_000, ac: 4046.856 }
const UNIT_LABEL: Record<AreaUnit, string> = { m2: 'm²', ha: 'ha', ac: 'ac' }
const toUnit = (m2: number, u: AreaUnit) => String(+(m2 / UNIT_M2[u]).toFixed(u === 'm2' ? 0 : 2))
const MAP_H = 'h-[60vh] min-h-80 lg:h-[62vh]'

export function Stepper({ step, canGo, onGo }: { step: number; canGo: (s: number) => boolean; onGo: (s: number) => void }) {
  return (
    <ol className="flex items-center justify-between gap-1 sm:justify-start sm:gap-3" aria-label="Steps">
      {STEPS.map((label, i) => {
        const done = i < step
        const cur = i === step
        return (
          <li key={label} className="flex items-center gap-1 sm:gap-3">
            {i > 0 && <span aria-hidden className={`hidden h-px w-6 sm:block ${done || cur ? 'bg-leaf' : 'bg-line'}`} />}
            <button type="button" disabled={!canGo(i) || cur} onClick={() => onGo(i)} aria-current={cur ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${label}${done ? ' (done)' : ''}`}
              className="flex min-h-11 items-center gap-1.5 disabled:cursor-default">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                cur ? 'bg-forest text-surface' : done ? 'bg-leaf text-surface' : 'border border-line bg-surface text-muted'}`}>
                {done ? <Check aria-hidden className="size-4" /> : i + 1}
              </span>
              <span className={`text-sm ${cur ? 'font-bold text-ink' : 'hidden text-muted sm:inline'}`}>{label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function StepLocation({ d, set }: StepProps) {
  const { farm } = useFarm()
  return (
    <div className="space-y-3">
      <Suspense fallback={<MapSkeleton className={MAP_H} />}>
        <FarmLocator className={MAP_H} value={{ center: d.location.center, zoom: d.location.zoom }} onChange={(v) => set({ location: v })} />
      </Suspense>
      <div>
        <p className="text-lg font-bold">{d.location.label ?? farm.name}</p>
        <p className="text-muted">{d.location.label ? 'Search result' : farm.location}</p>
      </div>
    </div>
  )
}

export function StepDraw({ d, set }: StepProps) {
  const { zones } = useFarm()
  const [initial] = useState(d.boundary) // pass the starting shape once; the map owns edits from here
  const [error, setError] = useState<string | null>(null)
  const [unit, setUnit] = useState<AreaUnit>('ha')
  const area = draftArea(d)
  if (d.skipBoundary)
    return (
      <Card className="space-y-3">
        <p className="text-lg font-bold">Boundary skipped</p>
        <p className="text-muted">You'll enter the area by hand on the next step, and can draw the boundary later from the zone page.</p>
        <button type="button" className="btn-secondary min-h-11" onClick={() => set({ skipBoundary: false })}>Draw the boundary instead</button>
      </Card>
    )
  return (
    <div className="space-y-3">
      <p className="text-muted">Tap each corner of the area, then tap the first corner to close it. A zone is a management area — it doesn't have to be a whole field.</p>
      <Suspense fallback={<MapSkeleton className={MAP_H} />}>
        <ZoneDrawMap className={MAP_H} value={initial} center={d.location.center} zoom={d.location.zoom} otherZones={zones}
          onChange={(boundary, _a, err) => { set({ boundary }); setError(err) }} />
      </Suspense>
      <div aria-live="polite">{error && <ErrorNote>{error}</ErrorNote>}</div>
      <div>
        <p className="mb-1 font-semibold">Zone area</p>
        <div className="flex flex-wrap items-center gap-3">
          <output className={`${inputBase} w-28 font-semibold tabular-nums`}>{area ? toUnit(area, unit) : '—'}</output>
          <UnitSelect unit={unit} onChange={setUnit} />
          <p className="max-w-56 text-sm text-muted">Area is calculated automatically from the drawn boundary.</p>
        </div>
      </div>
      <button type="button" className="min-h-11 text-sm font-medium text-water underline" onClick={() => set({ skipBoundary: true })}>
        Can't draw it now? Enter the area by hand
      </button>
    </div>
  )
}

function UnitSelect({ unit, onChange }: { unit: AreaUnit; onChange: (u: AreaUnit) => void }) {
  return (
    <select aria-label="Area unit" className={`${inputBase} w-24`} value={unit} onChange={(e) => onChange(e.target.value as AreaUnit)}>
      {(['ha', 'ac', 'm2'] as AreaUnit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
    </select>
  )
}

const Req = () => <span className="text-alert" aria-hidden> *</span>

export function StepDetails({ d, set }: StepProps) {
  const crop = CROPS[d.cropId]
  const [unit, setUnit] = useState<AreaUnit>('ha')
  const [areaText, setAreaText] = useState(d.manualAreaM2 ? toUnit(d.manualAreaM2, 'ha') : '')
  const area = draftArea(d)
  const setManual = (text: string, u: AreaUnit) => {
    setAreaText(text)
    const n = Number(text)
    set({ manualAreaM2: text && Number.isFinite(n) && n > 0 ? n * UNIT_M2[u] : null })
  }
  const label = (t: string, req?: boolean) => <>{t}{req && <Req />}</>
  return (
    <div className="max-w-xl space-y-5">
      <Field label={label('Zone name', true)} hint="e.g. North field, Greenhouse 1">
        {(id) => <input id={id} className={inputCls} value={d.name} maxLength={60} required onChange={(e) => set({ name: e.target.value })} />}
      </Field>
      <LabeledSelect label={label('Crop type', true)} value={d.cropId} onChange={(v) => set({ cropId: v as CropId })}
        options={Object.values(CROPS).map((c) => [c.id, c.name])} icon={<Sprout aria-hidden className="size-5 text-leaf" />} />
      <LabeledSelect label={label('Soil type', true)} value={d.soilId} onChange={(v) => set({ soilId: v as SoilId })}
        options={Object.values(SOILS).map((s) => [s.id, s.name])} hint={SOIL_HINT[d.soilId]} />

      <div>
        <p className="mb-1 font-semibold">Field size</p>
        <div className="flex flex-wrap items-center gap-3">
          {d.skipBoundary ? (
            <input aria-label={`Field size in ${UNIT_LABEL[unit]}`} type="number" inputMode="decimal" min={0} step="any" required className={`${inputBase} w-28`}
              value={areaText} onChange={(e) => setManual(e.target.value, unit)} />
          ) : (
            <output className={`${inputBase} w-28 bg-stale-soft! font-semibold tabular-nums`}>{area ? toUnit(area, unit) : '—'}</output>
          )}
          <UnitSelect unit={unit} onChange={(u) => { if (d.skipBoundary && d.manualAreaM2) setAreaText(toUnit(d.manualAreaM2, u)); setUnit(u) }} />
          <span className="text-sm text-muted">{d.skipBoundary ? 'Entered by hand (no boundary drawn)' : 'Calculated from boundary'}</span>
        </div>
      </div>

      <div>
        <Field label="Typical root depth (optional)">
          {(id) => (
            <div className="flex items-center gap-3">
              <input id={id} type="number" inputMode="numeric" className={`${inputBase} w-28`} placeholder={String(crop.rootDepthMm)}
                value={d.rootDepthMm ?? ''} onChange={(e) => set({ rootDepthMm: e.target.value === '' ? null : Number(e.target.value) })} />
              <span className={`${inputBase} bg-stale-soft!`}>mm</span>
            </div>
          )}
        </Field>
        <Help>How deep most of the roots reach. Deeper roots draw on more stored water, so you water less often. Leave empty to use the usual {crop.rootDepthMm} mm for {crop.name.toLowerCase()}.</Help>
      </div>

      <LabeledSelect label={label('Irrigation method', true)} value={d.method} onChange={(v) => set({ method: v as IrrigationMethod })}
        options={(['drip', 'sprinkler'] as const).map((m) => [m, METHOD_LABEL[m]])} icon={<Droplets aria-hidden className="size-5 text-water" />} />

      <details className="rounded-xl border border-line bg-surface px-3" open={d.efficiencyPct !== null}>
        <summary className="min-h-11 cursor-pointer content-center font-semibold">Advanced</summary>
        <div className="pb-3">
          <Field label="Irrigation efficiency (%)" hint={`Default for ${METHOD_LABEL[d.method].toLowerCase()}: ${Math.round(EFFICIENCY[d.method] * 100)}%`}>
            {(id) => <input id={id} type="number" inputMode="numeric" className={`${inputBase} w-28`} placeholder={String(Math.round(EFFICIENCY[d.method] * 100))}
              value={d.efficiencyPct ?? ''} onChange={(e) => set({ efficiencyPct: e.target.value === '' ? null : Number(e.target.value) })} />}
          </Field>
          <Help>How much of the water you pump actually reaches the roots — some is lost to wind, evaporation or runoff. Drip is usually about 90%, sprinklers about 75%.</Help>
        </div>
      </details>

      <Field label="Description (optional)">
        {(id) => <input id={id} className={inputCls} value={d.notes} maxLength={500} placeholder="e.g. East field near the barn" onChange={(e) => set({ notes: e.target.value })} />}
      </Field>
    </div>
  )
}

function LabeledSelect({ label, value, onChange, options, icon, hint }: {
  label: ReactNode; value: string; onChange: (v: string) => void; options: [string, string][]; icon?: ReactNode; hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      <span className="relative block">
        {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">{icon}</span>}
        <select className={`${inputCls} ${icon ? 'pl-10' : ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </span>
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  )
}

export function StepSensors({ d, set }: StepProps) {
  const { sensors } = useFarm()
  const unassigned = sensors.filter((s) => s.zoneId === null)
  const addPending = (list: Sensor[]) => set({ pendingSensors: [...d.pendingSensors.filter((p) => !list.some((s) => s.id === p.id)), ...list] })
  const toggle = (id: string, on: boolean) => set({ sensorIds: on ? [...d.sensorIds, id] : d.sensorIds.filter((x) => x !== id) })
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 font-semibold">Choose connection method</p>
        <MethodCards value={d.sensorMethod} onChange={(m) => set({ sensorMethod: m })} />
        <p className="mt-2 text-sm text-muted">Optional — you can skip this and add sensors later from Sensors.</p>
      </div>

      {d.sensorMethod === 'lorawan' && <LorawanConnect zoneId={null} onRegistered={addPending} />}
      {d.sensorMethod === 'esp32' && <Esp32Connect zoneId={null} onClaimed={(s) => addPending([s])} />}
      {d.sensorMethod === 'manual' && (
        <Field label="First soil moisture reading (%) — optional" hint="From a handheld meter. Leave empty to skip; you can add readings any time from the zone page.">
          {(id) => <input id={id} type="number" inputMode="decimal" min={0} max={100} step="any" className={`${inputBase} w-32`}
            value={d.manualReadingPct ?? ''} onChange={(e) => set({ manualReadingPct: e.target.value === '' ? null : Number(e.target.value) })} />}
        </Field>
      )}

      {d.pendingSensors.length > 0 && (
        <section>
          <p className="mb-2 font-semibold">Added to this zone</p>
          <ul className="space-y-2">
            {d.pendingSensors.map((s) => <li key={s.id} className="flex gap-3 rounded-xl border-2 border-leaf bg-surface p-3"><Check aria-hidden className="mt-0.5 size-5 text-leaf" /><SensorSummary sensor={s} /></li>)}
          </ul>
        </section>
      )}

      {unassigned.length > 0 && (
        <fieldset>
          <legend className="mb-2 font-semibold">Available sensors <span className="font-normal text-muted">(not in a zone yet)</span></legend>
          <div className="space-y-2">
            {unassigned.map((s) => (
              <label key={s.id} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3 hover:border-ink has-checked:border-leaf">
                <input type="checkbox" className="mt-1 size-5 shrink-0 accent-leaf" checked={d.sensorIds.includes(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
                <SensorSummary sensor={s} />
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}

export function StepReview({ d, onEdit }: { d: WizardDraft; onEdit: (step: number) => void }) {
  const { sensors } = useFarm()
  const area = draftArea(d) ?? 0
  const crop = CROPS[d.cropId]
  const soil = SOILS[d.soilId]
  const chosen = [...d.pendingSensors, ...sensors.filter((s) => d.sensorIds.includes(s.id))]
  const draftZone: Zone = { id: 'draft', name: d.name, cropId: d.cropId, soilId: d.soilId, method: d.method, areaM2: area, boundary: d.boundary }
  const rows: [ReactNode, string, string, number][] = [
    [<Sprout key="c" className="size-5" />, 'Crop type', crop.name, 2],
    [<Layers key="s" className="size-5" />, 'Soil type', soil.name, 2],
    [<SquareDashed key="a" className="size-5" />, 'Field size', formatArea(area, area >= 5000 ? 'ha' : 'm2'), d.skipBoundary ? 2 : 1],
    [<Ruler key="r" className="size-5" />, 'Root depth', `${d.rootDepthMm ?? crop.rootDepthMm} mm${d.rootDepthMm === null ? ' (crop default)' : ''}`, 2],
    [<Droplets key="m" className="size-5" />, 'Irrigation method', `${METHOD_LABEL[d.method]}${d.efficiencyPct !== null ? ` · ${d.efficiencyPct}% efficient` : ''}`, 2],
  ]
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="space-y-3">
        <div className="relative">
          {d.boundary && !d.skipBoundary ? (
            <Suspense fallback={<MapSkeleton className="h-60 lg:h-72" />}>
              <FarmMap className="h-60 lg:h-72" zones={[draftZone]} selectedZoneId="draft" fit="selected" fallbackCenter={d.location.center} />
            </Suspense>
          ) : (
            <p className="grid h-40 place-items-center rounded-2xl bg-stale-soft p-4 text-center text-muted">No map boundary — area entered by hand. You can draw it later.</p>
          )}
          <button type="button" onClick={() => onEdit(1)} className="absolute top-3 right-3 flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 font-semibold shadow-sm">
            <Pencil aria-hidden className="size-4" /> Edit
          </button>
        </div>
        <section>
          <div className="flex items-center justify-between">
            <p className="font-semibold">Connected sensors ({chosen.length})</p>
            <EditLink label="sensors" onClick={() => onEdit(3)} />
          </div>
          {chosen.length === 0 && !(d.sensorMethod === 'manual' && d.manualReadingPct !== null) && <p className="text-muted">None yet — you can add sensors later from Sensors.</p>}
          <ul className="space-y-1">
            {chosen.map((s) => (
              <li key={s.id} className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-full bg-leaf" />{s.name} ({s.depthCm} cm depth) <span className="text-sm text-muted">· {TYPE_LABEL[s.type]}</span></li>
            ))}
            {d.sensorMethod === 'manual' && d.manualReadingPct !== null && <li className="flex items-center gap-2"><Pencil aria-hidden className="size-4 text-muted" />First manual reading: {d.manualReadingPct}% moisture</li>}
          </ul>
        </section>
      </div>

      <div>
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-leaf-soft text-leaf"><Sprout aria-hidden className="size-7" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold break-words">{d.name.trim()} — {crop.name}</p>
            <p className="text-muted">{formatArea(area, area >= 5000 ? 'ha' : 'm2')} · {soil.name} · {METHOD_LABEL[d.method]}</p>
          </div>
          <EditLink label="details" onClick={() => onEdit(2)} />
        </div>
        <p className="mt-5 mb-1 font-semibold">Field details</p>
        <dl className="divide-y divide-line">
          {rows.map(([icon, k, v, step]) => (
            <div key={k} className="flex items-center gap-3 py-2.5">
              <span aria-hidden className="text-muted">{icon}</span>
              <dt className="flex-1 text-muted">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
              <EditLink label={k} onClick={() => onEdit(step)} iconOnly />
            </div>
          ))}
          {d.notes.trim() && (
            <div className="py-2.5"><dt className="text-muted">Description</dt><dd className="font-semibold break-words">{d.notes}</dd></div>
          )}
        </dl>
      </div>
    </div>
  )
}

function EditLink({ label, onClick, iconOnly }: { label: string; onClick: () => void; iconOnly?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Edit ${label}`} className="grid min-h-11 min-w-11 place-items-center rounded-md px-2 text-sm font-semibold text-water hover:bg-water-soft">
      {iconOnly ? <Pencil aria-hidden className="size-4" /> : <span className="flex items-center gap-1"><Pencil aria-hidden className="size-4" /> Edit</span>}
    </button>
  )
}
