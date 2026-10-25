// Fallback when no map tiles load (no signal, blocked tile servers): each field section drawn as a simple outline,
// coloured by status, so the farm map still makes sense. Plain SVG, no map library.
import type { GeoPolygon, Zone } from '../types'
import { STATUS_HEX } from '../ui/kit'
import { shortName } from '../ui/farm'
import { bounds, polygonCenter } from './geo'
import type { FarmMapProps } from './index'

const NO_STATUS = '#9aa39e'
const W = 1000
const PAD = 40

export default function FieldOutline({ zones, statuses, onZoneClick }: { zones: Zone[]; statuses: FarmMapProps['statuses']; onZoneClick?: (id: string) => void }) {
  const drawn = zones.filter((z): z is Zone & { boundary: GeoPolygon } => !!z.boundary)
  const b = bounds(drawn.map((z) => z.boundary))
  if (!b) return null
  const [[w, s], [e, n]] = b
  const kx = Math.cos(((s + n) / 2) * (Math.PI / 180)) // shrink longitude so fields keep their shape
  const spanX = Math.max((e - w) * kx, 1e-9)
  const spanY = Math.max(n - s, 1e-9)
  const scale = (W - 2 * PAD) / Math.max(spanX, spanY)
  const H = Math.round(spanY * scale + 2 * PAD)
  const pt = ([lon, lat]: [number, number]) => [PAD + (lon - w) * kx * scale, PAD + (n - lat) * scale] as const

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 z-[5] size-full bg-paper" role="img" aria-label="Outline of your field sections">
      {drawn.map((z) => {
        const color = statuses?.[z.id] ? STATUS_HEX[statuses[z.id].status] : NO_STATUS
        const points = z.boundary.coordinates[0].map((c) => pt(c).join(',')).join(' ')
        const [cx, cy] = pt(polygonCenter(z.boundary))
        return (
          <g key={z.id} onClick={() => onZoneClick?.(z.id)} className={onZoneClick ? 'cursor-pointer' : undefined}>
            <polygon points={points} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={4} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={28} fontWeight={700} fill="#1e2a22">{shortName(z.name)}</text>
          </g>
        )
      })}
    </svg>
  )
}
