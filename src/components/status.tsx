import type { RecStatus } from '../types'

export const STATUS: Record<RecStatus, { label: string; chip: string; bar: string }> = {
  'irrigate-now': { label: 'Irrigate now', chip: 'bg-alert-soft text-alert ring-alert/30', bar: 'bg-alert' },
  'irrigate-soon': { label: 'Irrigate soon', chip: 'bg-sun-soft text-sun ring-sun/30', bar: 'bg-sun' },
  ok: { label: 'OK', chip: 'bg-leaf-soft text-leaf ring-leaf/30', bar: 'bg-leaf' },
  'skip-rain': { label: 'Skip – rain', chip: 'bg-water-soft text-water ring-water/30', bar: 'bg-water' },
}

// Shape differs per status so colour is never the only signal.
const ICON: Record<RecStatus, string> = {
  'irrigate-now': 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z',
  'irrigate-soon': 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  ok: 'M5 12.5l4.5 4.5L19 7.5',
  'skip-rain': 'M7 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.5 1.5A3.3 3.3 0 0 1 17 15H7zM9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5',
}

export function StatusIcon({ s, className = 'size-5' }: { s: RecStatus; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[s]} />
    </svg>
  )
}

export function StatusChip({ s, large = false }: { s: RecStatus; large?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-semibold ring-1 ring-inset ${STATUS[s].chip} ${large ? 'px-3 py-1.5 text-lg' : 'px-2 py-1 text-sm'}`}>
      <StatusIcon s={s} className={large ? 'size-6' : 'size-4'} />
      {STATUS[s].label}
    </span>
  )
}

export const pct = (m: number) => `${Math.round(m * 100)}%`
export const litres = (l: number) => `${Math.round(l).toLocaleString('en-CA')} L`
