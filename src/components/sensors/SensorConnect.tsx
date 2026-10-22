// The three ways to bring soil data in: existing LoRaWAN network, GeoViva Wi-Fi sensor, manual readings.
// LoRaWAN/ESP32 go through the GeoViva server (src/services/deviceApi.ts); without it we say so plainly.
import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, PencilLine, RadioTower, ServerOff, Wifi } from 'lucide-react'
import type { Sensor } from '../../types'
import {
  claimEsp32, connectTheThingsStack, getLorawanConnections, isBackendConfigured, listLorawanDevices, registerLorawanDevices,
  type Esp32Claim, type LorawanConnection, type LorawanDevice,
} from '../../services/deviceApi'
import { ChoiceCard, ErrorNote, Field, inputCls } from '../../ui/controls'
import { timeAgo } from '../../ui/kit'
import { LatestReading } from './SensorMeta'
import type { ConnectMethod } from '../wizard/draft'

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.')

export function MethodCards({ value, onChange }: { value: ConnectMethod | null; onChange: (m: ConnectMethod) => void }) {
  return (
    <div role="radiogroup" aria-label="Connection method" className="grid gap-2 sm:grid-cols-3">
      <ChoiceCard vertical selected={value === 'lorawan'} onSelect={() => onChange('lorawan')} icon={<RadioTower className="size-6" />}
        title="Existing LoRaWAN network" subtitle="Connect sensors already on The Things Stack" />
      <ChoiceCard vertical selected={value === 'esp32'} onSelect={() => onChange('esp32')} icon={<Wifi className="size-6" />}
        title="GeoViva Wi-Fi sensor" subtitle="Claim a new ESP32 sensor with its device code" />
      <ChoiceCard vertical selected={value === 'manual'} onSelect={() => onChange('manual')} icon={<PencilLine className="size-6" />}
        title="Manual readings" subtitle="No hardware — type in readings yourself" />
    </div>
  )
}

export function ServerNeeded({ from = 'wizard' }: { from?: 'wizard' | 'sensors' }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-stale-soft p-4">
      <ServerOff aria-hidden className="mt-0.5 size-5 shrink-0 text-stale" />
      <div>
        <p className="font-semibold">Needs the GeoViva server — not connected in this build.</p>
        <p className="mt-1 text-sm text-muted">
          {from === 'wizard'
            ? 'You can create the zone now and connect sensors later from Sensors.'
            : 'Manual readings work now. LoRaWAN and Wi-Fi sensors can be connected once the server is set up.'}
        </p>
      </div>
    </div>
  )
}

const CLUSTERS = [
  { id: 'eu1', label: 'Europe 1 (eu1)' },
  { id: 'nam1', label: 'North America 1 (nam1)' },
  { id: 'au1', label: 'Australia 1 (au1)' },
]

/** The Things Stack: connect (key sent once to the server), list devices, register the chosen ones. */
export function LorawanConnect({ zoneId, onRegistered }: { zoneId: string | null; onRegistered: (s: Sensor[]) => void }) {
  const [provider, setProvider] = useState<'ttn' | 'chirpstack'>('ttn')
  const configured = isBackendConfigured()
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="LoRaWAN network provider" className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard selected={provider === 'ttn'} onSelect={() => setProvider('ttn')} title="The Things Stack (TTN)" subtitle="The Things Network / The Things Industries" />
        <ChoiceCard selected={false} disabled onSelect={() => undefined} title="ChirpStack" badge="Coming soon" subtitle="Self-hosted LoRaWAN server" />
      </div>
      {configured ? <TtnFlow zoneId={zoneId} onRegistered={onRegistered} /> : <ServerNeeded from={zoneId === null ? 'wizard' : 'sensors'} />}
    </div>
  )
}

