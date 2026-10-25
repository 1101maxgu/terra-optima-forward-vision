import { useEffect, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { OUTCOME_DEFAULTS, useFarm, type OutcomeSettings } from '../state/farmStore'
import { COST_META, type CostAssumptions } from '../engine/outcomes'
import CsvImport from '../components/CsvImport'
import AlertPreview from '../components/AlertPreview'
import Luke from '../guide/Luke'
import { startTour } from '../guide/Tour'
import { Card, PageHeader } from '../ui/kit'

const input = 'h-12 w-full rounded-xl border border-line bg-surface px-3'

function Choice<T extends string>({ value, options, onChange, name }: { value: T; name: string; onChange: (v: T) => void; options: { v: T; title: string; desc: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.v} className={`flex cursor-pointer gap-3 rounded-xl border-2 p-4 ${value === o.v ? 'border-forest bg-leaf-soft' : 'border-line'}`}>
          <input type="radio" name={name} checked={value === o.v} onChange={() => onChange(o.v)} className="mt-1 size-5 accent-[var(--color-forest)]" />
          <span>
            <span className="block font-semibold">{o.title}</span>
            <span className="block text-sm text-muted">{o.desc}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

function FarmDetails() {
  const { farm, updateFarm } = useFarm()
  const [name, setName] = useState(farm.name)
  const [location, setLocation] = useState(farm.location)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle')
  useEffect(() => {
    setName(farm.name)
    setLocation(farm.location)
  }, [farm.name, farm.location])

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return setState('Farm name is required.')
        setState('saving')
        try {
          await updateFarm({ name: name.trim(), location: location.trim() })
          setState('saved')
        } catch (err) {
          setState(err instanceof Error ? err.message : 'Could not save. Try again.')
        }
      }}
    >
      <label className="flex flex-col gap-1 font-medium">
        Farm name
        <input value={name} onChange={(e) => setName(e.target.value)} className={input} required />
      </label>
      <label className="flex flex-col gap-1 font-medium">
        Location
        <input value={location} onChange={(e) => setLocation(e.target.value)} className={input} placeholder="e.g. Abbotsford, BC" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={state === 'saving'} className="btn-primary min-h-12">
          {state === 'saving' ? 'Saving…' : 'Save farm details'}
        </button>
        <span role="status" className={state === 'saved' ? 'text-leaf' : 'text-alert'}>
          {state === 'saved' ? 'Saved.' : state !== 'idle' && state !== 'saving' ? state : ''}
        </span>
      </div>
    </form>
  )
}

