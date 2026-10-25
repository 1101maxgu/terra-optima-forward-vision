import Luke from '../../guide/Luke'

/** Friendly "you've reached the Free plan's limit" card: what the limit is, where to upgrade, nothing scary. */
export default function PlanNudge({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border border-sun/40 bg-sun-soft p-4 ${className}`}>
      <Luke className="size-10 shrink-0" />
      <p className="min-w-0 flex-1 basis-56">{children}</p>
      <div className="flex flex-wrap gap-2">
        <a href="#/pricing" className="btn-primary inline-flex min-h-11 items-center">Compare plans</a>
      </div>
    </div>
  )
}
