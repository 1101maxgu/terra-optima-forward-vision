import type { ReactNode } from 'react'
import { ChartColumn, CircleHelp, CloudSun, Ellipsis, House, Map as MapIcon, Radio, Settings } from 'lucide-react'
import { useFarm } from '../../state/farmStore'
import LukeLauncher from '../../guide/LukeChat'
import Tour from '../../guide/Tour'
import TopBar, { Logo } from './TopBar'

const NAV = [
  { href: '/', label: 'Home', Icon: House },
  { href: '/zones', label: 'Zones', Icon: MapIcon },
  { href: '/sensors', label: 'Sensors', Icon: Radio },
  { href: '/weather', label: 'Weather', Icon: CloudSun },
  { href: '/reports', label: 'Reports', Icon: ChartColumn },
  { href: '/settings', label: 'Settings', Icon: Settings },
  { href: '/help', label: 'Help', Icon: CircleHelp },
]
const MOBILE = [
  { href: '/', label: 'Home', Icon: House, also: [] as string[] },
  { href: '/zones', label: 'Zones', Icon: MapIcon, also: [] },
  { href: '/sensors', label: 'Sensors', Icon: Radio, also: [] },
  { href: '/reports', label: 'Reports', Icon: ChartColumn, also: [] },
  { href: '/settings', label: 'More', Icon: Ellipsis, also: ['/weather', '/help'] },
]

/** Anchor for the first-run tour (src/guide/Tour.tsx). */
const tourId = (href: string) => `nav-${href === '/' ? 'home' : href.slice(1)}`

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`))

function FarmSwitcher() {
  const { farm, dataset, setDataset } = useFarm()
  return (
    <div className="rounded-xl bg-forest-2 p-3">
      <div className="truncate font-semibold text-white">{farm.name || 'My farm'}</div>
      <div className="truncate text-sm text-forest-ink/80">{farm.location || 'Location not set'}</div>
      <label className="mt-2 block text-xs font-medium text-forest-ink/80">
        Dataset
        <select
          value={dataset}
          onChange={(e) => setDataset(e.target.value as 'sample' | 'mine')}
          className="mt-1 block w-full rounded-lg border border-white/20 bg-forest px-2 py-2 text-sm text-white"
        >
          <option value="sample">Sample farm (fictional)</option>
          <option value="mine">My farm</option>
        </select>
      </label>
    </div>
  )
}

export default function AppShell({ path, children }: { path: string; children: ReactNode }) {
  // Task flows (zone wizard, boundary editor) run full-screen on phones: their own sticky Back/Next bar
  // replaces the bottom nav, so it can't be covered (matches ref 10-mobile).
  const taskFlow = path === '/zones/new' || path.endsWith('/boundary')
  return (
    <div className="min-h-dvh md:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 bg-forest p-4 text-forest-ink md:flex">
        <a href="#/" className="px-2 pt-1 text-2xl text-white">
          <Logo />
        </a>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ href, label, Icon }) => {
            const on = isActive(path, href)
            return (
              <a
                key={href}
                href={`#${href}`}
                data-tour={tourId(href)}
                aria-current={on ? 'page' : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium transition ${on ? 'bg-forest-2 text-white' : 'hover:bg-forest-2/60 hover:text-white'}`}
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </a>
            )
          })}
        </nav>
        <div className="mt-auto">
          <FarmSwitcher />
        </div>
      </aside>

      <TopBar />

      <main id="main" className={`mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-6 md:pb-10 ${taskFlow ? 'pb-0' : 'pb-28'}`}>
        {children}
      </main>

      <nav
        aria-label="Main"
        className={`fixed inset-x-0 bottom-0 z-30 grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden ${taskFlow ? 'hidden' : 'grid'}`}
      >
        {MOBILE.map(({ href, label, Icon, also }) => {
          const on = isActive(path, href) || also.some((a) => isActive(path, a))
          return (
            <a
              key={href}
              href={`#${href}`}
              data-tour={tourId(href)}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${on ? 'text-forest' : 'text-muted'}`}
            >
              <span className={`grid h-8 w-14 place-items-center rounded-full ${on ? 'bg-leaf-soft' : ''}`}>
                <Icon aria-hidden className="size-6" />
              </span>
              {label}
            </a>
          )
        })}
      </nav>

      {/* On phones the task flows' sticky Back/Next bar owns the bottom edge, so Luke steps aside there. */}
      <LukeLauncher path={path} hidden={taskFlow} />
      <Tour />
    </div>
  )
}
