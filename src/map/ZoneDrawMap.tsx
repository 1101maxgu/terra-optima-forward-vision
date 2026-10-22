// STUB — Agent A implements with MapLibre + Terra Draw. Props are frozen in ./index.ts.
import type { ZoneDrawMapProps } from './index'
import MapSkeleton from './MapSkeleton'

export default function ZoneDrawMap({ className }: ZoneDrawMapProps) {
  return <MapSkeleton className={className} />
}
