export default function MapSkeleton({ className = 'h-80' }: { className?: string }) {
  return (
    <div className={`grid animate-pulse place-items-center rounded-2xl bg-stale-soft text-muted ${className}`} role="status">
      Loading map…
    </div>
  )
}
