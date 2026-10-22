import { useEffect, useState } from 'react'
import { useFarm } from './state/farmStore'
import ZoneCard from './components/ZoneCard'
import ZoneDetail from './components/ZoneDetail'
import ScenarioControls from './components/ScenarioControls'
import WeatherStrip from './components/WeatherStrip'
import WaterComparison from './components/WaterComparison'
import CsvImport from './components/CsvImport'
import GuidedHint from './components/GuidedHint'
import { ProvenanceLegend } from './components/ProvenanceBadge'
import ImpactPanel from './components/ImpactPanel'
import HardwareDiagram from './components/HardwareDiagram'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'water', label: 'Water & Impact' },
  { id: 'how', label: 'How it works' },
] as const
type Tab = (typeof TABS)[number]['id']

export default function App() {
  const { farm, zones, weatherMode, setWeatherMode, presentation, setPresentation, resetDemo, overrides, selectedZoneId } = useFarm()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [hintStep, setHintStep] = useState(0)
  const [hintOpen, setHintOpen] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('present', presentation)
  }, [presentation])

  // Advance the demo hint as the presenter performs each step.
  const anyMoisture = overrides[selectedZoneId]?.moisture !== undefined
  const rainPreset = Object.values(overrides).some((o) => o?.rainNext48hMm === 18)
  useEffect(() => {
    setHintStep((s) => {
      if (tab === 'water') return 3
      if (s <= 1 && anyMoisture) return 2
      if (s === 2 && rainPreset) return 3
      return s
    })
  }, [tab, anyMoisture, rainPreset, selectedZoneId])

  function reset() {
    resetDemo()
    setTab('dashboard')
    setHintStep(0)
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="font-serif text-3xl leading-none tracking-tight">GeoViva</div>
              <div className="mt-1 text-sm text-muted">Smarter irrigation decisions for BC growers</div>
            </div>
          </div>
          <div className="text-sm present:hidden">
            <div className="font-semibold">{farm.name}</div>
            <div className="text-muted">{farm.location}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Weather source" className="inline-flex rounded-md border border-line p-0.5">
              {(
                [
                  ['sample', 'Sample July week'],
                  ['live', 'Live forecast'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={weatherMode === m}
                  onClick={() => setWeatherMode(m)}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${weatherMode === m ? 'bg-ink text-surface' : 'text-ink hover:bg-paper'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" aria-pressed={presentation} onClick={() => setPresentation(!presentation)} className="btn-secondary">
              {presentation ? 'Exit presentation' : 'Presentation mode'}
            </button>
            <button type="button" onClick={reset} className="btn-primary">
              Reset demo
            </button>
          </div>
        </div>
        <nav aria-label="Sections" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={`border-b-[3px] px-2.5 py-3 sm:px-4 font-semibold whitespace-nowrap ${tab === t.id ? 'border-leaf text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
        {hintOpen ? (
          <GuidedHint step={hintStep} setStep={(i) => (i === 3 ? setTab('water') : setHintStep(i))}onClose={() => setHintOpen(false)} />
        ) : (
          <button type="button" onClick={() => setHintOpen(true)} className="w-fit text-sm text-muted underline underline-offset-4 hover:text-ink">
            Show demo path
          </button>
        )}

        {tab === 'dashboard' && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {zones.map((z) => (
                <ZoneCard key={z.id} zone={z} />
              ))}
            </div>
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <ZoneDetail />
              <ScenarioControls />
            </div>
            <WeatherStrip />
          </>
        )}

        {tab === 'water' && (
          <>
            <WaterComparison />
            <ImpactPanel />
            <div className="present:hidden">
              <CsvImport />
            </div>
          </>
        )}

        {tab === 'how' && <HardwareDiagram />}

        <footer className="mt-4 border-t border-line pt-5 present:hidden">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Where each number comes from</h2>
          <ProvenanceLegend />
          <p className="mt-4 text-sm text-muted">
            Advisory only — GeoViva suggests, the grower decides. Rules follow FAO-56; crop and soil constants to be verified by an agronomist.
          </p>
        </footer>
      </main>
    </div>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 40 40" className="size-10" aria-hidden>
      <rect width="40" height="40" rx="8" fill="#23703f" />
      <path d="M20 8c4.5 6 8 10.5 8 15a8 8 0 0 1-16 0c0-4.5 3.5-9 8-15z" fill="#dcEEF4" />
      <path d="M20 31V20m0 4l-4-3m4 1l4-3" stroke="#23703f" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}
