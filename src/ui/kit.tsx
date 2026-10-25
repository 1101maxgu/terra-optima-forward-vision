// Shared UI primitives for the v2 app. Frozen API — agents may add, not rename.
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleHelp, Clock, Droplets } from 'lucide-react'
import type { FarmerStatus, Freshness } from '../types'

export const STATUS: Record<FarmerStatus, { label: string; cls: string; dot: string; Icon: typeof Droplets }> = {
  'water-today': { label: 'Water today', cls: 'bg-alert-soft text-alert border-alert/30', dot: 'bg-alert', Icon: Droplets },
  'water-soon': { label: 'Water soon', cls: 'bg-sun-soft text-sun border-sun/30', dot: 'bg-sun', Icon: Clock },
  'no-water': { label: 'No watering needed', cls: 'bg-leaf-soft text-leaf border-leaf/30', dot: 'bg-leaf', Icon: CheckCircle2 },
  'check-sensor': { label: 'Check sensor', cls: 'bg-stale-soft text-stale border-stale/30', dot: 'bg-stale', Icon: AlertTriangle },
}
/** Map/hex colours for each status (MapLibre needs literal colours). */
export const STATUS_HEX: Record<FarmerStatus, string> = {
  'water-today': '#b42318',
  'water-soon': '#c27803',
  'no-water': '#23703f',
  'check-sensor': '#6b7470',
}

export function StatusPill({ status, size = 'md' }: { status: FarmerStatus; size?: 'sm' | 'md' | 'lg' }) {
  const s = STATUS[status]
  const sz = size === 'lg' ? 'px-3.5 py-1.5 text-base' : size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${s.cls} ${sz}`}>
      <s.Icon aria-hidden className={size === 'lg' ? 'size-5' : 'size-4'} />
      {s.label}
    </span>
  )
}

export function FreshnessText({ freshness, lastUpdate }: { freshness: Freshness; lastUpdate: string | null }) {
  if (!lastUpdate) return <span className="text-stale">No readings yet</span>
  const t = timeAgo(lastUpdate)
  if (freshness === 'fresh') return <span className="text-muted">Updated {t}</span>
  return (
    <span className="font-semibold text-stale">
      {freshness === 'stale' ? 'Stale' : 'Out of date'} · last reading {t}
    </span>
  )
}

export function Card({ children, className = '', as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</As>
}

/** Small "?" link to a Help topic (src/guide/content.ts ids). */
export function HelpLink({ topic, label }: { topic: string; label: string }) {
  return (
    <a href={`#/help/${topic}`} aria-label={`Help: ${label}`} title="Help"
      className="inline-grid size-11 shrink-0 place-items-center rounded-full text-water hover:bg-water-soft">
      <CircleHelp aria-hidden className="size-6" />
    </a>
  )
}

export function PageHeader({ title, subtitle, actions, help }: { title: string; subtitle?: ReactNode; actions?: ReactNode; help?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}{help && <HelpLink topic={help} label={title} />}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function SampleBanner() {
  return (
    <p className="rounded-xl border border-sun/40 bg-sun-soft px-4 py-2 text-sm text-ink">
      <span className="font-semibold">Demo farm.</span> A pretend farm to explore. Nothing you change is kept.
    </p>
  )
}

export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.round((now - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(m)) return 'unknown'
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}
export const fmtLitres = (l: number) => `${Math.round(l).toLocaleString('en-CA')} L`
export const fmtPct = (p: number | null) => (p === null ? '—' : `${Math.round(p)}%`)
