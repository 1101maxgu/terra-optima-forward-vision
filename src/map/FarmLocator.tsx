// Find the farm: Nominatim search (Canada), optional device location, satellite by default.
// The pin marks the map centre; every pan/zoom reports { center, zoom }.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LocateFixed, MapPin, Search } from 'lucide-react'
import type { FarmLocatorProps } from './index'
import { BasemapToggle, FILL, MapNotice, useBaseMap } from './baseMap'
import { searchPlaces, type Place } from './geocode'

const PAUSE_MS = 600

const GEO_ERRORS: Record<number, string> = {
  1: 'Location permission was denied. You can still search for your farm above.',
  2: 'Your location isn’t available right now. Try searching for your farm instead.',
  3: 'Finding your location took too long. Try again, or search for your farm instead.',
}

export default function FarmLocator({ value, onChange, className = 'h-[30rem]' }: FarmLocatorProps) {
  const { containerRef, map, basemap, setBasemap, notice, dismissNotice } = useBaseMap({ center: value.center, zoom: value.zoom })
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const pendingLabel = useRef<string | undefined>(undefined)
  const abort = useRef<AbortController | null>(null)
  const lastQuery = useRef('')

  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!map) return
    let last = ''
    const onMoveEnd = () => {
      const c = map.getCenter()
      const zoom = Math.round(map.getZoom() * 100) / 100
      const key = `${c.lng.toFixed(6)},${c.lat.toFixed(6)},${zoom}`
      if (key === last) return // e.g. a resize-only moveend: nothing moved, keep the parent's label
      last = key
      const label = pendingLabel.current
      pendingLabel.current = undefined
      onChangeRef.current({ center: [c.lng, c.lat], zoom, ...(label ? { label } : {}) })
    }
    map.on('moveend', onMoveEnd)
    return () => void map.off('moveend', onMoveEnd)
  }, [map])

  const run = async (query: string) => {
    const t = query.trim()
    if (t.length < 3 || t.toLowerCase() === lastQuery.current) return
    lastQuery.current = t.toLowerCase()
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setBusy(true)
    setMsg(null)
    try {
      const r = await searchPlaces(t, ac.signal)
      if (ac.signal.aborted) return
      setResults(r)
      if (!r.length) setMsg(`No places found for “${t}”. Try a road name, town or postal code.`)
    } catch (e) {
      if (ac.signal.aborted || (e as Error).name === 'AbortError') return
      lastQuery.current = '' // allow retry
      setResults(null)
      setMsg('Search isn’t available right now (check your connection). You can still pan and zoom the map to your farm.')
    } finally {
      if (abort.current === ac) setBusy(false)
    }
  }

  // Search after a pause in typing (no per-keystroke autocomplete).
  useEffect(() => {
    if (q.trim().length < 3) return
    const t = setTimeout(() => void run(q), PAUSE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => () => abort.current?.abort(), [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim().length < 3) return setMsg('Type at least 3 letters to search.')
    lastQuery.current = '' // explicit submit always searches (cached results are free)
    void run(q)
  }

  const pick = (p: Place) => {
    setResults(null)
    setMsg(null)
    setQ(p.label)
    lastQuery.current = p.label.toLowerCase()
    pendingLabel.current = p.label
    onChangeRef.current({ center: p.center, zoom: map?.getZoom() ?? value.zoom, label: p.label })
    if (!map) return
    const [[w, s], [e, n]] = p.bbox ?? [p.center, p.center]
    if (p.bbox && (e - w > 0.002 || n - s > 0.002)) map.fitBounds(p.bbox, { padding: 32, maxZoom: 17 })
    else map.flyTo({ center: p.center, zoom: 17 })
  }

  const locate = () => {
    if (!('geolocation' in navigator)) return setMsg('This device can’t share its location. Search for your farm instead.')
    setLocating(true)
    setMsg(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        pendingLabel.current = 'My current location'
        map?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 17 })
      },
      (err) => {
        setLocating(false)
        setMsg(GEO_ERRORS[err.code] ?? GEO_ERRORS[2])
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="relative flex flex-wrap gap-2">
        <form onSubmit={submit} role="search" className="flex min-w-0 flex-1 basis-64 gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search address or place</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search address, road or town…"
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-base text-ink placeholder:text-muted"
            />
          </label>
          <button type="submit" className="btn-primary min-h-11 rounded-xl" disabled={busy}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </form>
        <button type="button" onClick={locate} disabled={locating} className="btn-secondary inline-flex min-h-11 items-center gap-2 rounded-xl">
          <LocateFixed aria-hidden className="size-5" /> {locating ? 'Finding you…' : 'Use my current location'}
        </button>

        {results && results.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-surface shadow-lg" aria-label="Search results">
            {results.map((p) => (
              <li key={`${p.center[0]},${p.center[1]},${p.label}`}>
                <button type="button" onClick={() => pick(p)} className="flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-paper">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-leaf" />
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {msg && (
        <p role="status" className="rounded-xl border border-sun/40 bg-sun-soft px-3 py-2 text-sm text-ink">
          {msg}
        </p>
      )}

      <div className="relative min-h-64 flex-1 overflow-hidden rounded-2xl border border-line bg-stale-soft">
        <div ref={containerRef} style={FILL} role="region" aria-label="Farm location map. Move the map so the pin is on your farm." />
        <MapNotice text={notice} onClose={dismissNotice} />
        <MapPin aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-[5] size-10 -translate-x-1/2 -translate-y-full fill-alert text-white drop-shadow-lg" />
        <BasemapToggle value={basemap} onChange={setBasemap} className="absolute top-3 left-3 z-10" />
      </div>
      <p className="text-xs text-muted">Search by © OpenStreetMap Nominatim. Move the map so the pin sits on your farm.</p>
    </div>
  )
}
