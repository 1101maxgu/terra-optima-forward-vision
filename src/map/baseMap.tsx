// Shared MapLibre setup for the lazy map modules. Never import this from index.ts (keeps MapLibre out of the main bundle).
import { useEffect, useRef, useState } from 'react'
import { AttributionControl, GeolocateControl, Map as MLMap, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Layers, X } from 'lucide-react'
import { mapConfig, type Basemap, type BasemapId } from './config'
import type { LngLat } from './index'

// MapLibre 6 loads its worker from a sibling file; Vite's dep pre-bundling doesn't copy it, so point at it explicitly.
setWorkerUrl(workerUrl)

/** Map containers must use inline positioning: maplibre-gl.css sets `.maplibregl-map { position: relative }`. */
export const FILL = { position: 'absolute', inset: 0 } as const

const FAIL_LIMIT = 4 // tile errors in a row before we give up on a basemap
const IDS: BasemapId[] = ['standard', 'satellite']

export const MSG_SAT_DOWN = 'Satellite imagery unavailable — switched to standard map.'
export const MSG_STD_DOWN = 'Standard map unavailable — switched to satellite.'
export const MSG_ALL_DOWN = 'Map picture unavailable. Showing field outlines instead.'

function buildStyle(active: BasemapId): StyleSpecification {
  const src = (b: Basemap) => ({ type: 'raster' as const, tiles: b.tiles, tileSize: b.tileSize, maxzoom: b.maxzoom, attribution: b.attribution })
  return {
    version: 8,
    sources: { standard: src(mapConfig.standard), satellite: src(mapConfig.satellite) },
    layers: IDS.map((id) => ({ id: `basemap-${id}`, type: 'raster' as const, source: id, layout: { visibility: id === active ? ('visible' as const) : ('none' as const) } })),
  }
}

export interface BaseMapOptions {
  center: LngLat
  zoom: number
  initialBasemap?: BasemapId
  geolocate?: boolean
}

/**
 * Creates one MapLibre map for the lifetime of the component (StrictMode-safe: removed on unmount).
 * `map` is null until the style has loaded, so consumers can add sources/layers in an effect on [map].
 * Switching basemap only flips raster layer visibility — overlays and drawings are never dropped.
 */
export function useBaseMap({ center, zoom, initialBasemap = 'satellite', geolocate = false }: BaseMapOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [map, setMap] = useState<MLMap | null>(null)
  const [basemap, setBasemapState] = useState<BasemapId>(initialBasemap)
  const [notice, setNotice] = useState<string | null>(null)
  const current = useRef(initialBasemap)
  const fails = useRef<Record<BasemapId, number>>({ standard: 0, satellite: 0 })
  const dead = useRef(new Set<BasemapId>())
  const init = useRef({ center, zoom, geolocate }) // mount-time values only

  const show = (id: BasemapId) => {
    const m = mapRef.current
    current.current = id
    setBasemapState(id)
    if (!m) return
    for (const b of IDS) m.setLayoutProperty(`basemap-${b}`, 'visibility', b === id ? 'visible' : 'none')
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { center, zoom, geolocate } = init.current
    const m = new MLMap({
      container: el,
      style: buildStyle(current.current),
      center,
      zoom,
      maxZoom: mapConfig.maxZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: false,
    })
    mapRef.current = m
    m.touchZoomRotate.disableRotation()
    m.keyboard.disableRotation()
    m.addControl(new AttributionControl(), 'bottom-right') // responsive: compact on narrow maps, never removed
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    if (geolocate) m.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right')

    m.on('error', (e) => {
      const id = (e as { sourceId?: string }).sourceId as BasemapId | undefined
      if (!id || !IDS.includes(id)) return
      if (++fails.current[id] < FAIL_LIMIT || dead.current.has(id)) return
      dead.current.add(id)
      const other: BasemapId = id === 'standard' ? 'satellite' : 'standard'
      if (dead.current.has(other)) return setNotice(MSG_ALL_DOWN)
      if (current.current === id) {
        show(other)
        setNotice(id === 'satellite' ? MSG_SAT_DOWN : MSG_STD_DOWN)
      }
    })
    m.on('data', (e) => {
      if (e.dataType !== 'source') return
      const ev = e as { sourceId?: string; tile?: unknown }
      if (ev.tile && ev.sourceId && IDS.includes(ev.sourceId as BasemapId)) fails.current[ev.sourceId as BasemapId] = 0
    })
    m.on('load', () => setMap(m))
    return () => {
      mapRef.current = null
      setMap(null)
      m.remove()
    }
  }, [])

  const setBasemap = (id: BasemapId) => {
    if (dead.current.delete(id)) fails.current[id] = 0 // user asked to retry a failed basemap
    setNotice(null)
    show(id)
  }

  return { containerRef, map, basemap, setBasemap, notice, allDown: notice === MSG_ALL_DOWN || dead.current.size === IDS.length, dismissNotice: () => setNotice(null) }
}

export function BasemapToggle({ value, onChange, className = '' }: { value: BasemapId; onChange: (id: BasemapId) => void; className?: string }) {
  return (
    <div role="group" aria-label="Map type" className={`flex overflow-hidden rounded-xl border border-line bg-surface shadow-md ${className}`}>
      <Layers aria-hidden className="mx-2 size-5 self-center text-muted" />
      {IDS.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`min-h-11 px-3 text-sm font-semibold transition ${value === id ? 'bg-ink text-surface' : 'text-ink hover:bg-paper'}`}
        >
          {mapConfig[id].label}
        </button>
      ))}
    </div>
  )
}

export function MapNotice({ text, onClose }: { text: string | null; onClose: () => void }) {
  if (!text) return null
  return (
    <div role="status" className="absolute inset-x-3 top-16 z-10 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-sun/40 bg-sun-soft px-3 py-2 text-sm text-ink shadow-md">
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss message" className="grid size-9 place-items-center rounded-lg hover:bg-surface">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}
