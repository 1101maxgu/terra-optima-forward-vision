// Read-only farm map: zone boundaries coloured + labelled by status, sensors as markers. Map is created once;
// prop changes only call setData / move DOM markers.
import { useEffect, useRef } from 'react'
import { Marker, Popup, type GeoJSONSource } from 'maplibre-gl'
import type { FarmMapProps } from './index'
import { BasemapToggle, FILL, MapNotice, useBaseMap } from './baseMap'
import { mapConfig } from './config'
import FieldOutline from './FieldOutline'
import { bounds, polygonCenter } from './geo'
import { STATUS, STATUS_HEX, timeAgo } from '../ui/kit'
import type { GeoPolygon } from '../types'

const NO_STATUS = '#9aa39e'
const STATUS_SYMBOL = { 'water-today': '!', 'water-soon': '◔', 'no-water': '✓', 'check-sensor': '?' } as const

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text // textContent only: names are user-entered
  return e
}

export default function FarmMap(props: FarmMapProps) {
  const { zones, statuses, sensors, selectedZoneId = null, fallbackCenter, fit = 'all', className = 'h-80' } = props
  const cb = useRef(props)
  cb.current = props
  const { containerRef, map, basemap, setBasemap, notice, allDown, dismissNotice } = useBaseMap({ center: fallbackCenter, zoom: mapConfig.defaultZoom, geolocate: true })
  const labelMarkers = useRef<Marker[]>([])
  const sensorMarkers = useRef<Marker[]>([])
  const fitted = useRef(false)

  // One-time overlay setup.
  useEffect(() => {
    if (!map) return
    if (!map.getSource('zones')) {
      map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'selected'], 0.5, 0.32] } })
      map.addLayer({ id: 'zones-halo', type: 'line', source: 'zones', paint: { 'line-color': '#ffffff', 'line-opacity': 0.85, 'line-width': ['case', ['get', 'selected'], 7, 4] } })
      map.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 4, 2] } })
    }
    const onMarker = (e: { originalEvent: MouseEvent }) => !!(e.originalEvent.target as Element | null)?.closest?.('.maplibregl-marker, .maplibregl-popup')
    const onZone = (e: { features?: { properties: Record<string, unknown> }[]; originalEvent: MouseEvent }) => {
      if (onMarker(e)) return // sensor taps open their popup only
      const id = e.features?.[0]?.properties.id
      if (typeof id === 'string') cb.current.onZoneClick?.(id)
    }
    const onMap = (e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }) => {
      if (onMarker(e)) return // marker taps aren't map taps
      cb.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat])
    }
    const enter = () => (map.getCanvas().style.cursor = cb.current.onZoneClick ? 'pointer' : '')
    const leave = () => (map.getCanvas().style.cursor = '')
    map.on('click', 'zones-fill', onZone)
    map.on('click', onMap)
    map.on('mouseenter', 'zones-fill', enter)
    map.on('mouseleave', 'zones-fill', leave)
    return () => {
      map.off('click', 'zones-fill', onZone)
      map.off('click', onMap)
      map.off('mouseenter', 'zones-fill', enter)
      map.off('mouseleave', 'zones-fill', leave)
    }
  }, [map])

  // Zones + labels.
  useEffect(() => {
    if (!map) return
    const drawn = zones.filter((z): z is typeof z & { boundary: GeoPolygon } => !!z.boundary)
    ;(map.getSource('zones') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: drawn.map((z) => {
        const s = statuses?.[z.id]
        return { type: 'Feature', properties: { id: z.id, color: s ? STATUS_HEX[s.status] : NO_STATUS, selected: z.id === selectedZoneId }, geometry: z.boundary }
      }),
    })
    labelMarkers.current.forEach((m) => m.remove())
    labelMarkers.current = drawn.map((z) => {
      const s = statuses?.[z.id]
      const color = s ? STATUS_HEX[s.status] : NO_STATUS
      const b = el('button', `flex max-w-44 items-center gap-1.5 rounded-lg border-2 bg-white/95 px-2 py-1 text-left text-xs leading-tight text-ink shadow ${z.id === selectedZoneId ? 'ring-2 ring-ink' : ''}`)
      b.type = 'button'
      b.style.borderColor = color
      const sym = el('span', 'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white', s ? STATUS_SYMBOL[s.status] : '–')
      sym.style.background = color
      sym.setAttribute('aria-hidden', 'true')
      const txt = el('span', 'min-w-0')
      txt.append(el('span', 'block truncate font-semibold', z.name), el('span', 'block truncate', s ? `${s.label} · ${STATUS[s.status].label}` : 'No status yet'))
      b.append(sym, txt)
      b.setAttribute('aria-label', `${z.name}: ${s ? `${STATUS[s.status].label}, ${s.label}` : 'no status yet'}`)
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        cb.current.onZoneClick?.(z.id)
      })
      // Tag sits on the zone's north edge so it doesn't cover sensors placed inside the zone.
      const top = Math.max(...z.boundary.coordinates[0].map((c) => c[1]))
      return new Marker({ element: b, anchor: 'bottom', offset: [0, 4] }).setLngLat([polygonCenter(z.boundary)[0], top]).addTo(map)
    })
  }, [map, zones, statuses, selectedZoneId])

  // Sensors.
  useEffect(() => {
    if (!map) return
    sensorMarkers.current.forEach((m) => m.remove())
    sensorMarkers.current = (sensors ?? [])
      .filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number')
      .map((s) => {
        const dot = el('button', 'flex items-center gap-1 rounded-full bg-transparent p-0')
        dot.type = 'button'
        dot.setAttribute('aria-label', `Sensor ${s.name}`)
        const c = el('span', 'block size-4 rounded-full border-[3px] border-white bg-water shadow')
        dot.append(c, el('span', 'rounded bg-white/90 px-1 text-[11px] font-semibold text-ink shadow', s.name))
        const body = el('div', 'text-sm text-ink')
        body.append(
          el('p', 'font-semibold', s.name),
          el('p', '', `Depth ${s.depthCm} cm`),
          el('p', '', s.batteryPercent === undefined ? 'Battery unknown' : `Battery ${Math.round(s.batteryPercent)}%`),
          el('p', 'text-muted', s.lastSeen ? `Last seen ${timeAgo(s.lastSeen)}` : 'Not seen yet'),
        )
        return new Marker({ element: dot, anchor: 'left', offset: [-8, 0] })
          .setLngLat([s.lon!, s.lat!])
          .setPopup(new Popup({ offset: 14, closeButton: true }).setDOMContent(body))
          .addTo(map)
      })
  }, [map, sensors])

  useEffect(() => () => [...labelMarkers.current, ...sensorMarkers.current].forEach((m) => m.remove()), [])

  // Framing: only when the set of boundaries / selection / fit mode changes, not on status updates.
  const boundaryKey = zones.map((z) => (z.boundary ? z.id : '')).join('|')
  useEffect(() => {
    if (!map) return
    const sel = zones.find((z) => z.id === selectedZoneId)?.boundary
    const polys = fit === 'selected' && sel ? [sel] : zones.flatMap((z) => (z.boundary ? [z.boundary] : []))
    const b = bounds(polys)
    const duration = fitted.current ? 600 : 0
    fitted.current = true
    if (b) map.fitBounds(b, { padding: { top: 104, bottom: 40, left: 40, right: 64 }, maxZoom: 18, duration })
    else map.jumpTo({ center: cb.current.fallbackCenter, zoom: mapConfig.defaultZoom })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fit, fit === 'selected' ? selectedZoneId : null, boundaryKey])

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line bg-stale-soft ${className}`}>
      <div ref={containerRef} style={FILL} role="region" aria-label="Farm map" />
      {allDown && <FieldOutline zones={zones} statuses={statuses} onZoneClick={(id) => cb.current.onZoneClick?.(id)} />}
      <MapNotice text={notice} onClose={dismissNotice} />
      {!allDown && <BasemapToggle value={basemap} onChange={setBasemap} className="absolute top-3 left-3 z-10" />}
    </div>
  )
}
