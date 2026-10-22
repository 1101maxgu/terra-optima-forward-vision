import { useEffect, useRef, useState } from 'react'
import { Bell, Leaf, CircleAlert, Info, Radio, Search, Sprout, TriangleAlert } from 'lucide-react'
import { navigate } from '../../router'
import { useFarm } from '../../state/farmStore'
import { timeAgo } from '../../ui/kit'
import { useAlerts, type FarmAlert } from '../../ui/farm'

export const ALERT_ICON: Record<FarmAlert['level'], { Icon: typeof Info; cls: string }> = {
  alert: { Icon: CircleAlert, cls: 'text-alert' },
  warn: { Icon: TriangleAlert, cls: 'text-sun' },
  info: { Icon: Info, cls: 'text-water' },
}

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

function SearchBox() {
  const { zones, sensors } = useFarm()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const t = q.trim().toLowerCase()
  const hits = t
    ? [
        ...zones.filter((z) => z.name.toLowerCase().includes(t)).map((z) => ({ key: z.id, label: z.name, kind: 'Zone', href: `/zones/${z.id}` })),
        ...sensors
          .filter((s) => s.name.toLowerCase().includes(t) || s.deviceId.toLowerCase().includes(t))
          .map((s) => ({ key: s.id, label: s.name, kind: 'Sensor', href: '/sensors' })),
      ].slice(0, 8)
    : []
  const go = (href: string) => {
    navigate(href)
    setQ('')
    setOpen(false)
  }
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (hits[0]) go(hits[0].href)
        }}
      >
        <label className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-water">
          <Search aria-hidden className="size-5 text-muted" />
          <span className="sr-only">Search zones and sensors</span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search zones or sensors…"
            className="h-11 w-full bg-transparent outline-none"
          />
        </label>
      </form>
      {open && t && (
        <ul className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {hits.length === 0 && <li className="px-4 py-3 text-muted">No zones or sensors match “{q}”.</li>}
          {hits.map((h) => (
            <li key={h.kind + h.key}>
              <button type="button" onClick={() => go(h.href)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-paper">
                {h.kind === 'Zone' ? <Sprout aria-hidden className="size-5 text-leaf" /> : <Radio aria-hidden className="size-5 text-water" />}
                <span className="font-medium">{h.label}</span>
                <span className="ml-auto text-sm text-muted">{h.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AlertsBell() {
  const alerts = useAlerts()
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Alerts: ${alerts.length}`}
        className="relative grid size-12 place-items-center rounded-xl hover:bg-paper"
      >
        <Bell aria-hidden className="size-6" />
        {alerts.length > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-5 place-items-center rounded-full bg-alert px-1 text-xs font-bold text-white">{alerts.length}</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 z-40 mt-1 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="border-b border-line px-4 py-3 font-semibold">Alerts & notifications</div>
          {alerts.length === 0 ? (
            <p className="px-4 py-4 text-muted">All clear. Nothing needs your attention.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-auto">
              {alerts.map((a) => {
                const { Icon, cls } = ALERT_ICON[a.level]
                return (
                  <li key={a.id}>
                    <a href={`#${a.href}`} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-paper">
                      <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${cls}`} />
                      <span className="flex-1">{a.text}</span>
                      {a.at && <span className="text-sm whitespace-nowrap text-muted">{timeAgo(a.at)}</span>}
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <span className="grid size-9 place-items-center rounded-xl bg-leaf text-white">
        <Leaf aria-hidden className="size-5" />
      </span>
      GeoViva
    </span>
  )
}

export default function TopBar() {
  return (
    <header className="z-20 border-b md:sticky md:top-0 border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <a href="#/" className="text-xl text-forest md:hidden">
          <Logo />
        </a>
        <div className="hidden flex-1 md:block">
          <SearchBox />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <AlertsBell />
          <span className="hidden items-center gap-2 rounded-xl px-2 py-1 text-sm font-medium text-muted lg:flex">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-leaf-soft font-bold text-forest">FA</span>
            Farm account
          </span>
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden">
        <SearchBox />
      </div>
    </header>
  )
}
