// Route: #/zones/new — five-step Create Zone wizard (refs 02–07). The draft autosaves to localStorage.
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, History, Loader2, Sprout } from 'lucide-react'
import type { Zone } from '../types'
import { useFarm } from '../state/farmStore'
import { navigate } from '../router'
import { CROPS } from '../data/crops'
import { SOILS } from '../data/soils'
import { formatArea } from '../map/geo'
import { ErrorNote } from '../ui/controls'
import { Card, HelpLink } from '../ui/kit'
import PlanNudge from '../components/billing/PlanNudge'
import { buildZone, DRAFT_KEY, firstInvalidStep, newDraft, parseDraft, serializeDraft, stepError, type WizardDraft } from '../components/wizard/draft'
import { StepDetails, StepDraw, StepLocation, Stepper, StepReview, StepSensors } from '../components/wizard/Steps'
import { errMsg } from '../components/sensors/SensorConnect'

const HEAD = [
  ['Choose location', 'Search for your farm or use your current location.'],
  ['Draw zone boundary', 'Outline the area on the satellite map.'],
  ['Field details', 'Crop, soil and irrigation information.'],
  ['Connect sensors', 'Link sensors using any method — or skip for now.'],
  ['Review & create', 'Confirm everything before creating the zone.'],
] as const
const NEXT = ['Draw zone', 'Field details', 'Connect sensors', 'Review'] as const

function readStoredDraft(): WizardDraft | null {
  try {
    return parseDraft(localStorage.getItem(DRAFT_KEY))
  } catch {
    return null
  }
}
function writeDraft(d: WizardDraft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, serializeDraft(d))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* storage unavailable: the wizard still works in memory */
  }
}

export default function CreateZone() {
  const { loading, loadError, reload, zones, limits } = useFarm()
  const [run, setRun] = useState(0) // bump to start a fresh wizard ("Add another zone")
  // Checked when a wizard starts, not live: the zone just created must not swap the success screen for the nudge.
  const atLimit = limits?.zones != null && zones.length >= limits.zones
  const [blocked, setBlocked] = useState<boolean | null>(null)
  if (loadError)
    return (
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <ErrorNote>Could not load your farm: {loadError}</ErrorNote>
        <button type="button" className="btn-primary min-h-11" onClick={reload}>Retry</button>
      </div>
    )
  if (loading) return <p className="flex items-center gap-2 p-6 text-muted"><Loader2 aria-hidden className="size-5 animate-spin" /> Loading…</p>
  if (blocked ?? atLimit)
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <h1 className="text-xl font-bold">Create a new zone</h1>
        <PlanNudge>{`The Free plan includes ${limits?.zones} zones, and this farm has ${zones.length}. Upgrade to Grower for unlimited zones.`}</PlanNudge>
        <a href="#/zones" className="btn-secondary inline-flex min-h-11 items-center">Back to zones</a>
      </div>
    )
  return <Wizard key={run} onAnother={() => { setBlocked(atLimit); setRun((r) => r + 1) }} />
}

