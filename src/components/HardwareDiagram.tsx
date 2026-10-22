// Agent D. Contract: default export, no props.
import FlowDiagram from './story/FlowDiagram'
import ConceptImages from './story/ConceptImages'

const STEPS = [
  'A probe in the bed measures how wet the soil is, and a second probe measures soil temperature.',
  'The ESP32 board converts the raw signal to soil moisture using calibration numbers for that soil, then sends it over Wi-Fi.',
  'GeoViva works out how much water the roots can still use before the crop is stressed (FAO-56 water balance).',
  'It checks the forecast: expected rain lowers the need, hot and dry days raise it.',
  'You get a plain answer — irrigate now, soon, or skip — with litres, timing and the reasons. You decide and turn on the water.',
]

const BOM: [string, number][] = [
  ['ESP32 development board', 16],
  ['Capacitive soil moisture sensor', 12],
  ['Waterproof DS18B20 temperature probe', 12],
  ['Jumper wires and connectors', 15],
  ['USB power supply', 15],
  ['Enclosure and cable glands', 25],
  ['Shipping, taxes and contingency', 30],
]
const BOM_TOTAL = BOM.reduce((s, [, c]) => s + c, 0)

const LIMITS = [
  'Low-cost capacitive sensors need calibration for each soil; GeoViva stores the calibration constants per zone.',
  'Readings vary with soil texture and salinity, so one number is a guide, not ground truth.',
  'Outdoor electronics need proper weatherproofing; this prototype is not field-hardened.',
  'Farm Wi-Fi can be patchy; LoRa or cellular links are a future option.',
  'Battery or solar power needs extra engineering; the prototype uses USB power.',
  'Large zones may need several probes to represent the whole field.',
  'Automatic valve control is deliberately out of scope for the MVP — the grower stays in charge.',
]

export default function HardwareDiagram() {
  return (
    <section className="space-y-6 rounded-xl border border-line bg-surface p-4 sm:p-6" aria-labelledby="hw-heading">
      <div role="note" className="rounded-lg border-2 border-sun bg-sun-soft px-4 py-3 text-lg font-bold text-sun">
        Proposed concept — not built or tested
      </div>

      <div>
        <h2 id="hw-heading" className="text-2xl font-bold text-ink">How the hardware would work</h2>
        <p className="mt-1 text-muted">
          Sensors are optional. GeoViva also works with manual entry, CSV files, or sensors a grower already owns.
        </p>
      </div>

      <FlowDiagram />

      <div>
        <h3 className="text-xl font-bold text-ink">How a reading becomes a recommendation</h3>
        <ol className="mt-3 space-y-2">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf font-bold text-surface">
                {i + 1}
              </span>
              <span className="pt-0.5 text-ink">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-xl font-bold text-ink">Bill of materials</h3>
          <p className="text-sm text-muted">Estimated prototype cost, CAD</p>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 font-semibold">Part</th>
                <th scope="col" className="py-2 text-right font-semibold">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {BOM.map(([part, cost]) => (
                <tr key={part} className="border-b border-line">
                  <td className="py-2 text-ink">{part}</td>
                  <td className="py-2 text-right tabular-nums text-ink">${cost}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="py-2 font-bold text-ink">Estimated prototype total</th>
                <td className="py-2 text-right font-bold tabular-nums text-ink">≈ ${BOM_TOTAL}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-sm text-muted">
            Prototype-grade hobbyist parts, not field-hardened. Offered to growers at cost, optional.
          </p>
        </div>

        <div>
          <h3 className="text-xl font-bold text-ink">Known limitations</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink marker:text-sun">
            {LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </div>

      <ConceptImages />
    </section>
  )
}
