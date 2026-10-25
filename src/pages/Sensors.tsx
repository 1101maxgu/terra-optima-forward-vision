// Route: #/sensors (ref 09). `#/sensors?add=1` opens the Add sensor flow.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, EllipsisVertical, Loader2, MapPin, MoveRight, Pencil, Plus, Trash2, Unlink, LineChart } from 'lucide-react'
import type { Sensor } from '../types'
import { useFarm } from '../state/farmStore'
import { newId } from '../data/repo'
import { ConfirmDialog, Dialog, ErrorNote, Field, inputCls } from '../ui/controls'
import { PageHeader, timeAgo } from '../ui/kit'
import { BatteryText, ConnectivityBadge, latestSensorReading, TYPE_LABEL } from '../components/sensors/SensorMeta'
import { errMsg, Esp32Connect, LorawanConnect, MethodCards } from '../components/sensors/SensorConnect'
import SensorLocationPicker from '../components/sensors/SensorLocationPicker'
import Luke from '../guide/Luke'
import PlanNudge from '../components/billing/PlanNudge'
import { openLuke } from '../guide/LukeChat'
import TrustBadge, { TrustPanel } from '../components/TrustBadge'
import type { ConnectMethod } from '../components/wizard/draft'

type Tab = 'all' | 'lorawan' | 'esp32' | 'unassigned'
const TABS: [Tab, string][] = [['all', 'All sensors'], ['lorawan', 'Long-range radio'], ['esp32', 'Wi-Fi (ESP32)'], ['unassigned', 'Unassigned']]
const matches = (s: Sensor, t: Tab) => t === 'all' || (t === 'unassigned' ? s.zoneId === null : s.type === t)

