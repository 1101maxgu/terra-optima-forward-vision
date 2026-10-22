import type { CropId, IrrigationMethod, ScenarioOverrides, SoilId } from '../types'
import { CROPS } from '../data/crops'
import { SOILS } from '../data/soils'
import { useFarm } from '../state/farmStore'

export const PRESETS: { label: string; o: ScenarioOverrides }[] = [
  { label: 'Hot dry week', o: { moisture: 0.16, rainNext48hMm: 0, et0Mm: 6.5 } },
  { label: 'Rain incoming', o: { rainNext48hMm: 18 } },
  { label: 'Saturated soil', o: { moisture: 0.4 } },
]

export default function ScenarioControls({ zoneId }: { zoneId: string }) {
  const { zones, overrides, latestReading, weather, setOverride, updateZone, applyPresetToAll, clearOverrides } = useFarm()
  const zone = zones.find((z) => z.id === zoneId) ?? zones[0]
  const ov = overrides[zone.id] ?? {}
  const baseRain = weather.days.slice(0, 2).reduce((s, d) => s + d.rainMm, 0)
  const baseEt0 = weather.days[0]?.et0Mm ?? 0
  const anyOverride = Object.values(overrides).some((o) => o && Object.values(o).some((v) => v !== undefined))

  return (
    <section aria-labelledby="ctrl-h" className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-6">
      <header className="flex items-baseline justify-between gap-2">
        <h2 id="ctrl-h" className="font-serif text-2xl tracking-tight">
          What if…
        </h2>
        <span className="text-sm text-muted">Scenario for {zone.name}</span>
      </header>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Presets · all zones</legend>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => applyPresetToAll(p.o)} className="btn-secondary">
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Slider
        id="sl-moist"
        label="Soil moisture"
        min={5}
        max={45}
        step={1}
        unit="%"
        value={Math.round((ov.moisture ?? latestReading(zone.id)?.moisture ?? 0.25) * 100)}
        overridden={ov.moisture !== undefined}
        onChange={(v) => setOverride(zone.id, { moisture: v / 100 })}
      />
      <Slider
        id="sl-rain"
        label="Rain next 48 h"
        min={0}
        max={30}
        step={1}
        unit=" mm"
        value={Math.round(ov.rainNext48hMm ?? baseRain)}
        overridden={ov.rainNext48hMm !== undefined}
        onChange={(v) => setOverride(zone.id, { rainNext48hMm: v })}
      />
      <Slider
        id="sl-et0"
        label="ET₀ (evaporative demand)"
        min={1}
        max={8}
        step={0.1}
        unit=" mm/day"
        value={Number((ov.et0Mm ?? baseEt0).toFixed(1))}
        overridden={ov.et0Mm !== undefined}
        onChange={(v) => setOverride(zone.id, { et0Mm: v })}
      />

      <div className="grid grid-cols-3 gap-3">
        <Select label="Crop" value={zone.cropId} onChange={(v) => updateZone(zone.id, { cropId: v as CropId })} options={Object.values(CROPS).map((c) => [c.id, c.name])} />
        <Select label="Soil" value={zone.soilId} onChange={(v) => updateZone(zone.id, { soilId: v as SoilId })} options={Object.values(SOILS).map((s) => [s.id, s.name])} />
        <Select
          label="Method"
          value={zone.method}
          onChange={(v) => updateZone(zone.id, { method: v as IrrigationMethod })}
          options={[
            ['drip', 'Drip'],
            ['sprinkler', 'Sprinkler'],
          ]}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{anyOverride ? 'Scenario values are simulated.' : 'Showing sample readings and forecast.'}</span>
        <button type="button" onClick={() => clearOverrides()} disabled={!anyOverride} className="font-medium text-water underline underline-offset-4 disabled:text-muted disabled:no-underline">
          Clear overrides
        </button>
      </div>
    </section>
  )
}

function Slider(props: { id: string; label: string; min: number; max: number; step: number; unit: string; value: number; overridden: boolean; onChange: (v: number) => void }) {
  const { id, label, min, max, step, unit, value, overridden, onChange } = props
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <span className="text-xl font-semibold tabular-nums">
          {value}
          {unit}
          {overridden && <span className="ml-2 text-xs font-semibold tracking-wide text-sun uppercase">what-if</span>}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full" />
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[][] }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-2 text-base">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
