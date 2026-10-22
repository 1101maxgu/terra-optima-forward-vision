// Route: #/zones/:id/boundary — add or redraw a zone boundary (incl. legacy zones without one).
import { Suspense, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { GeoPolygon } from '../types'
import { useFarm } from '../state/farmStore'
import { navigate } from '../router'
import { MapSkeleton, ZoneDrawMap } from '../map'
import { formatArea, polygonCenter, validatePolygon } from '../map/geo'
import { ConfirmDialog, ErrorNote } from '../ui/controls'
import { errMsg } from '../components/sensors/SensorConnect'

/** Area changes beyond this share ask for confirmation before saving. */
export const BIG_AREA_CHANGE = 0.25

export default function EditBoundary({ zoneId }: { zoneId: string }) {
  const { loading, loadError, reload, zones } = useFarm()
  const zone = zones.find((z) => z.id === zoneId)
  if (loadError)
    return (
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <ErrorNote>Could not load your farm: {loadError}</ErrorNote>
        <button type="button" className="btn-primary min-h-11" onClick={reload}>Retry</button>
      </div>
    )
  if (loading) return <p className="flex items-center gap-2 p-6 text-muted"><Loader2 aria-hidden className="size-5 animate-spin" /> Loading…</p>
  if (!zone)
    return (
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <p className="text-lg font-semibold">This zone no longer exists.</p>
        <a className="btn-secondary inline-flex min-h-11 items-center" href="#/zones">Back to zones</a>
      </div>
    )
  return <Editor key={zone.id} zoneId={zone.id} />
}

function Editor({ zoneId }: { zoneId: string }) {
  const { zones, farm, updateZone } = useFarm()
  const zone = zones.find((z) => z.id === zoneId)!
  const [initial] = useState<GeoPolygon | null>(zone.boundary ?? null)
  const [center] = useState<[number, number]>(() => (initial ? polygonCenter(initial) : [farm.lon, farm.lat]))
  const [draft, setDraft] = useState<{ polygon: GeoPolygon | null; area: number | null; error: string | null }>({ polygon: initial, area: null, error: null })
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = !validatePolygon(draft.polygon) && draft.area !== null
  const changed = draft.polygon !== initial
  const back = () => navigate(`/zones/${zoneId}`)
  const ratio = valid && zone.areaM2 > 0 ? Math.abs(draft.area! - zone.areaM2) / zone.areaM2 : 0

  const save = async () => {
    setConfirm(false)
    setSaving(true)
    setError(null)
    try {
      await updateZone(zoneId, { boundary: draft.polygon, areaM2: Math.round(draft.area!), updatedAt: new Date().toISOString() })
      back()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col">
      <div className="space-y-3 px-4 pt-4 pb-6 sm:px-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={back} aria-label="Back to zone" className="-ml-2 grid size-11 place-items-center rounded-full hover:bg-stale-soft">
            <ArrowLeft aria-hidden className="size-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{initial ? 'Edit boundary' : 'Draw boundary'}</h1>
            <p className="text-muted">{zone.name}</p>
          </div>
        </div>
        <p className="text-muted">
          {initial ? 'Drag the corners to adjust the boundary.' : 'Tap each corner of the area, then tap the first corner to close it.'} A zone is a management area — it doesn't have to be a whole field.
        </p>
        <Suspense fallback={<MapSkeleton className="h-[60vh] min-h-80" />}>
          <ZoneDrawMap className="h-[60vh] min-h-80 lg:h-[65vh]" value={initial} center={center} zoom={initial ? undefined : 16}
            otherZones={zones.filter((z) => z.id !== zoneId)} onChange={(polygon, area, err) => setDraft({ polygon, area, error: err })} />
        </Suspense>
        <div aria-live="polite" className="space-y-2">
          {draft.error && <ErrorNote>{draft.error}</ErrorNote>}
          <p>
            <span className="text-muted">Area: </span>
            <span className="font-semibold">{valid ? formatArea(draft.area!) : zone.areaM2 ? formatArea(zone.areaM2) : '—'}</span>
            {valid && changed && zone.areaM2 > 0 && <span className="text-muted"> (was {formatArea(zone.areaM2)})</span>}
          </p>
        </div>
        {error && <ErrorNote>Could not save the boundary: {error} Your drawing is kept — press Retry.</ErrorNote>}
      </div>
      <div className="sticky bottom-0 z-10 mt-auto border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl gap-3">
          <button type="button" onClick={back} className="min-h-12 flex-1 rounded-lg border-2 border-line bg-surface px-4 font-semibold hover:border-ink sm:flex-none sm:px-8">Cancel</button>
          <button type="button" disabled={!valid || !changed || saving} onClick={() => (ratio > BIG_AREA_CHANGE ? setConfirm(true) : save())}
            className="min-h-12 flex-[2] rounded-lg bg-forest px-4 font-semibold text-surface hover:bg-forest-2 disabled:opacity-50 sm:ml-auto sm:flex-none sm:px-8">
            {saving ? 'Saving…' : error ? 'Retry' : 'Save boundary'}
          </button>
        </div>
      </div>
      <ConfirmDialog open={confirm} title="Big change in area" confirmLabel="Save new boundary" onCancel={() => setConfirm(false)} onConfirm={save}
        body={<>The zone area changes from <b>{formatArea(zone.areaM2)}</b> to <b>{valid ? formatArea(draft.area!) : '—'}</b>. Watering amounts in litres will change to match. Save anyway?</>} />
    </div>
  )
}
