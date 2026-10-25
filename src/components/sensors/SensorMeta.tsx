// Shared sensor display: connectivity, battery, latest reading. Used by the wizard and the Sensors page.
import { BatteryLow, BatteryMedium, CircleSlash, PencilLine, Wifi, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Sensor, SensorReading, SensorType } from '../../types'
import { useFarm } from '../../state/farmStore'
import { timeAgo } from '../../ui/kit'

export const TYPE_LABEL: Record<SensorType, string> = { lorawan: 'Long-range radio', esp32: 'Wi-Fi (ESP32)', manual: 'Manual' }

export function latestSensorReading(readings: SensorReading[], sensorId: string): SensorReading | null {
  let best: SensorReading | null = null
  for (const r of readings) if (r.sensorId === sensorId && (!best || Date.parse(r.timestamp) > Date.parse(best.timestamp))) best = r
  return best
}

export function ConnectivityBadge({ sensor }: { sensor: Sensor }) {
  const { sensorState } = useFarm()
  if (sensor.type === 'manual')
    return <Badge cls="bg-stale-soft text-muted border-line" icon={<PencilLine aria-hidden className="size-4" />}>Manual entry</Badge>
  const st = sensorState(sensor)
  if (st === 'online') return <Badge cls="bg-leaf-soft text-leaf border-leaf/30" icon={<Wifi aria-hidden className="size-4" />}>Online</Badge>
  if (st === 'offline') return <Badge cls="bg-stale-soft text-stale border-stale/30" icon={<WifiOff aria-hidden className="size-4" />}>Not reporting</Badge>
  return <Badge cls="bg-stale-soft text-stale border-stale/30" icon={<CircleSlash aria-hidden className="size-4" />}>Not connected yet</Badge>
}

function Badge({ cls, icon, children }: { cls: string; icon: ReactNode; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{icon}{children}</span>
}

export function BatteryText({ pct }: { pct?: number }) {
  if (pct === undefined) return null
  const low = pct < 20
  const Icon = low ? BatteryLow : BatteryMedium
  return (
    <span className={`inline-flex items-center gap-1 ${low ? 'font-semibold text-alert' : 'text-muted'}`}>
      <Icon aria-hidden className="size-4" /> {Math.round(pct)}%{low && ' · low battery'}
    </span>
  )
}

/** Latest moisture/temp + age; "stale" spelled out when the sensor is offline. */
export function LatestReading({ sensor }: { sensor: Sensor }) {
  const { readings, sensorState } = useFarm()
  const r = latestSensorReading(readings, sensor.id)
  const seen = sensor.lastSeen ?? r?.timestamp
  const stale = sensor.type !== 'manual' && sensorState(sensor) !== 'online'
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      {r ? (
        <span className="text-lg font-bold tabular-nums">
          {Math.round(r.soilMoisturePercent)}%
          <span className="ml-1 text-sm font-normal text-muted">moisture</span>
          {r.soilTemperatureC !== undefined && <span className="ml-2 font-semibold">{r.soilTemperatureC.toFixed(0)}°C</span>}
        </span>
      ) : (
        <span className="text-muted">No readings yet</span>
      )}
      {seen && (
        <span className={`text-sm ${stale ? 'font-semibold text-stale' : 'text-muted'}`}>
          {stale ? 'Stale · last update ' : 'Updated '}
          {timeAgo(seen)}
        </span>
      )}
    </div>
  )
}

/** Compact summary used in selection lists. */
export function SensorSummary({ sensor }: { sensor: Sensor }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{sensor.name}</span>
        <ConnectivityBadge sensor={sensor} />
      </div>
      <p className="text-sm text-muted">
        {TYPE_LABEL[sensor.type]} · ID {sensor.deviceId} · {sensor.depthCm} cm deep
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
        <LatestReading sensor={sensor} />
        <BatteryText pct={sensor.batteryPercent} />
      </div>
    </div>
  )
}
