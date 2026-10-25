import { Suspense, useState } from 'react'
import { ChevronRight, List, Map as MapIcon, MapPin, Plus, Radio, Search, X } from 'lucide-react'
import Luke from '../guide/Luke'
import PlanNudge from '../components/billing/PlanNudge'
import { openLuke } from '../guide/LukeChat'
import { useFarm } from '../state/farmStore'
import type { CropId, FarmerStatus, Zone } from '../types'
import { FarmMap, MapSkeleton } from '../map'
import { CROPS } from '../data/crops'
import { SOILS } from '../data/soils'
import { Card, FreshnessText, PageHeader, STATUS, StatusPill, fmtPct } from '../ui/kit'
import { CROP_EMOJI, STATUS_RANK } from '../ui/farm'
import { useUnits } from '../ui/units'

const select = 'h-12 rounded-xl border border-line bg-surface px-3'

function NoBoundary({ z }: { z: Zone }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-sm">
      <span className="text-stale">Map boundary not set</span>
      <a href={`#/zones/${z.id}/boundary`} className="font-semibold text-leaf underline underline-offset-4">
        Add boundary
      </a>
    </span>
  )
}

export default function Zones() {
  const u = useUnits()
  const { farm, zones, sensors, zoneStatus, limits } = useFarm()
  const atZoneLimit = limits?.zones != null && zones.length >= limits.zones
  const [view, setView] = useState<'list' | 'map'>('list')
  const [q, setQ] = useState('')
  const [crop, setCrop] = useState<CropId | ''>('')
  const [status, setStatus] = useState<FarmerStatus | ''>('')
  const [selected, setSelected] = useState<string | null>(null)

  const rows = zones
    .map((z) => ({ z, st: zoneStatus(z.id) }))
    .filter(({ z, st }) => (!q || z.name.toLowerCase().includes(q.trim().toLowerCase())) && (!crop || z.cropId === crop) && (!status || st.status === status))
    .sort((a, b) => STATUS_RANK[a.st.status] - STATUS_RANK[b.st.status] || a.z.name.localeCompare(b.z.name))
  const crops = [...new Set(zones.map((z) => z.cropId))]
  const sel = rows.find((r) => r.z.id === selected)

  const create = (
    <a href="#/zones/new" className="btn-primary inline-flex min-h-12 items-center gap-2">
      <Plus aria-hidden className="size-5" /> Create new field section
    </a>
  )

  if (zones.length === 0)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="My field sections" help="zones" />
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Luke className="size-16" />
          <h2 className="text-xl font-bold">No field sections yet</h2>
          <p className="max-w-md text-muted">A field section is one field or bed with the same crop, soil and watering method. Draw it on the map and GeoViva starts giving you watering advice.</p>
          {create}
          <button type="button" onClick={() => openLuke('How do I create my first field section?')} className="min-h-11 font-semibold text-water underline">
            Not sure where to start? Ask Luke
          </button>
        </Card>
      </div>
    )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="My field sections" subtitle={`${zones.length} field section${zones.length === 1 ? '' : 's'} on ${farm.name || 'your farm'}`} actions={atZoneLimit ? undefined : create} help="zones" />
      {atZoneLimit && <PlanNudge>{`You’re using all ${limits?.zones} field sections on the Free plan. Get the Season plan to add more.`}</PlanNudge>}

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="View" className="flex rounded-xl border border-line bg-surface p-1">
          {(['list', 'map'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 font-semibold ${view === v ? 'bg-forest text-white' : 'text-muted'}`}
            >
              {v === 'list' ? <List aria-hidden className="size-5" /> : <MapIcon aria-hidden className="size-5" />}
              {v === 'list' ? 'List' : 'Map'}
            </button>
          ))}
        </div>
        <label className="flex h-12 min-w-0 flex-1 basis-56 items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <Search aria-hidden className="size-5 text-muted" />
          <span className="sr-only">Search field sections</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search field sections" className="w-full bg-transparent outline-none" />
        </label>
        <label className="sr-only" htmlFor="crop-f">
          Crop
        </label>
        <select id="crop-f" value={crop} onChange={(e) => setCrop(e.target.value as CropId | '')} className={`${select} flex-1 sm:flex-none`}>
          <option value="">All crops</option>
          {crops.map((c) => (
            <option key={c} value={c}>
              {CROPS[c].name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="status-f">
          Status
        </label>
        <select id="status-f" value={status} onChange={(e) => setStatus(e.target.value as FarmerStatus | '')} className={`${select} flex-1 sm:flex-none`}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS) as FarmerStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label}
            </option>
          ))}
        </select>
      </div>

      {view === 'map' ? (
        <div className="relative">
          <Suspense fallback={<MapSkeleton className="h-[60vh] min-h-80" />}>
            <FarmMap
              zones={rows.map((r) => r.z)}
              statuses={Object.fromEntries(rows.map(({ z, st }) => [z.id, { status: st.status, label: fmtPct(st.moisturePct) }]))}
              sensors={sensors}
              selectedZoneId={selected}
              onZoneClick={setSelected}
              fallbackCenter={[farm.lon, farm.lat]}
              className="h-[60vh] min-h-80"
            />
          </Suspense>
          {sel ? (
            <Card as="div" className="absolute inset-x-3 bottom-3 z-10 shadow-lg sm:right-auto sm:w-96">
              <div className="flex items-start gap-3">
                <span aria-hidden className="text-3xl">
                  {CROP_EMOJI[sel.z.cropId]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-bold">{sel.z.name}</div>
                  <div className="text-muted">
                    {CROPS[sel.z.cropId].name} · {u.area(sel.z.areaM2)} · {fmtPct(sel.st.moisturePct)} moisture
                  </div>
                </div>
                <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="grid size-10 place-items-center rounded-lg hover:bg-paper">
                  <X aria-hidden className="size-5" />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <StatusPill status={sel.st.status} />
                <a href={`#/zones/${sel.z.id}`} className="btn-primary inline-flex min-h-11 items-center gap-1">
                  View details <ChevronRight aria-hidden className="size-4" />
                </a>
              </div>
            </Card>
          ) : (
            <p className="mt-2 text-muted">Tap a field section on the map to see its summary.</p>
          )}
          {rows.some((r) => !r.z.boundary) && (
            <p className="mt-2 text-sm text-stale">
              {rows.filter((r) => !r.z.boundary).length} field section(s) have no map boundary yet and are not shown. Switch to List to add boundaries.
            </p>
          )}
        </div>
      ) : rows.length === 0 ? (
        <Card className="text-center text-muted">No field sections match these filters.</Card>
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map(({ z, st }) => (
              <li key={z.id}>
                <Card as="article" className="flex flex-col gap-2">
                  <a href={`#/zones/${z.id}`} className="flex items-start gap-3">
                    <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-paper text-2xl">
                      {CROP_EMOJI[z.cropId]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-bold">{z.name}</span>
                      <span className="block text-muted">
                        {CROPS[z.cropId].name} · {u.area(z.areaM2)}
                      </span>
                    </span>
                    <span className="text-2xl font-bold tabular-nums">{fmtPct(st.moisturePct)}</span>
                  </a>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={st.status} />
                    <span className="inline-flex items-center gap-1 text-sm text-muted">
                      <Radio aria-hidden className="size-4" /> {st.sensors.length} sensor{st.sensors.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="text-sm">
                    <FreshnessText freshness={st.freshness} lastUpdate={st.lastUpdate} />
                  </div>
                  {!z.boundary && <NoBoundary z={z} />}
                </Card>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
            <table className="w-full text-left">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Field section</th>
                  <th className="px-3 py-3 font-medium">Soil · method</th>
                  <th className="px-3 py-3 font-medium">Moisture</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Sensors</th>
                  <th className="px-3 py-3 font-medium">Last update</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ z, st }) => (
                  <tr key={z.id} className="align-middle hover:bg-paper">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-xl">
                          {CROP_EMOJI[z.cropId]}
                        </span>
                        <div>
                          <a href={`#/zones/${z.id}`} className="font-semibold hover:underline">
                            {z.name}
                          </a>
                          <div className="text-sm text-muted">
                            {CROPS[z.cropId].name} · {u.area(z.areaM2)}
                          </div>
                          {!z.boundary && <NoBoundary z={z} />}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {SOILS[z.soilId].name}
                      <div className="text-muted capitalize">{z.method}</div>
                    </td>
                    <td className="px-3 py-3 text-lg font-bold tabular-nums">{fmtPct(st.moisturePct)}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={st.status} />
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Radio aria-hidden className="size-4 text-muted" /> {st.sensors.length}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <FreshnessText freshness={st.freshness} lastUpdate={st.lastUpdate} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <a href={`#/zones/${z.id}`} className="inline-flex min-h-10 items-center gap-1 font-semibold text-leaf">
                        Details <ChevronRight aria-hidden className="size-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {view === 'list' && rows.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <MapPin aria-hidden className="size-4" /> Sorted by urgency: field sections that need water or a sensor check come first.
        </p>
      )}
    </div>
  )
}
