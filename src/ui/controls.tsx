// Extra UI primitives (Agent C): native <dialog>, choice cards, inline help, form fields.
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

/** Modal on phones as a bottom sheet, centred card on desktop. Uses the native <dialog> (focus trap + Esc for free). */
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
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[92vh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-surface p-0 text-ink backdrop:bg-ink/50 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      {open && (
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="-m-2 grid size-11 place-items-center rounded-full hover:bg-stale-soft" aria-label="Close">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, busy, error, onConfirm, onCancel }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; error?: string | null
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="text-muted">{body}</div>
      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary min-h-11" onClick={onCancel}>Cancel</button>
        <button type="button" disabled={busy} onClick={onConfirm}
          className={`min-h-11 rounded-md px-4 py-2 font-semibold text-surface disabled:opacity-60 ${danger ? 'bg-alert hover:bg-alert/90' : 'bg-ink hover:bg-leaf'}`}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}

/** Large selectable card (radio semantics). */
export function ChoiceCard({ selected, onSelect, icon, title, subtitle, disabled, badge, vertical }: {
  vertical?: boolean; selected: boolean; onSelect: () => void; icon?: ReactNode; title: string; subtitle?: ReactNode; disabled?: boolean; badge?: string
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
      className={`relative flex min-h-14 w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${vertical ? 'sm:flex-col sm:items-center sm:text-center' : ''} ${
        selected ? 'border-leaf bg-leaf-soft' : 'border-line bg-surface hover:border-ink'
      }`}>
      {selected
        ? <CheckCircle2 aria-hidden className="absolute -top-2 -left-2 size-6 rounded-full bg-surface fill-leaf text-surface" />
        : null}
      {icon && <span className={`mt-0.5 shrink-0 ${selected ? 'text-leaf' : 'text-muted'}`}>{icon}</span>}
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        {subtitle && <span className="mt-0.5 block text-sm text-muted">{subtitle}</span>}
      </span>
      {badge && <span className="ml-auto sm:ml-0 shrink-0 rounded-full bg-stale-soft px-2 py-0.5 text-xs font-semibold text-muted">{badge}</span>}
    </button>
  )
}

/** Plain-language explanation behind an (i) toggle — works on touch, unlike hover tooltips. */
export function Help({ label = 'What is this?', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="group text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-water">
        <Info aria-hidden className="size-4" /> {label}
      </summary>
      <p className="rounded-lg bg-water-soft p-3 text-ink">{children}</p>
    </details>
  )
}

export function ErrorNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={`flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft p-3 text-sm text-alert ${className}`}>
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-semibold">{label}</label>
      {children(id)}
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  )
}

/** Input styling without a width — pair with w-28 etc. */
export const inputBase = 'min-h-11 rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink focus:border-water'
export const inputCls = `${inputBase} w-full`
