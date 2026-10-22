// Small presentational pieces shared by Home, Zones and Weather.
import type { ReactNode } from 'react'
import { Cloud, CloudRain, Sun } from 'lucide-react'
import type { WeatherDay } from '../types'
import { dayLabel } from '../components/WeatherStrip'

export function SectionTitle({ icon, title, action }: { icon?: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {action && <div className="ml-auto text-sm font-semibold text-leaf">{action}</div>}
    </div>
  )
}

export function StatCard({ icon, tone, value, label, sub }: { icon: ReactNode; tone: string; value: ReactNode; label: string; sub?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <div className="truncate text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-sm leading-tight font-medium">{label}</div>
        {sub && <div className="text-sm leading-tight text-muted">{sub}</div>}
      </div>
    </div>
  )
}

/** Icon + word from forecast numbers only (we have no cloud-cover data, so "Dry" not "Sunny" unless warm). */
export function dayLook(d: WeatherDay) {
  if (d.rainMm >= 3) return { Icon: CloudRain, word: `Rain ${Math.round(d.rainMm)} mm`, cls: 'text-water' }
  if (d.rainMm >= 1) return { Icon: Cloud, word: 'Light rain', cls: 'text-muted' }
  return { Icon: Sun, word: d.tMaxC >= 20 ? 'Warm, dry' : 'Dry', cls: 'text-sun' }
}

export function ForecastMini({ days }: { days: WeatherDay[] }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {days.map((d, i) => {
        const { Icon, word, cls } = dayLook(d)
        return (
          <li key={d.date} className="flex flex-col items-center gap-1 rounded-xl bg-paper p-2 text-center">
            <span className="text-sm font-semibold">{i === 0 ? 'Today' : dayLabel(d.date, { weekday: 'short' })}</span>
            <Icon aria-hidden className={`size-7 ${cls}`} />
            <span className="font-semibold tabular-nums">
              {Math.round(d.tMaxC)}° <span className="font-normal text-muted">/ {Math.round(d.tMinC)}°</span>
            </span>
            <span className="text-xs text-muted">{word}</span>
          </li>
        )
      })}
    </ol>
  )
}
