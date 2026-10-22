// STUB — Agent A implements with MapLibre. Props are frozen in ./index.ts.
import type { FarmMapProps } from './index'
import MapSkeleton from './MapSkeleton'

export default function FarmMap({ className }: FarmMapProps) {
  return <MapSkeleton className={className} />
}