function TtnFlow({ zoneId, onRegistered }: { zoneId: string | null; onRegistered: (s: Sensor[]) => void }) {
  const [conn, setConn] = useState<LorawanConnection | null>(null)
  const [checking, setChecking] = useState(true)
  const [form, setForm] = useState({ cluster: 'nam1', applicationId: '', apiKey: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<LorawanDevice[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Sensor[] | null>(null)

  useEffect(() => {
    getLorawanConnections()
      .then((cs) => setConn(cs.find((c) => c.provider === 'ttn' && c.status === 'connected') ?? null))
      .catch(() => setConn(null))
      .finally(() => setChecking(false))
  }, [])

  const loadDevices = async (c: LorawanConnection) => {
    setBusy(true)
    setError(null)
    try {
      setDevices(await listLorawanDevices(c.id))
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (conn) loadDevices(conn)
  }, [conn])

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      const c = await connectTheThingsStack(form)
      setForm((f) => ({ ...f, apiKey: '' })) // never keep the key around in the browser
      setConn(c)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const register = async () => {
    if (!conn || !devices) return
    setBusy(true)
    setError(null)
    try {
      const chosen = devices.filter((d) => picked.has(d.deviceId))
      const sensors = await registerLorawanDevices(conn.id, chosen.map((d) => ({ deviceId: d.deviceId, name: d.name, depthCm: d.depthCm ?? 20, zoneId })))
      setDone(sensors)
      onRegistered(sensors)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (checking) return <p className="flex items-center gap-2 text-muted"><Loader2 aria-hidden className="size-4 animate-spin" /> Checking for an existing connection…</p>

  if (done)
    return (
      <p className="flex items-center gap-2 rounded-xl bg-leaf-soft p-3 font-semibold text-leaf">
        <CheckCircle2 aria-hidden className="size-5" /> {done.length} sensor{done.length === 1 ? '' : 's'} added{zoneId === null ? ' — they will be assigned when you create the zone.' : '.'}
      </p>
    )

  if (!conn)
    return (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); connect() }}>
        <Field label="Cluster">
          {(id) => (
            <select id={id} className={inputCls} value={form.cluster} onChange={(e) => setForm({ ...form, cluster: e.target.value })}>
              {CLUSTERS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="Application ID" hint="Shown at the top of your application in The Things Stack console.">
          {(id) => <input id={id} required className={inputCls} value={form.applicationId} autoComplete="off" spellCheck={false}
            onChange={(e) => setForm({ ...form, applicationId: e.target.value.trim() })} />}
        </Field>
        <Field label="API key" hint="Sent once to the GeoViva server, stored there encrypted, and never saved in this browser.">
          {(id) => <input id={id} required type="password" className={inputCls} value={form.apiKey} autoComplete="off"
            onChange={(e) => setForm({ ...form, apiKey: e.target.value.trim() })} />}
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" disabled={busy} className="btn-primary min-h-11 w-full sm:w-auto">{busy ? 'Connecting…' : 'Connect The Things Stack'}</button>
      </form>
    )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-leaf-soft p-3">
        <span className="flex items-center gap-2 font-semibold text-leaf">
          <CheckCircle2 aria-hidden className="size-5" /> {conn.label}
        </span>
        <span className="flex gap-2">
          <button type="button" className="btn-secondary min-h-11" onClick={() => loadDevices(conn)} disabled={busy}>Refresh</button>
          <button type="button" className="btn-secondary min-h-11" onClick={() => { setConn(null); setDevices(null) }}>Change</button>
        </span>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {busy && !devices && <p className="text-muted">Loading devices…</p>}
      {devices && devices.length === 0 && <p className="text-muted">No devices found in this application.</p>}
      {devices && devices.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">Available sensors</legend>
          {devices.map((d) => (
            <label key={d.deviceId} className={`flex min-h-14 items-start gap-3 rounded-xl border border-line p-3 ${d.alreadyRegistered ? 'opacity-60' : 'cursor-pointer hover:border-ink'}`}>
              <input type="checkbox" className="mt-1 size-5 accent-leaf" disabled={d.alreadyRegistered} checked={picked.has(d.deviceId)}
                onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(d.deviceId); else n.delete(d.deviceId); return n })} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{d.name} <span className="font-normal text-muted">· {d.deviceId}</span></span>
                <span className="block text-sm text-muted">
                  {[d.lastMoisturePercent !== undefined && `${Math.round(d.lastMoisturePercent)}% moisture`, d.depthCm !== undefined && `${d.depthCm} cm`,
                    d.batteryPercent !== undefined && `battery ${Math.round(d.batteryPercent)}%`, d.lastSeen ? `seen ${timeAgo(d.lastSeen)}` : 'never seen',
                    d.alreadyRegistered && 'already added'].filter(Boolean).join(' · ')}
                </span>
              </span>
            </label>
          ))}
          <button type="button" className="btn-primary min-h-11 w-full sm:w-auto" disabled={busy || picked.size === 0} onClick={register}>
            {busy ? 'Adding…' : `Add ${picked.size || ''} selected sensor${picked.size === 1 ? '' : 's'}`}
          </button>
        </fieldset>
      )}
    </div>
  )
}

/** GeoViva Wi-Fi sensor: claim by the code printed on the device. */
export function Esp32Connect({ zoneId, onClaimed }: { zoneId: string | null; onClaimed: (s: Sensor) => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('Wi-Fi sensor')
  const [depth, setDepth] = useState(20)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claim, setClaim] = useState<Esp32Claim | null>(null)

  if (!isBackendConfigured()) return <ServerNeeded from={zoneId === null ? 'wizard' : 'sensors'} />

  if (claim)
    return (
      <div className="space-y-2 rounded-xl bg-leaf-soft p-3">
        <p className="flex items-center gap-2 font-semibold text-leaf"><CheckCircle2 aria-hidden className="size-5" /> {claim.sensor.name} claimed</p>
        <p className="text-sm text-muted">
          {claim.sensor.lastSeen ? `Last seen ${timeAgo(claim.sensor.lastSeen)}.` : 'Waiting for the sensor to send its first reading — power it on near your Wi-Fi.'}
        </p>
        <LatestReading sensor={claim.sensor} />
      </div>
    )

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const c = await claimEsp32(code, { name: name.trim() || 'Wi-Fi sensor', depthCm: depth, zoneId })
      setClaim(c)
      onClaimed(c.sensor)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <Field label="Device code" hint="Printed on the sticker inside the sensor lid, e.g. GV-7K3P-29QX.">
        {(id) => <input id={id} required className={`${inputCls} font-mono uppercase`} value={code} autoComplete="off" spellCheck={false}
          onChange={(e) => setCode(e.target.value.toUpperCase().trim())} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sensor name">{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Depth (cm)">{(id) => <input id={id} type="number" inputMode="numeric" min={1} max={200} className={inputCls} value={depth}
          onChange={(e) => setDepth(Number(e.target.value))} />}</Field>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <button type="submit" disabled={busy || !code} className="btn-primary min-h-11 w-full sm:w-auto">{busy ? 'Claiming…' : 'Claim sensor'}</button>
    </form>
  )
}
