import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useFarm } from '../state/farmStore'
import CsvImport from '../components/CsvImport'
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

export default function Settings() {
  const { dataset, setDataset, resetDemo, weatherMode, setWeatherMode } = useFarm()
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" />

      <Card>
        <h2 className="text-xl font-bold">Farm data</h2>
        <p className="mt-1 mb-4 text-muted">The sample farm and your farm are kept completely separate. Switching never changes or mixes your data.</p>
        <Choice
          name="dataset"
          value={dataset}
          onChange={setDataset}
          options={[
            { v: 'sample', title: 'Sample farm', desc: 'A fictional farm with simulated sensors, for trying GeoViva out.' },
            { v: 'mine', title: 'My farm', desc: 'Your own zones, sensors and readings, saved on this device.' },
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

      <CsvImport />
    </div>
  )
}
