const STEPS = ['Select Zone A', 'Drag the soil-moisture slider', 'Press “Rain incoming”', 'Open Water & Impact']

/** Small dismissible demo-path hint. Presenter clicks a step to mark progress. */
export default function GuidedHint({ step, setStep, onClose }: { step: number; setStep: (n: number) => void; onClose: () => void }) {
  return (
    <aside aria-label="Demo guide" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm">
      <span className="font-semibold tracking-wide text-muted uppercase">Demo path</span>
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={`rounded-md px-2 py-1 ${i === step ? 'bg-ink font-semibold text-surface' : i < step ? 'text-muted line-through' : 'text-ink'}`}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onClose} className="ml-auto rounded-md px-2 py-1 text-muted hover:text-ink" aria-label="Hide demo guide">
        Hide ✕
      </button>
    </aside>
  )
}
