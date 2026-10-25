// First-run tour led by Luke. Points at real nav items via data-tour attributes (sidebar on desktop,
// bottom tabs on phones). Shown once; replay from Help or Settings.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import Luke from './Luke'

const DONE_KEY = 'geoviva:tour:v1'
const START_EVENT = 'geoviva:tour'

interface Step {
  target?: string
  title: string
  text: string
}

const STEPS: Step[] = [
  { title: 'Hi, I’m Luke!', text: 'I’ll show you around GeoViva in under a minute. You’re looking at the Sample farm, a pretend farm you can explore without breaking anything.' },
  { target: 'nav-home', title: 'Home', text: 'Your farm at a glance: which field sections need water today, the latest readings, the weather and any alerts.' },
  { target: 'nav-zones', title: 'Field sections', text: 'A field section is one field or bed. Tap “Create new field section” to draw yours on the map and get watering advice for it.' },
  { target: 'nav-sensors', title: 'Sensors', text: 'Add soil sensors here, or just type in readings yourself. No hardware needed to start.' },
  { target: 'nav-reports', title: 'Reports', text: 'See how much water you’ve used, section by section.' },
  { target: 'nav-settings', title: 'Settings', text: 'Switch from the Sample farm to My farm when you’re ready. The Help guides live here too.' },
  { target: 'luke', title: 'Ask me anything', text: 'Tap me whenever you’re stuck. Have a great season!' },
]

export function startTour() {
  window.dispatchEvent(new Event(START_EVENT))
}

const visible = (name: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find((el) => el.getClientRects().length > 0) ?? null

export default function Tour() {
  const [step, setStep] = useState<number | null>(() => {
    try {
      return sessionStorage.getItem(DONE_KEY) ? null : 0
    } catch {
      return null // storage blocked: don't nag on every load
    }
  })
  const [rect, setRect] = useState<DOMRect | null>(null)
  const next = useRef<HTMLButtonElement>(null)

  const finish = useCallback(() => {
    setStep(null)
    try {
      sessionStorage.setItem(DONE_KEY, '1')
    } catch {
      /* storage unavailable */
    }
  }, [])

  useEffect(() => {
    const on = () => setStep(0)
    window.addEventListener(START_EVENT, on)
    return () => window.removeEventListener(START_EVENT, on)
  }, [])

  const target = step === null ? undefined : STEPS[step].target
  useLayoutEffect(() => {
    if (step === null) return
    const measure = () => setRect(target ? visible(target)?.getBoundingClientRect() ?? null : null)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step, target])

  useEffect(() => {
    if (step === null) return
    next.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [step, finish])

  if (step === null) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  // Sidebar items: bubble to their right. Bottom tabs / corner button: bubble above. No target: centred.
  const W = Math.min(340, window.innerWidth - 32)
  const pos: CSSProperties =!rect
    ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    : rect.right < window.innerWidth * 0.4 && rect.top < window.innerHeight - 200
      ? { left: rect.right + 16, top: Math.max(16, Math.min(rect.top - 8, window.innerHeight - 260)) }
      : { left: Math.max(16, Math.min(rect.left + rect.width / 2 - W / 2, window.innerWidth - W - 16)), bottom: window.innerHeight - rect.top + 16 }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="absolute inset-0 bg-ink/40" onClick={finish} />
      {rect && (
        <div aria-hidden className="pointer-events-none absolute rounded-xl ring-4 ring-sun"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />
      )}
      <div className="absolute rounded-2xl bg-surface p-4 shadow-xl" style={{ ...pos, width: W }}>
        <div className="flex items-start gap-3">
          <Luke className="size-12 shrink-0" />
          <div className="min-w-0">
            <h2 id="tour-title" className="font-bold">{s.title}</h2>
            <p className="mt-1 text-sm">{s.text}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{step + 1} of {STEPS.length}</span>
          <div className="flex gap-2">
            {!last && <button type="button" onClick={finish} className="min-h-11 rounded-lg px-3 font-semibold text-muted hover:text-ink">Skip</button>}
            {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="btn-secondary min-h-11">Back</button>}
            <button ref={next} type="button" onClick={() => (last ? finish() : setStep(step + 1))} className="btn-primary min-h-11">
              {last ? 'Done' : step === 0 ? 'Show me' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
