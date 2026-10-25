// Draw / edit one zone boundary with Terra Draw on MapLibre. Phases:
//   drawing  — taps add corners (drag still pans), Undo / Finish
//   done     — boundary shown, map pans freely, Edit / Start over
//   editing  — drag corners, tap a midpoint to add one, tap a corner then "Delete point"
import { useEffect, useRef, useState } from 'react'
import { Marker, type GeoJSONSource } from 'maplibre-gl'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import { Check, Eraser, Pencil, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import type { ZoneDrawMapProps } from './index'
import { BasemapToggle, FILL, MapNotice, useBaseMap } from './baseMap'
import { mapConfig } from './config'
import { areaChipText, bounds, polygonAreaM2, toGeoPolygon, validatePolygon, type AreaUnit } from './geo'
import type { GeoPolygon } from '../types'

type Phase = 'drawing' | 'done' | 'editing'
const GREEN = '#22c55e'
const TOUCH_PX = 28 // corner hit radius for "select a point"

function polygonOf(f: GeoJSONStoreFeatures | undefined): { ring: number[][]; drawing: boolean; committed: number } | null {
  if (!f || f.geometry.type !== 'Polygon' || f.properties.mode !== 'polygon') return null
  const ring = f.geometry.coordinates[0]
  const drawing = !!f.properties.currentlyDrawing
  return { ring, drawing, committed: drawing ? Number(f.properties.committedCoordinateCount ?? 0) : ring.length - 1 }
}

const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-md transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45'
const btnLight = `${btn} border border-line bg-surface text-ink hover:border-ink`
const btnDark = `${btn} bg-ink text-surface hover:bg-leaf`

export default function ZoneDrawMap({ value, onChange, center, zoom, otherZones, className = 'h-[28rem]' }: ZoneDrawMapProps) {
  const { containerRef, map, basemap, setBasemap, notice, dismissNotice } = useBaseMap({ center, zoom: zoom ?? mapConfig.defaultZoom })
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initialValue = useRef(value) // loaded once when the map mounts; afterwards Terra Draw owns the shape
  const polyRef = useRef<GeoPolygon | null>(value) // last committed polygon — survives re-renders
  const drawRef = useRef<TerraDraw | null>(null)
  const polygonModeRef = useRef<TerraDrawPolygonMode | null>(null)
  const featureId = useRef<string | number | null>(null)
  const vertexMarker = useRef<Marker | null>(null)
  const phaseRef = useRef<Phase>(value ? 'editing' : 'drawing')

  const [phase, setPhaseState] = useState<Phase>(phaseRef.current)
  const [points, setPoints] = useState(0)
  const [area, setArea] = useState<number | null>(value ? polygonAreaM2(value) : null)
  const [error, setError] = useState<string | null>(value ? validatePolygon(value) : null)
  const [unit, setUnit] = useState<AreaUnit>('ha')
  const [vertex, setVertex] = useState<number | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const setPhase = (p: Phase) => {
    phaseRef.current = p
    setPhaseState(p)
  }
  const selectVertex = (i: number | null) => {
    setVertex(i)
    vertexMarker.current?.remove()
    vertexMarker.current = null
    const ring = polyRef.current?.coordinates[0]
    if (i === null || !ring || !map) return
    const e = document.createElement('div')
    e.className = 'size-7 rounded-full border-4 border-alert bg-white/30 pointer-events-none'
    vertexMarker.current = new Marker({ element: e }).setLngLat(ring[i]).addTo(map)
  }

  const emit = (poly: GeoPolygon | null) => {
    polyRef.current = poly
    const a = poly ? polygonAreaM2(poly) : null
    const err = validatePolygon(poly)
    setArea(a)
    setError(err)
    onChangeRef.current(poly, a, err)
  }

  // Context layer: other zones, faint and non-interactive.
  useEffect(() => {
    if (!map) return
    const data = {
      type: 'FeatureCollection' as const,
      features: (otherZones ?? []).flatMap((z) => (z.boundary ? [{ type: 'Feature' as const, properties: {}, geometry: z.boundary }] : [])),
    }
    const src = map.getSource('other-zones') as GeoJSONSource | undefined
    if (src) return void src.setData(data)
    map.addSource('other-zones', { type: 'geojson', data })
    map.addLayer({ id: 'other-zones-fill', type: 'fill', source: 'other-zones', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.15 } })
    map.addLayer({ id: 'other-zones-line', type: 'line', source: 'other-zones', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } })
  }, [map, otherZones])

  // Terra Draw: created once per map.
  useEffect(() => {
    if (!map) return
    const polygonMode = new TerraDrawPolygonMode({
      pointerDistance: 30, // generous for fingers (closing on first point)
      styles: { fillColor: GREEN, fillOpacity: 0.3, outlineColor: GREEN, outlineWidth: 3, closingPointWidth: 9, closingPointColor: '#ffffff', closingPointOutlineColor: GREEN, closingPointOutlineWidth: 3 },
    })
    const selectMode = new TerraDrawSelectMode({
      pointerDistance: 30,
      allowManualDeselection: false,
      allowManualSelection: false,
      keyEvents: { deselect: null, delete: null, rotate: null, scale: null }, // never let a key wipe the whole zone
      flags: { polygon: { feature: { draggable: false, coordinates: { draggable: true, midpoints: true, deletable: true } } } },
      styles: {
        selectedPolygonColor: GREEN, selectedPolygonFillOpacity: 0.3, selectedPolygonOutlineColor: GREEN, selectedPolygonOutlineWidth: 3,
        selectionPointWidth: 9, selectionPointColor: '#ffffff', selectionPointOutlineColor: GREEN, selectionPointOutlineWidth: 3,
        midPointWidth: 6, midPointColor: GREEN, midPointOutlineColor: '#ffffff', midPointOutlineWidth: 2,
      },
    })
    const draw = new TerraDraw({ adapter: new TerraDrawMapLibreGLAdapter({ map }), modes: [polygonMode, selectMode] })
    draw.start()
    drawRef.current = draw
    polygonModeRef.current = polygonMode

    const start = polyRef.current ?? initialValue.current
    if (start) {
      const id = draw.getFeatureId()
      const res = draw.addFeatures([{ id, type: 'Feature', geometry: start, properties: { mode: 'polygon' } }])
      const b = bounds([start])
      if (b) map.fitBounds(b, { padding: 64, maxZoom: 19, duration: 0 })
      if (res[0]?.valid) {
        featureId.current = id
        draw.setMode('select')
        draw.selectFeature(id)
        setPhase('editing')
        setPoints(start.coordinates[0].length - 1)
      } else {
        draw.setMode('polygon')
        setPhase('drawing')
        setHint('The saved boundary couldn’t be loaded for editing. Draw it again.')
      }
    } else draw.setMode('polygon')

    draw.on('change', () => {
      const p = polygonOf(draw.getSnapshot().find((f) => f.properties.mode === 'polygon'))
      if (!p) {
        setPoints(0)
        setArea(null)
        return
      }
      setPoints(p.committed)
      const poly = toGeoPolygon(p.ring.slice(0, p.committed))
      setArea(poly ? polygonAreaM2(poly) : null)
    })
    draw.on('finish', (id, ctx) => {
      const p = polygonOf(draw.getSnapshotFeature(id))
      if (!p) return
      emit(toGeoPolygon(p.ring))
      if (ctx.mode === 'polygon') {
        featureId.current = id
        draw.setMode('static')
        setPhase('done')
      } else if (phaseRef.current === 'editing') selectVertex(null)
    })

    // Tap near a corner while editing → select it for "Delete point".
    const onClick = (e: { point: { x: number; y: number } }) => {
      if (phaseRef.current !== 'editing') return
      const ring = polyRef.current?.coordinates[0].slice(0, -1) ?? []
      let best: number | null = null
      let bestD = TOUCH_PX
      ring.forEach((c, i) => {
        const q = map.project(c)
        const d = Math.hypot(q.x - e.point.x, q.y - e.point.y)
        if (d < bestD) [best, bestD] = [i, d]
      })
      selectVertex(best)
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
      vertexMarker.current?.remove()
      // On unmount the base map is removed first (its effect cleans up earlier), so Terra Draw's
      // stop() hits missing sources. Nothing to clean up then — never let it crash the page.
      try {
        draw.stop()
      } catch {
        /* map already removed */
      }
      drawRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  const undo = () => polygonModeRef.current?.undo()
  const finish = () => polygonModeRef.current?.onKeyUp({ key: 'Enter', heldKeys: [], preventDefault: () => {} })
  const startOver = () => {
    const d = drawRef.current
    if (!d) return
    selectVertex(null)
    d.clear()
    featureId.current = null
    d.setMode('polygon')
    setPhase('drawing')
    setPoints(0)
    setHint(null)
    emit(null)
  }
  const edit = () => {
    const d = drawRef.current
    if (!d || featureId.current === null) return
    d.setMode('select')
    d.selectFeature(featureId.current)
    setPhase('editing')
  }
  const doneEditing = () => {
    const d = drawRef.current
    if (!d || featureId.current === null) return
    selectVertex(null)
    d.deselectFeature(featureId.current)
    d.setMode('static')
    setPhase('done')
  }
  const deletePoint = () => {
    const d = drawRef.current
    const ring = polyRef.current?.coordinates[0].slice(0, -1)
    if (!d || featureId.current === null || !ring || vertex === null) return
    if (ring.length <= 3) return setHint('A field section needs at least 3 corners. Use “Start over” to redraw it.')
    const next = toGeoPolygon(ring.filter((_, i) => i !== vertex))
    if (!next) return
    // Re-select so Terra Draw rebuilds its corner handles for the new shape.
    d.deselectFeature(featureId.current)
    d.updateFeatureGeometry(featureId.current, next)
    d.selectFeature(featureId.current)
    selectVertex(null)
    setHint(null)
    emit(next)
  }

  const instruction =
    phase === 'drawing'
      ? points === 0
        ? 'Tap the corners of your growing area to create this field section.'
        : points < 3
          ? `${points} corner${points === 1 ? '' : 's'} placed — keep tapping corners.`
          : 'Tap “Finish boundary” or tap the first corner to close the field section.'
      : phase === 'editing'
        ? 'Drag corners to move them. Tap a corner, then “Delete point” to remove it.'
        : 'Boundary finished. Move the map freely, or edit the boundary.'

  return (
    <div>
      <p className="mb-2 flex min-h-16 items-center rounded-xl bg-ink px-3 py-2 text-base sm:min-h-0 font-semibold text-surface sm:text-lg" aria-live="polite">
        {instruction}
      </p>
      <div className={`relative overflow-hidden rounded-2xl border border-line bg-stale-soft ${className}`}>
        <div ref={containerRef} style={FILL} role="application" aria-label="Field section boundary drawing map" />
        <MapNotice text={notice} onClose={dismissNotice} />

        <div className="pointer-events-none absolute top-3 left-3 z-[5] flex flex-col items-start gap-2">
          {area !== null && (
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-surface px-1.5 py-0.5 shadow-md">
              <span className="px-1 text-sm font-bold whitespace-nowrap tabular-nums text-ink sm:text-base" aria-live="polite">
                {areaChipText(area, unit)}
              </span>
              <div role="group" aria-label="Area unit" className="flex">
                {(['m2', 'ha', 'ac'] as const).map((u) => (
                  <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={`min-h-9 min-w-9 rounded-lg px-1.5 text-xs font-semibold ${unit === u ? 'bg-ink text-surface' : 'text-muted hover:bg-paper'}`}>
                    {u === 'm2' ? 'm²' : u}
                  </button>
                ))}
              </div>
            </div>
          )}
          <BasemapToggle value={basemap} onChange={setBasemap} className="pointer-events-auto" />
        </div>
      </div>

      {/* Actions live under the map so they never eat tap space on small screens. */}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {phase === 'drawing' && (
          <>
            {points > 0 && (
              <button type="button" className={btnLight} onClick={startOver}>
                <Eraser aria-hidden className="size-5" /> Clear
              </button>
            )}
            <button type="button" className={btnLight} onClick={undo} disabled={points === 0}>
              <Undo2 aria-hidden className="size-5" /> Undo last point
            </button>
            <button type="button" className={btnDark} onClick={finish} disabled={points < 3}>
              <Check aria-hidden className="size-5" /> Finish boundary
            </button>
          </>
        )}
        {phase === 'done' && (
          <>
            <button type="button" className={btnLight} onClick={startOver}>
              <RotateCcw aria-hidden className="size-5" /> Start over
            </button>
            <button type="button" className={btnDark} onClick={edit}>
              <Pencil aria-hidden className="size-5" /> Edit boundary
            </button>
          </>
        )}
        {phase === 'editing' && (
          <>
            <button type="button" className={btnLight} onClick={startOver}>
              <Eraser aria-hidden className="size-5" /> Clear / Start over
            </button>
            <button type="button" className={btnLight} onClick={deletePoint} disabled={vertex === null}>
              <Trash2 aria-hidden className="size-5" /> Delete point
            </button>
            <button type="button" className={btnDark} onClick={doneEditing}>
              <Check aria-hidden className="size-5" /> Done editing
            </button>
          </>
        )}
      </div>
      {(hint || (error && phase !== 'drawing')) && (
        <p role="alert" className="mt-2 rounded-xl border border-alert/30 bg-alert-soft px-3 py-2 text-sm font-semibold text-alert">
          {hint ?? error}
        </p>
      )}
      <p className="mt-2 text-sm text-muted">
        A field section is a management area — it doesn’t have to be a whole field.
        {phase === 'editing' && ' Tap the small dot in the middle of an edge to add a corner there.'}
      </p>
    </div>
  )
}