function Wizard({ onAnother }: { onAnother: () => void }) {
  const { farm, zones, createZone, assignSensor, saveSensor, addManualReading } = useFarm()
  const fresh = () => newDraft([farm.lon, farm.lat], `Zone ${zones.length + 1}`)
  const [d, setD] = useState<WizardDraft>(fresh)
  const [resumable, setResumable] = useState<WizardDraft | null>(readStoredDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Zone | null>(null)
  // Steps already completed by a failed create, so Retry never duplicates the zone or a reading.
  const progress = useRef<{ zone?: Zone; done: Set<string> }>({ done: new Set() })
  const touched = useRef(false)

  useEffect(() => {
    if (touched.current && !created) writeDraft(d)
  }, [d, created])

  const set = (p: Partial<WizardDraft>) => {
    touched.current = true
    setResumable(null) // starting to edit means the old draft is being replaced
    setD((x) => ({ ...x, ...p }))
  }
  const go = (step: number) => {
    set({ step })
    window.scrollTo(0, 0)
  }
  const canGo = (s: number) => firstInvalidStep(d, s) === -1
  const err = stepError(d, d.step)

  const create = async () => {
    setSaving(true)
    setError(null)
    const p = progress.current
    try {
      const zone = p.zone ?? (p.zone = await createZone(buildZone(d)))
      for (const s of d.pendingSensors) {
        if (!p.done.has(`p:${s.id}`)) { await saveSensor({ ...s, zoneId: zone.id }); p.done.add(`p:${s.id}`) }
      }
      for (const id of d.sensorIds) {
        if (!p.done.has(`s:${id}`)) { await assignSensor(id, zone.id); p.done.add(`s:${id}`) }
      }
      if (d.sensorMethod === 'manual' && d.manualReadingPct !== null && !p.done.has('reading')) {
        await addManualReading(zone.id, d.manualReadingPct)
        p.done.add('reading')
      }
      writeDraft(null)
      setCreated(zone)
    } catch (e) {
      setError(`${p.zone ? 'The zone was saved, but finishing setup failed' : 'Could not create the zone'}: ${errMsg(e)}`)
    } finally {
      setSaving(false)
    }
  }

  if (created) return <Success zone={created} d={d} onAnother={() => { writeDraft(null); onAnother() }} />

  const back = () => (d.step === 0 ? navigate('/zones') : go(d.step - 1))
  const last = d.step === 4

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col">
      <div className="space-y-4 px-4 pt-4 pb-6 sm:px-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={back} aria-label={d.step === 0 ? 'Cancel and go back to zones' : 'Previous step'}
            className="-ml-2 grid size-11 place-items-center rounded-full hover:bg-stale-soft">
            <ArrowLeft aria-hidden className="size-6" />
          </button>
          <h1 className="text-xl font-bold sm:text-2xl">Create a new zone</h1>
          <HelpLink topic="zones" label="Create a new zone" />
        </div>
        <Stepper step={d.step} canGo={canGo} onGo={go} />

        {resumable && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-water/30 bg-water-soft p-3">
            <p className="flex min-w-60 flex-1 items-center gap-2 font-semibold"><History aria-hidden className="size-5 shrink-0 text-water" /> Resume your unfinished zone “{resumable.name || 'Untitled'}”?</p>
            <button type="button" className="btn-primary min-h-11" onClick={() => { touched.current = true; setD(resumable); setResumable(null) }}>Resume</button>
            <button type="button" className="btn-secondary min-h-11" onClick={() => { writeDraft(null); setResumable(null) }}>Start over</button>
          </div>
        )}

        <div>
          <h2 className="text-2xl font-bold">{HEAD[d.step][0]}</h2>
          <p className="text-muted">{HEAD[d.step][1]}</p>
        </div>

        {d.step === 0 && <StepLocation d={d} set={set} />}
        {d.step === 1 && <StepDraw d={d} set={set} />}
        {d.step === 2 && <StepDetails d={d} set={set} />}
        {d.step === 3 && <StepSensors d={d} set={set} />}
        {d.step === 4 && <StepReview d={d} onEdit={go} />}

        {last && error && (
          <ErrorNote>{error} Your entries are kept — press Retry.</ErrorNote>
        )}
      </div>

      <div className="sticky bottom-0 z-10 mt-auto border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
        {err && d.step !== 0 && <p className="mb-2 text-sm text-muted" aria-live="polite">{err}</p>}
        <div className="mx-auto flex max-w-6xl gap-3">
          <button type="button" onClick={back} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-line bg-surface px-4 font-semibold hover:border-ink sm:flex-none sm:px-8">
            {d.step === 0 ? 'Cancel' : <><ArrowLeft aria-hidden className="size-5" /> Back</>}
          </button>
          <button type="button" disabled={!!err || saving} onClick={() => (last ? create() : go(d.step + 1))}
            className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-lg bg-forest px-4 font-semibold text-surface hover:bg-forest-2 disabled:opacity-50 sm:ml-auto sm:flex-none sm:px-8">
            {last ? (saving ? <><Loader2 aria-hidden className="size-5 animate-spin" /> Creating…</> : error ? 'Retry' : 'Create zone')
              : <>Next: {NEXT[d.step]} <ArrowRight aria-hidden className="size-5" /></>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Success({ zone, d, onAnother }: { zone: Zone; d: WizardDraft; onAnother: () => void }) {
  const nSensors = d.pendingSensors.length + d.sensorIds.length
  const reading = d.sensorMethod === 'manual' && d.manualReadingPct !== null
  const items: [boolean, string][] = [
    [!!zone.boundary, zone.boundary ? 'Boundary mapped' : 'No boundary yet — draw it from the zone page'],
    [nSensors > 0, nSensors > 0 ? `${nSensors} sensor${nSensors === 1 ? '' : 's'} connected` : 'No sensors yet — add them from Sensors'],
    [nSensors > 0 || reading, reading ? 'First reading recorded' : nSensors > 0 ? 'Waiting for sensor data' : 'Add a reading to get recommendations'],
    [nSensors > 0 || reading, nSensors > 0 || reading ? 'Ready for irrigation recommendations' : 'Recommendations start after the first reading'],
  ]
  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-8 text-center">
      <span className="mx-auto grid size-20 place-items-center rounded-full bg-leaf-soft"><Check aria-hidden className="size-11 text-leaf" strokeWidth={3} /></span>
      <div>
        <h1 className="text-2xl font-bold">Zone created successfully!</h1>
        <p className="text-muted">{zone.name} has been added to your farm.</p>
      </div>
      <Card className="flex items-center gap-3 text-left">
        <span className="grid size-12 place-items-center rounded-xl bg-leaf-soft text-leaf"><Sprout aria-hidden className="size-7" /></span>
        <div>
          <p className="font-bold">{zone.name} — {CROPS[zone.cropId].name}</p>
          <p className="text-sm text-muted">{formatArea(zone.areaM2)} · {SOILS[zone.soilId].name} · {zone.method === 'drip' ? 'Drip' : 'Sprinkler'}</p>
        </div>
      </Card>
      <ul className="space-y-2 text-left">
        {items.map(([ok, t]) => (
          <li key={t} className="flex items-center gap-2">
            <CheckCircle2 aria-hidden className={`size-5 shrink-0 ${ok ? 'fill-leaf text-surface' : 'text-stale'}`} />
            <span className={ok ? '' : 'text-muted'}>{t}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        <a href={`#/zones/${zone.id}`} className="flex min-h-12 items-center justify-center rounded-lg bg-forest font-semibold text-surface hover:bg-forest-2">View zone details</a>
        <button type="button" onClick={onAnother} className="flex min-h-12 w-full items-center justify-center rounded-lg border-2 border-line bg-surface font-semibold hover:border-ink">Add another zone</button>
      </div>
    </div>
  )
}
