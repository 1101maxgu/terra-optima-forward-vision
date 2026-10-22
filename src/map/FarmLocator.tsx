// STUB — Agent A implements (search + current location + satellite/standard). Props are frozen in ./index.ts.
import type { FarmLocatorProps } from './index'
import MapSkeleton from './MapSkeleton'

export default function FarmLocator({ className }: FarmLocatorProps) {
  return <MapSkeleton className={className} />
}