export default function Sensors() {
  const { loading, loadError, reload, sensors } = useFarm()
  const [tab, setTab] = useState<Tab>('all')
  const [adding, setAdding] = useState(() => /[?&]add=1\b/.test(window.location.hash))
  const [menuFor, setMenuFor] = useState<string | null>(null)

  useEffect(() => {
    const on = () => /[?&]add=1\b/.test(window.location.hash) && setAdding(true)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const closeAdd = () => {
    setAdding(false)
    if (window.location.hash.includes('?')) history.replaceState(null, '', '#/sensors')
  }

  const list = useMemo(() => sensors.filter((s) => matches(s, tab)).sort((a, b) => a.name.localeCompare(b.name)), [sensors, tab])
  const menuSensor = sensors.find((s) => s.id === menuFor) ?? null

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
      <PageHeader title="Sensors" subtitle="View and manage all sensors" help="sensors"
        actions={
          <button type="button" onClick={() => setAdding(true)} className="flex min-h-11 items-center gap-2 rounded-lg bg-forest px-4 font-semibold text-surface hover:bg-forest-2">
            <Plus aria-hidden className="size-5" /> Add sensor
          </button>
        } />

      <div role="tablist" aria-label="Filter sensors" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map(([t, label]) => {
          const n = sensors.filter((s) => matches(s, t)).length
          return (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 font-semibold whitespace-nowrap ${tab === t ? 'border-forest text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label} <span className="ml-0.5 text-sm font-normal text-muted">{n}</span>
            </button>
          )
        })}
      </div>

      {loadError ? (
        <div className="space-y-2"><ErrorNote>Could not load sensors: {loadError}</ErrorNote><button type="button" className="btn-primary min-h-11" onClick={reload}>Retry</button></div>
      ) : loading ? (
        <p className="flex items-center gap-2 text-muted"><Loader2 aria-hidden className="size-5 animate-spin" /> Loading sensors…</p>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          {sensors.length === 0 && <Luke className="mb-2 size-14" />}
          <p className="font-semibold">{sensors.length === 0 ? 'No sensors yet' : 'No sensors in this list'}</p>
          <p className="mt-1 text-muted">{sensors.length === 0 ? 'Add a sensor, or record manual readings without any hardware.' : 'Try another tab.'}</p>
          {sensors.length === 0 && <button type="button" className="btn-primary mt-4 min-h-11" onClick={() => setAdding(true)}>Add sensor</button>}
          {sensors.length === 0 && (
            <button type="button" onClick={() => openLuke('Which kind of sensor should I use, and how do I install it?')} className="mt-2 min-h-11 font-semibold text-water underline">
              Ask Luke which sensor to use
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {list.map((s) => <SensorRow key={s.id} sensor={s} onMenu={() => setMenuFor(s.id)} />)}
        </ul>
      )}

      {menuSensor && <SensorActions sensor={menuSensor} onClose={() => setMenuFor(null)} />}
      <Dialog open={adding} onClose={closeAdd} title="Add sensor">{adding && <AddSensor onDone={closeAdd} />}</Dialog>
    </div>
  )
}

function StatusDot({ sensor }: { sensor: Sensor }) {
  const { sensorState } = useFarm()
  const st = sensor.type === 'manual' ? 'manual' : sensorState(sensor)
  const cls = st === 'online' ? 'bg-leaf' : st === 'manual' ? 'bg-water' : st === 'offline' ? 'bg-alert' : 'bg-stale'
  return <span aria-hidden className={`mt-1.5 size-3 shrink-0 rounded-full ${cls}`} />
}

function SensorRow({ sensor, onMenu }: { sensor: Sensor; onMenu: () => void }) {
  const { zones, readings, sensorState, assessments } = useFarm()
  const zone = zones.find((z) => z.id === sensor.zoneId)
  const r = latestSensorReading(readings, sensor.id)
  const seen = sensor.lastSeen ?? r?.timestamp
  const stale = sensor.type !== 'manual' && sensorState(sensor) !== 'online'
  return (
    <li className="flex items-start gap-3 p-4 lg:items-center">
      <StatusDot sensor={sensor} />
      <div className="grid min-w-0 flex-1 gap-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center lg:gap-4">
        <div className="min-w-0">
          <p className="font-bold">{sensor.name}</p>
          <p className="text-sm text-muted">{TYPE_LABEL[sensor.type]} · {sensor.deviceId}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <ConnectivityBadge sensor={sensor} />
            <TrustBadge a={assessments[sensor.id]} />
            {seen && <span className={stale ? 'font-semibold text-stale' : 'text-muted'}>{stale ? 'Stale · ' : ''}{timeAgo(seen)}</span>}
          </div>
        </div>
        <div className="min-w-0 text-sm">
          {zone ? (
            <a href={`#/zones/${zone.id}`} className="inline-flex min-h-8 items-center gap-1 font-semibold text-water hover:underline">
              {zone.name} <ChevronRight aria-hidden className="size-4" />
            </a>
          ) : (
            <span className="font-semibold text-sun">Not assigned to a field section</span>
          )}
          <p className="text-muted">Soil moisture ({sensor.depthCm} cm){sensor.lat !== undefined ? ' · location set' : ''}</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
          {r ? (
            <span className="text-lg font-bold tabular-nums">{Math.round(r.soilMoisturePercent)}%{r.soilTemperatureC !== undefined && <span className="ml-2 font-semibold">· {r.soilTemperatureC.toFixed(0)}°C</span>}</span>
          ) : <span className="text-muted">No readings yet</span>}
          <BatteryText pct={sensor.batteryPercent} />
        </div>
        <TrustPanel a={assessments[sensor.id]} className="lg:col-span-3" />
      </div>
      <button type="button" onClick={onMenu} aria-label={`Actions for ${sensor.name}`} className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-stale-soft">
        <EllipsisVertical aria-hidden className="size-5" />
      </button>
    </li>
  )
}

type Mode = 'menu' | 'rename' | 'assign' | 'location' | 'readings' | 'remove'

function SensorActions({ sensor, onClose }: { sensor: Sensor; onClose: () => void }) {
  const { zones, saveSensor, assignSensor, deleteSensor } = useFarm()
  const [mode, setMode] = useState<Mode>('menu')
  const [name, setName] = useState(sensor.name)
  const [zoneId, setZoneId] = useState(sensor.zoneId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onClose()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'remove')
    return (
      <ConfirmDialog open title={`Remove ${sensor.name}?`} danger confirmLabel="Remove sensor" busy={busy} error={error} onCancel={() => setMode('menu')}
        onConfirm={() => act(() => deleteSensor(sensor.id))}
        body="The sensor is removed from GeoViva. Readings already recorded stay in the field section's history. You can add it again later." />
    )

  const titles: Record<Mode, string> = { menu: sensor.name, rename: 'Rename sensor', assign: sensor.zoneId ? 'Move to field section' : 'Assign to field section', location: 'Set sensor location', readings: 'Recent readings', remove: '' }
  const item = (icon: ReactNode, label: string, onClick: () => void, danger = false) => (
    <li>
      <button type="button" onClick={onClick} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left font-semibold hover:bg-stale-soft ${danger ? 'text-alert' : ''}`}>
        {icon} {label}
      </button>
    </li>
  )
  return (
    <Dialog open onClose={onClose} title={titles[mode]}>
      {mode === 'menu' && (
        <ul className="-mx-3">
          {item(<Pencil aria-hidden className="size-5" />, 'Rename', () => setMode('rename'))}
          {item(<MoveRight aria-hidden className="size-5" />, sensor.zoneId ? 'Move to another field section' : 'Assign to field section', () => setMode('assign'))}
          {sensor.zoneId && item(<Unlink aria-hidden className="size-5" />, 'Unassign from field section', () => act(() => assignSensor(sensor.id, null)))}
          {item(<MapPin aria-hidden className="size-5" />, 'Set sensor location', () => setMode('location'))}
          {item(<LineChart aria-hidden className="size-5" />, 'Review recent readings', () => setMode('readings'))}
          {item(<Trash2 aria-hidden className="size-5" />, 'Remove sensor', () => setMode('remove'), true)}
        </ul>
      )}
      {mode === 'rename' && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(() => saveSensor({ ...sensor, name: name.trim() })) }}>
          <Field label="Sensor name">{(id) => <input id={id} autoFocus required maxLength={40} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <button type="submit" disabled={busy || !name.trim()} className="btn-primary min-h-11 w-full">{busy ? 'Saving…' : 'Save name'}</button>
        </form>
      )}
      {mode === 'assign' && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(() => assignSensor(sensor.id, zoneId || null)) }}>
          <Field label="Zone" hint="The sensor's readings will count toward this field section from now on.">
            {(id) => (
              <select id={id} className={inputCls} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">No field section (unassigned)</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            )}
          </Field>
          <button type="submit" disabled={busy || zoneId === (sensor.zoneId ?? '')} className="btn-primary min-h-11 w-full">{busy ? 'Saving…' : 'Save'}</button>
        </form>
      )}
      {mode === 'location' && <SensorLocationPicker sensor={sensor} onDone={onClose} />}
      {mode === 'readings' && <RecentReadings sensor={sensor} />}
      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
    </Dialog>
  )
}

function RecentReadings({ sensor }: { sensor: Sensor }) {
  const { readings } = useFarm()
  const since = Date.now() - 7 * 86_400_000
  const list = readings
    .filter((r) => r.sensorId === sensor.id && Date.parse(r.timestamp) >= since)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  if (!list.length) return <p className="text-muted">No readings from this sensor in the last 7 days.</p>
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{list.length} readings in the last 7 days{list.length > 50 ? ' (latest 50 shown)' : ''}</p>
      <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
        {list.slice(0, 50).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-muted">{new Date(r.timestamp).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <span className="font-semibold tabular-nums">{r.soilMoisturePercent.toFixed(1)}%{r.soilTemperatureC !== undefined && <span className="ml-2 font-normal text-muted">{r.soilTemperatureC.toFixed(1)}°C</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AddSensor({ onDone }: { onDone: () => void }) {
  const { zones, sensors, saveSensor, limits } = useFarm()
  const connected = sensors.filter((s) => s.type !== 'manual').length
  const atSensorLimit = limits !== null && connected >= limits.sensors
  const [method, setMethod] = useState<ConnectMethod | null>(null)
  const [zoneId, setZoneId] = useState('')
  const [name, setName] = useState('Manual probe')
  const [depth, setDepth] = useState(20)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Server-registered sensors are mirrored into the farm store so they appear immediately.
  const mirror = async (list: Sensor[]) => {
    try {
      for (const s of list) await saveSensor(s)
    } catch (e) {
      setError(errMsg(e))
    }
  }
  const createManual = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveSensor({ name: name.trim(), deviceId: `manual-${newId().slice(0, 8)}`, type: 'manual', depthCm: depth, zoneId: zoneId || null })
      onDone()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const zoneSelect = (
    <Field label="Field section (optional)">
      {(id) => (
        <select id={id} className={inputCls} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          <option value="">Not in a field section yet</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      )}
    </Field>
  )

  return (
    <div className="space-y-4">
      <MethodCards value={method} onChange={setMethod} />
      {(method === 'lorawan' || method === 'esp32') && atSensorLimit && (
        <PlanNudge>{`Your plan covers ${limits?.sensors} connected sensor${limits?.sensors === 1 ? '' : 's'}, and you’re using ${connected}. Manual readings are always free.`}</PlanNudge>
      )}
      {method === 'lorawan' && !atSensorLimit && <>{zoneSelect}<LorawanConnect zoneId={zoneId || null} onRegistered={mirror} /></>}
      {method === 'esp32' && !atSensorLimit && <>{zoneSelect}<Esp32Connect zoneId={zoneId || null} onClaimed={(s) => mirror([s])} /></>}
      {method === 'manual' && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createManual() }}>
          <p className="text-sm text-muted">A manual sensor is a named spot where you take readings with a handheld meter. No hardware connection.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">{(id) => <input id={id} required maxLength={40} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Depth (cm)">{(id) => <input id={id} type="number" inputMode="numeric" min={1} max={200} required className={inputCls} value={depth} onChange={(e) => setDepth(Number(e.target.value))} />}</Field>
          </div>
          {zoneSelect}
          <button type="submit" disabled={busy || !name.trim() || !(depth > 0)} className="btn-primary min-h-11 w-full">{busy ? 'Adding…' : 'Add manual sensor'}</button>
        </form>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  )
}
