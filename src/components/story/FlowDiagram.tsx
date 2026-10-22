// Inline SVG: probe -> ESP32 -> Wi-Fi -> GeoViva -> recommendation -> grower waters.
// Colours come from token utility classes (fill-*/stroke-*) so the theme stays the single source.

const NODES = [
  { x: 20, title: 'Soil probes', sub: ['Moisture + DS18B20', 'temperature, in bed'] },
  { x: 255, title: 'ESP32 enclosure', sub: ['Weatherproof box,', 'reads every 15 min'] },
  { x: 490, title: 'Farm Wi-Fi', sub: ['Router or phone', 'hotspot'] },
  { x: 725, title: 'GeoViva app', sub: ['This dashboard +', 'weather forecast'] },
  { x: 960, title: 'Grower waters', sub: ['Advice: how much,', 'when (manual)'] },
]
const W = 180
const TOP = 40
const H = 210

function Icon({ i, cx }: { i: number; cx: number }) {
  const cy = TOP + 70
  switch (i) {
    case 0: // bed with two probes
      return (
        <g>
          <rect x={cx - 60} y={cy - 5} width={120} height={45} rx={4} className="fill-sun-soft stroke-sun" strokeWidth={2} />
          <path d={`M${cx - 30} ${cy - 5} q-8 -30 0 -40 q8 10 0 40`} className="fill-leaf" />
          <path d={`M${cx + 30} ${cy - 5} q-8 -26 0 -34 q8 8 0 34`} className="fill-leaf" />
          <rect x={cx - 12} y={cy - 22} width={8} height={52} rx={2} className="fill-water" />
          <rect x={cx + 6} y={cy - 22} width={5} height={46} rx={2} className="fill-ink" />
        </g>
      )
    case 1: // enclosure with board + glands
      return (
        <g>
          <rect x={cx - 42} y={cy - 40} width={84} height={70} rx={8} className="fill-surface stroke-ink" strokeWidth={2.5} />
          <rect x={cx - 26} y={cy - 26} width={52} height={34} rx={3} className="fill-leaf" />
          <rect x={cx - 10} y={cy - 16} width={20} height={14} className="fill-ink" />
          <circle cx={cx - 18} cy={cy + 38} r={6} className="fill-muted" />
          <circle cx={cx + 18} cy={cy + 38} r={6} className="fill-muted" />
        </g>
      )
    case 2: // wifi arcs
      return (
        <g className="stroke-water" strokeWidth={6} strokeLinecap="round" fill="none">
          <path d={`M${cx - 45} ${cy - 10} a64 64 0 0 1 90 0`} />
          <path d={`M${cx - 28} ${cy + 8} a40 40 0 0 1 56 0`} />
          <circle cx={cx} cy={cy + 26} r={6} className="fill-water" stroke="none" />
        </g>
      )
    case 3: // laptop dashboard
      return (
        <g>
          <rect x={cx - 50} y={cy - 40} width={100} height={64} rx={5} className="fill-surface stroke-ink" strokeWidth={2.5} />
          <rect x={cx - 38} y={cy - 2} width={14} height={16} className="fill-water" />
          <rect x={cx - 18} y={cy - 18} width={14} height={32} className="fill-leaf" />
          <rect x={cx + 2} y={cy - 10} width={14} height={24} className="fill-sun" />
          <rect x={cx + 22} y={cy - 26} width={14} height={40} className="fill-leaf" />
          <rect x={cx - 62} y={cy + 26} width={124} height={8} rx={3} className="fill-ink" />
        </g>
      )
    default: // drop + check
      return (
        <g>
          <path d={`M${cx} ${cy - 44} C${cx + 40} ${cy} ${cx + 34} ${cy + 34} ${cx} ${cy + 34} C${cx - 34} ${cy + 34} ${cx - 40} ${cy} ${cx} ${cy - 44}Z`} className="fill-water-soft stroke-water" strokeWidth={3} />
          <path d={`M${cx - 14} ${cy + 8} l10 10 l20 -22`} className="stroke-leaf" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
  }
}

export default function FlowDiagram() {
  const mid = TOP + H / 2
  return (
    <svg viewBox="0 0 1160 430" role="img" aria-labelledby="flow-title flow-desc" className="h-auto w-full">
      <title id="flow-title">How the proposed GeoViva sensor concept would work</title>
      <desc id="flow-desc">
        Soil moisture and temperature probes in a growing bed connect to an ESP32 board in a weatherproof enclosure. It
        sends readings over the farm Wi-Fi to the GeoViva web app, which combines them with the weather forecast and
        gives the grower a recommendation. The grower waters manually. Alternatively, readings can come from manual
        entry, a CSV file, or sensors the grower already owns.
      </desc>
      <style>{`
        .flow-dots { stroke-dasharray: 0 16; }
        @media (prefers-reduced-motion: no-preference) {
          .flow-dots { animation: flow-move 1.2s linear infinite; }
        }
        @keyframes flow-move { to { stroke-dashoffset: -16; } }
      `}</style>

      {NODES.map((n, i) => {
        const cx = n.x + W / 2
        const app = i === 3
        return (
          <g key={n.title}>
            <rect
              x={n.x}
              y={TOP}
              width={W}
              height={H}
              rx={14}
              className={app ? 'fill-leaf-soft stroke-leaf' : 'fill-surface stroke-line'}
              strokeWidth={app ? 3 : 2}
            />
            <Icon i={i} cx={cx} />
            <text x={cx} y={TOP + 160} textAnchor="middle" className="fill-ink" fontSize={20} fontWeight={700}>
              {n.title}
            </text>
            {n.sub.map((s, k) => (
              <text key={s} x={cx} y={TOP + 182 + k * 18} textAnchor="middle" className="fill-muted" fontSize={15}>
                {s}
              </text>
            ))}
            {i < NODES.length - 1 && (
              <path
                d={`M${n.x + W + 6} ${mid} H${NODES[i + 1].x - 6}`}
                className="flow-dots stroke-water"
                strokeWidth={7}
                strokeLinecap="round"
                fill="none"
              />
            )}
          </g>
        )
      })}

      {/* Alternate input path: works with what growers already have */}
      <rect x={20} y={320} width={415} height={80} rx={14} className="fill-paper stroke-muted" strokeWidth={2} strokeDasharray="8 6" />
      <text x={227} y={354} textAnchor="middle" className="fill-ink" fontSize={19} fontWeight={700}>
        Or: manual entry · CSV · existing sensors
      </text>
      <text x={227} y={380} textAnchor="middle" className="fill-muted" fontSize={15}>
        No new hardware needed to start
      </text>
      <path
        d={`M441 360 H815 V${TOP + H + 8}`}
        className="flow-dots stroke-muted"
        strokeWidth={7}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
