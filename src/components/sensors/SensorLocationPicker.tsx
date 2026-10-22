// Place a sensor on the map: phone GPS, tap on the map, or clear. Never reassigns the sensor's zone.
import { Suspense, useState } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import type { Sensor } from '../../types'
import { useFarm } from '../../state/farmStore'
import { FarmMap, MapSkeleton, type LngLat } from '../../map'
import { pointInPolygon } from '../../map/geo'
import { ErrorNote } from '../../ui/controls'
import { errMsg } from './SensorConnect'

export default function SensorLocationPicker({ sensor, onDone }: { sensor: Sensor; onDone: () => void }) {
  const { zones, farm, saveSensor } = useFarm()
  const zone = zones.find((z) => z.id === sensor.zoneId) ?? null
  const [point, setPoint] = useState<LngLat | null>(sensor.lon !== undefined && sensor.lat !== undefined ? [sensor.lon, sensor.lat] : null)
  const [locating, setLocating] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const outside = point && zone?.boundary ? !pointInPolygon(point[0], point[1], zone.boundary) : false

  const useGps = () => {
    if (!('geolocation' in navigator)) return setGpsError('This device cannot share its location. Tap the map instead.')
    setLocating(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (p) => { setPoint([p.coords.longitude, p.coords.latitude]); setLocating(false) },
      (e) => {
        setLocating(false)
        setGpsError(e.code === e.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location for this site in your browser settings, or tap the map instead.'
          : 'Could not get your location. Try again outdoors, or tap the map instead.')
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const save = async (p: LngLat | null) => {
    setSaving(true)
    setError(null)
    try {
      await saveSensor({ ...sensor, lon: p?.[0], lat: p?.[1] })
      onDone()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={useGps} disabled={locating} className="btn-secondary flex min-h-12 w-full items-center justify-center gap-2">
        <LocateFixed aria-hidden className="size-5" /> {locating ? 'Finding your location…' : 'Use my current location'}
      </button>
      <p className="text-sm text-muted">Standing next to the sensor? Use your phone's location. Or tap the sensor's spot on the map.</p>
      {gpsError && <ErrorNote>{gpsError}</ErrorNote>}
      <Suspense fallback={<MapSkeleton className="h-64" />}>
        <FarmMap
          className="h-64 sm:h-80"
          zones={zone ? [zone] : zones}
          sensors={point ? [{ ...sensor, lon: point[0], lat: point[1] }] : []}
          selectedZoneId={zone?.id ?? null}
          fit={zone ? 'selected' : 'all'}
          fallbackCenter={point ?? [farm.lon, farm.lat]}
          onMapClick={setPoint}
        />
      </Suspense>
      {point && (
        <p className="flex items-center gap-2 text-sm">
          <MapPin aria-hidden className="size-4 text-water" /> {point[1].toFixed(6)}, {point[0].toFixed(6)}
        </p>
      )}
      {outside && <ErrorNote>Sensor location appears outside this zone. Check the spot, or move the sensor to another zone from its menu.</ErrorNote>}
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {(sensor.lat !== undefined || point) && (
          <button type="button" className="btn-secondary min-h-11" disabled={saving} onClick={() => save(null)}>Clear location</button>
        )}
        <button type="button" className="btn-secondary min-h-11" onClick={onDone}>Skip</button>
        <button type="button" className="btn-primary min-h-11" disabled={!point || saving} onClick={() => save(point)}>{saving ? 'Saving…' : 'Save location'}</button>
      </div>
    </div>
  )
}
