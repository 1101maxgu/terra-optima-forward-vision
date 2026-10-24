# Outcomes

Reports > Outcomes shows water, waterings, labour and cost compared with a baseline. A one-line summary also
appears on Home. Code: `src/engine/outcomes.ts` (pure), `src/components/Outcomes.tsx`, `useProjection()` in `src/ui/farm.ts`.

None of these numbers are measured savings. They are a model, labelled so in the app.

## Two baselines

| View | Compares | Provenance |
|---|---|---|
| **Next 14 days** | Following GeoViva vs a fixed schedule (default 15 mm, 3× a week), from each zone's current trusted moisture, using `simulateWater()` | Projected |
| **So far** | Waterings logged in the last 7/30 days vs the 7/30 days before, plus what the fixed schedule would have applied | Measured (Simulated on the sample farm) |

"So far" appears once the previous period has at least 2 logged waterings. Weather differences between the two
periods are **not** adjusted: the app has no historical weather.

When GeoViva uses *more* water than the fixed schedule, the projection says why: the schedule would leave that zone
below its refill point (crop stress) on N of 14 days (`baselineStressDays`).

## What is counted

- **Water**: litres applied, gross (after method efficiency).
- **Waterings**: days with any irrigation.
- **Labour**: waterings × minutes per watering.
- **Cost** (secondary, an estimate): water m³ × $/m³ + m³ × kWh/m³ × $/kWh + labour hours × wage.

Sensor trust: zones whose recommendation confidence is below high get a caveat line. Numbers are not adjusted.

## Defaults (Settings > Costs and baseline)

| Input | Default | Status |
|---|---|---|
| Water price | $0.21/m³ | Placeholder: CRD 2026 agricultural rate (Vancouver Island). No Fraser Valley rate found; licensed wells/surface water cost close to $0. |
| Pumping energy | 0.12 kWh/m³ | Placeholder: calculated, drip at ~20 m head and 50% efficiency (range 0.05–0.30). |
| Electricity | $0.135/kWh | BC Hydro Small General Service rate page (undated, found Oct 2026); excludes the daily basic charge. |
| Labour per watering | 10 min | Placeholder: assumption, no published figure found. |
| Labour wage | $20/h | Job Bank BC median for farm hands, Nov 2025. BC minimum wage $18.25 from June 2026. |

Values are saved in the browser (`geoviva:ui:v2`, `outcomes`) and can be reset to these defaults.

## Sample farm

The sample farm has simulated waterings from 8–63 days ago on a calendar habit (15 mm, three times a week) so the
"So far" view has history to compare against. They are labelled "Calendar schedule" and "sample".
