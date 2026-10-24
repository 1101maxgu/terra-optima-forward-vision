// Luke, the guide's mascot: a leaf with eyes. Pure SVG so it ships with the app and works offline.
export default function Luke({ className = 'size-12', mood = 'happy' }: { className?: string; mood?: 'happy' | 'thinking' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M32 60c0-6 0-10 2-16" stroke="var(--color-forest)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M32 46C14 46 6 32 8 8c24 0 48 8 48 24 0 10-10 14-24 14Z" fill="var(--color-leaf)" />
      <path d="M14 14c10 8 18 18 20 30" stroke="var(--color-forest)" strokeOpacity=".35" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="25" cy="26" rx="5" ry="6" fill="#fff" />
      <ellipse cx="39" cy="26" rx="5" ry="6" fill="#fff" />
      {mood === 'thinking' ? (
        <>
          <circle cx="26" cy="23.5" r="2.6" fill="var(--color-ink)" />
          <circle cx="40" cy="23.5" r="2.6" fill="var(--color-ink)" />
        </>
      ) : (
        <>
          <circle cx="26" cy="27" r="2.8" fill="var(--color-ink)" />
          <circle cx="40" cy="27" r="2.8" fill="var(--color-ink)" />
          <circle cx="27" cy="26" r=".9" fill="#fff" />
          <circle cx="41" cy="26" r=".9" fill="#fff" />
        </>
      )}
      <path d="M28 35c2.5 2.5 5.5 2.5 8 0" stroke="var(--color-ink)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="33" r="2.2" fill="#f4a3a3" opacity=".7" />
      <circle cx="44" cy="33" r="2.2" fill="#f4a3a3" opacity=".7" />
    </svg>
  )
}
