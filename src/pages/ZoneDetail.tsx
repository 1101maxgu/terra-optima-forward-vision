// Zone detail. Route: #/zones/:id
import { useState } from 'react'
import { ArrowLeft, Droplets, MapPinned, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Zone } from '../types'
import { useFarm } from '../state/farmStore'
import { navigate } from '../router'
import { Card, HelpLink } from '../ui/kit'
import { formatArea } from '../map/geo'
import { SOILS } from '../data/soils'
import { CROP_EMOJI } from '../components/zone/helpers'
import { Dialog, ZoneForm } from '../components/zone/parts'
import Overview from '../components/zone/Overview'
import { HistoryTab, IrrigationTab, MoistureTab, WeatherTab } from '../components/zone/Tabs'

const TABS = [
  ['overview', 'Overview'],
  ['moisture', 'Soil moisture'],
  ['irrigation', 'Irrigation'],
  ['weather', 'Weather'],
  ['history', 'History'],
  ['settings', 'Settings'],
] as const
type Tab = (typeof TABS)[number][0]

export default function ZoneDetail({ zoneId }: { zoneId: string }) {
  const { loading, zones, zoneStatus, updateZone, deleteZone } = useFarm()
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const zone = zones.find((z) => z.id === zoneId)

  if (loading) return <p className="p-6 text-muted" role="status">Loading field section…</p>
  if (!zone)
    return (
      <Card className="mx-auto mt-6 max-w-md text-center">
        <h1 className="text-xl font-bold">Field section not found</h1>
        <p className="mt-1 text-muted">It may have been deleted.</p>
        <a href="#/zones" className="btn-primary mt-4 inline-flex min-h-11 items-center">Back to field sections</a>
      </Card>
    )

  const zs = zoneStatus(zone.id)
  const go = (t: Tab, anchor?: string) => {
    setTab(t)
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const addReading = () => go('moisture', 'add-reading')
  const save = (patch: Partial<Zone>) => updateZone(zone.id, patch)
  const sticky = tab === 'moisture' ? { label: 'Add reading', Icon: Plus, run: addReading } : { label: 'Log irrigation', Icon: Droplets, run: () => go('irrigation', 'log-irrigation') }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 pb-24 sm:pb-6">
      <a href="#/zones" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All field sections
      </a>

      <header className="flex items-center gap-3 sm:gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-leaf-soft text-3xl sm:size-16 sm:text-4xl" aria-hidden>{CROP_EMOJI[zone.cropId]}</span>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1 text-xl font-bold tracking-tight sm:text-2xl">{zone.name}<HelpLink topic="advice" label="Reading your advice" /></h1>
          <p className="text-muted">
            {formatArea(zone.areaM2)} • {SOILS[zone.soilId].name} • {zone.method === 'drip' ? 'Drip' : 'Sprinkler'}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="btn-secondary inline-flex min-h-11 items-center gap-2">
          <Pencil className="size-4" aria-hidden /><span className="hidden sm:inline">Edit field section</span><span className="sr-only sm:hidden">Edit field section</span>
        </button>
        <details className="relative">
          <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-md border border-line bg-surface hover:border-ink [&::-webkit-details-marker]:hidden" aria-label="More actions">
            <MoreVertical className="size-5" aria-hidden />
          </summary>
          <div className="absolute right-0 z-20 mt-2 flex w-52 flex-col rounded-xl border border-line bg-surface p-1 shadow-lg">
            <button type="button" onClick={() => navigate(`/zones/${zone.id}/boundary`)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left hover:bg-paper">
              <MapPinned className="size-4" aria-hidden /> {zone.boundary ? 'Edit boundary' : 'Add boundary'}
            </button>
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-alert hover:bg-alert-soft">
              <Trash2 className="size-4" aria-hidden /> Delete field section
            </button>
          </div>
        </details>
      </header>

      <nav className="-mx-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Field section sections">
        <div role="tablist" className="flex min-w-max gap-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-12 border-b-[3px] px-3 font-semibold whitespace-nowrap transition sm:px-4 ${tab === id ? 'border-leaf text-leaf' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel">
        {tab === 'overview' && <Overview zone={zone} zs={zs} onAddReading={addReading} onViewData={() => setTab('moisture')} />}
        {tab === 'moisture' && <MoistureTab zone={zone} zs={zs} />}
        {tab === 'irrigation' && <IrrigationTab zone={zone} zs={zs} onAddReading={addReading} />}
        {tab === 'weather' && <WeatherTab />}
        {tab === 'history' && <HistoryTab zone={zone} />}
        {tab === 'settings' && (
          <div className="flex flex-col gap-4">
            <Card>
              <h2 className="mb-4 text-lg font-bold">Field section settings</h2>
              <ZoneForm key={zone.updatedAt ?? zone.id} zone={zone} onSave={save} />
            </Card>
            <Card className="border-alert/40">
              <h2 className="text-lg font-bold text-alert">Danger field section</h2>
              <p className="mt-1 text-muted">Deleting removes this field section. Sensors assigned to it become unassigned.</p>
              <button type="button" onClick={() => setConfirmDelete(true)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-alert px-4 font-semibold text-alert hover:bg-alert-soft">
                <Trash2 className="size-4" aria-hidden /> Delete field section
              </button>
            </Card>
          </div>
        )}
      </div>

      {tab !== 'settings' && (
        <div className="sticky bottom-3 z-10 sm:hidden">
          <button type="button" onClick={sticky.run} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-leaf text-lg font-semibold text-surface shadow-lg">
            <sticky.Icon className="size-5" aria-hidden /> {sticky.label}
          </button>
        </div>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit field section">
        <ZoneForm zone={zone} onSave={save} onDone={() => setEditing(false)} />
      </Dialog>
      <DeleteDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} name={zone.name} onConfirm={() => deleteZone(zone.id)} />
    </div>
  )
}

function DeleteDialog({ open, onClose, name, onConfirm }: { open: boolean; onClose: () => void; name: string; onConfirm: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      await onConfirm()
      onClose()
      navigate('/zones')
    } catch (e) {
      setErr(`Could not delete: ${e instanceof Error ? e.message : 'unknown error'}. Try again.`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Delete field section?">
      <p>
        <b>{name}</b> and its settings will be removed. Sensors assigned to it become unassigned. This cannot be undone.
      </p>
      {err && <p role="alert" className="mt-3 font-medium text-alert">{err}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary min-h-11">Cancel</button>
        <button type="button" onClick={run} disabled={busy} className="min-h-11 rounded-md bg-alert px-4 font-semibold text-surface disabled:opacity-60">{busy ? 'Deleting…' : 'Delete field section'}</button>
      </div>
    </Dialog>
  )
}
