// Small building blocks for the zone page: semicircle gauge, modal dialog, zone edit form.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { CropId, IrrigationMethod, SoilId, Zone } from '../../types'
import { CROPS } from '../../data/crops'
import { SOILS } from '../../data/soils'
import { EFFICIENCY } from '../../engine/irrigation'

/** Ring moisture gauge: grey track, faint green target band (refill → field capacity), value arc. Values are volumetric % (0–100). */
export function RingGauge({ value, refill, fc, color, max = 50 }: { value: number | null; refill: number; fc: number; color: string; max?: number }) {
  const at = (v: number) => (Math.min(Math.max(v, 0), max) / max) * 100
  const ring = { cx: 60, cy: 60, r: 50, pathLength: 100, fill: 'none', transform: 'rotate(-90 60 60)' } as const
  return (
    <div className="relative size-40 shrink-0 sm:size-44">
      <svg viewBox="0 0 120 120" className="size-full" role="img" aria-label={`Soil moisture ${value ?? 'unknown'}%, target ${Math.round(refill)}–${Math.round(fc)}%`}>
        <circle {...ring} stroke="var(--color-stale-soft)" strokeWidth={10} />
        <circle {...ring} stroke="var(--color-leaf)" strokeOpacity={0.25} strokeWidth={10} strokeDasharray={`${at(fc) - at(refill)} 100`} strokeDashoffset={-at(refill)} />
        {value !== null && <circle {...ring} stroke={color} strokeWidth={10} strokeLinecap="round" strokeDasharray={`${at(value)} 100`} />}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-4xl font-bold tabular-nums sm:text-5xl">{value === null ? '—' : `${Math.round(value)}%`}</span>
        <span className="text-sm text-muted">Soil moisture</span>
      </div>
    </div>
  )
}

/** Native modal dialog (focus trap + Esc for free). */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dlg-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
            <h2 id="dlg-title" className="text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full hover:bg-paper">
              <X className="size-5" aria-hidden />
            </button>
          </header>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export const inputCls = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base'
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
      {hint && <span className="font-normal text-muted">{hint}</span>}
    </label>
  )
}

/** Name, crop, soil, method + advanced overrides. Calls onSave with only the changed shape; keeps input on failure. */
export function ZoneForm({ zone, onSave, onDone }: { zone: Zone; onSave: (patch: Partial<Zone>) => Promise<unknown>; onDone?: () => void }) {
  const [f, setF] = useState({
    name: zone.name, cropId: zone.cropId, soilId: zone.soilId, method: zone.method,
    rootDepthMm: zone.rootDepthMm?.toString() ?? '', efficiencyPct: zone.efficiency ? String(Math.round(zone.efficiency * 100)) : '', notes: zone.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (p: Partial<typeof f>) => { setF((s) => ({ ...s, ...p })); setMsg(null) }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const root = f.rootDepthMm.trim() ? Number(f.rootDepthMm) : undefined
    const eff = f.efficiencyPct.trim() ? Number(f.efficiencyPct) : undefined
    if (!f.name.trim()) return setMsg({ ok: false, text: 'Give the field section a name.' })
    if (root !== undefined && !(root >= 50 && root <= 3000)) return setMsg({ ok: false, text: 'Root depth must be between 50 and 3000 mm.' })
    if (eff !== undefined && !(eff >= 30 && eff <= 100)) return setMsg({ ok: false, text: 'Efficiency must be between 30 and 100%.' })
    setBusy(true)
    try {
      await onSave({ name: f.name.trim(), cropId: f.cropId, soilId: f.soilId, method: f.method, rootDepthMm: root, efficiency: eff === undefined ? undefined : eff / 100, notes: f.notes.trim() || undefined, updatedAt: new Date().toISOString() })
      setMsg({ ok: true, text: 'Saved.' })
      onDone?.()
    } catch (err) {
      setMsg({ ok: false, text: `Could not save: ${err instanceof Error ? err.message : 'unknown error'}. Try again.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Field section name">
        <input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Crop">
          <select className={inputCls} value={f.cropId} onChange={(e) => set({ cropId: e.target.value as CropId })}>
            {Object.values(CROPS).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Soil">
          <select className={inputCls} value={f.soilId} onChange={(e) => set({ soilId: e.target.value as SoilId })}>
            {Object.values(SOILS).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Irrigation method">
          <select className={inputCls} value={f.method} onChange={(e) => set({ method: e.target.value as IrrigationMethod })}>
            <option value="drip">Drip</option>
            <option value="sprinkler">Sprinkler</option>
          </select>
        </Field>
      </div>
      <details className="rounded-lg border border-line px-3 py-2">
        <summary className="cursor-pointer py-1 font-medium">Advanced</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Root depth (mm)" hint={`Blank uses the crop default (${CROPS[f.cropId].rootDepthMm} mm).`}>
            <input className={inputCls} type="number" inputMode="numeric" value={f.rootDepthMm} onChange={(e) => set({ rootDepthMm: e.target.value })} />
          </Field>
          <Field label="Efficiency (%)" hint={`Blank uses the ${f.method} default (${Math.round(EFFICIENCY[f.method] * 100)}%).`}>
            <input className={inputCls} type="number" inputMode="numeric" value={f.efficiencyPct} onChange={(e) => set({ efficiencyPct: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea className={inputCls} rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </div>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="btn-primary min-h-11 disabled:opacity-60">{busy ? 'Saving…' : 'Save changes'}</button>
        {msg && <span role="status" className={msg.ok ? 'text-leaf' : 'font-medium text-alert'}>{msg.text}</span>}
      </div>
    </form>
  )
}