/** Baseline schedule and cost assumptions behind Reports > Outcomes. Saved on this device. */
function OutcomeAssumptions() {
  const { outcomeSettings, setOutcomeSettings } = useFarm()
  const [draft, setDraft] = useState<OutcomeSettings>(outcomeSettings)
  const [saved, setSaved] = useState(false)
  useEffect(() => setDraft(outcomeSettings), [outcomeSettings])
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const setCost = (k: keyof CostAssumptions, v: string) => { setSaved(false); setDraft((d) => ({ ...d, costs: { ...d.costs, [k]: num(v) } })) }
  const setSchedule = (k: keyof OutcomeSettings['schedule'], v: string) => { setSaved(false); setDraft((d) => ({ ...d, schedule: { ...d.schedule, [k]: num(v) } })) }
  const valid = [...Object.values(draft.costs), ...Object.values(draft.schedule)].every((x) => Number.isFinite(x) && x >= 0) && draft.schedule.eventsPerWeek <= 7

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        setOutcomeSettings(draft)
        setSaved(true)
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Baseline: a fixed watering schedule</legend>
        <label className="flex flex-col gap-1 font-medium">
          mm per watering
          <input type="number" min={0} step="any" inputMode="decimal" value={Number.isNaN(draft.schedule.mmPerEvent) ? '' : draft.schedule.mmPerEvent} onChange={(e) => setSchedule('mmPerEvent', e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Waterings per week
          <input type="number" min={0} max={7} step={1} inputMode="numeric" value={Number.isNaN(draft.schedule.eventsPerWeek) ? '' : draft.schedule.eventsPerWeek} onChange={(e) => setSchedule('eventsPerWeek', e.target.value)} className={input} />
        </label>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Your costs</legend>
        {(Object.keys(COST_META) as (keyof CostAssumptions)[]).map((k) => {
          const m = COST_META[k]
          const own = draft.costs[k] !== OUTCOME_DEFAULTS.costs[k]
          return (
            <label key={k} className="flex flex-col gap-1 font-medium">
              <span className="flex flex-wrap items-center gap-2">
                {m.label} ({m.unit})
                <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide ${own ? 'bg-leaf-soft text-leaf' : m.placeholder ? 'bg-sun-soft text-sun' : 'bg-water-soft text-water'}`}>
                  {own ? 'Your figure' : m.placeholder ? 'Placeholder' : 'Sourced'}
                </span>
              </span>
              <input type="number" min={0} step="any" inputMode="decimal" value={Number.isNaN(draft.costs[k]) ? '' : draft.costs[k]} onChange={(e) => setCost(k, e.target.value)} className={input} />
              {!own && <span className="text-sm font-normal text-muted">{m.note}</span>}
            </label>
          )
        })}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!valid} className="btn-primary min-h-12">Save</button>
        <button type="button" className="btn-secondary min-h-12" onClick={() => { setOutcomeSettings(OUTCOME_DEFAULTS); setSaved(true) }}>Reset to defaults</button>
        <span role="status" className={valid ? 'text-leaf' : 'text-alert'}>{!valid ? 'Use numbers of 0 or more (at most 7 waterings a week).' : saved ? 'Saved.' : ''}</span>
      </div>
    </form>
  )
}

export default function Settings() {
  const { dataset, setDataset, resetDemo, weatherMode, setWeatherMode } = useFarm()
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" />

      <Card className="flex flex-wrap items-center gap-3">
        <Luke className="size-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">Help and guides</h2>
          <p className="text-muted">How-tos, sensor setup and troubleshooting. Works without signal.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#/help" className="btn-primary inline-flex min-h-12 items-center">Open Help</a>
          <a href="#/pricing" className="btn-secondary inline-flex min-h-12 items-center">Plans and pricing</a>
          <button type="button" onClick={startTour} className="btn-secondary inline-flex min-h-12 items-center gap-2">
            <Play aria-hidden className="size-5" /> Replay tour
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-bold">Farm data</h2>
        <p className="mt-1 mb-4 text-muted">The sample farm and your farm are kept completely separate. Switching never changes or mixes your data.</p>
        <Choice
          name="dataset"
          value={dataset}
          onChange={setDataset}
          options={[
            { v: 'sample', title: 'Sample farm', desc: 'A fictional farm with simulated sensors, for trying GeoViva out.' },
            { v: 'mine', title: 'My farm', desc: 'Your own field sections, sensors and readings, saved on this device.' },
          ]}
        />
        {dataset === 'sample' && (
          <button
            type="button"
            onClick={() => window.confirm('Reset the sample farm to its original state? Your own farm is not affected.') && resetDemo()}
            className="btn-secondary mt-4 inline-flex min-h-12 items-center gap-2"
          >
            <RotateCcw aria-hidden className="size-5" /> Reset sample farm
          </button>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-xl font-bold">Text alerts</h2>
        <AlertPreview />
      </Card>

      <Card>
        <h2 className="mb-4 text-xl font-bold">Farm details</h2>
        <FarmDetails />
      </Card>

      <Card>
        <h2 className="text-xl font-bold">Weather source</h2>
        <p className="mt-1 mb-4 text-muted">Used for rain and crop water use in every recommendation.</p>
        <Choice
          name="weather"
          value={weatherMode}
          onChange={setWeatherMode}
          options={[
            { v: 'sample', title: 'Sample July week', desc: 'A fixed, typical summer week. Works offline.' },
            { v: 'live', title: 'Live forecast', desc: 'Open-Meteo forecast for your farm location. Falls back to cached or sample weather offline.' },
          ]}
        />
      </Card>

      <Card>
        <h2 className="text-xl font-bold">Costs and baseline</h2>
        <p className="mt-1 mb-4 text-muted">Used for the outcomes on Reports. Defaults are rough; replace them with your own bill and pump figures. Saved on this device.</p>
        <OutcomeAssumptions />
      </Card>

      <CsvImport />
    </div>
  )
}
