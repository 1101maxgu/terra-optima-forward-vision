# GeoViva — 4-Day Build Plan + PRD (Forward Vision Capstone Pitch, Oct 25)

## Context
Enactus SFU Forward Vision Capstone Pitch, **Sat Oct 25, Harbour Centre**: 1 min setup, **5 min pitch, 2.5 min Q&A**. Today is Oct 21 → 4 days. Judging weights: **Business model/sustainability/growth 40%**, Innovation & solution design 20%, Feasibility 15%, Presentation (incl. slides, Q&A) 15%, Problem & research 10%. SDG alignment is explicitly scored.

GeoViva: software-first, advisory-only irrigation recommendations for small BC growers; transparent FAO-56-style rules; Open-Meteo weather with offline fallback; no real hardware built (SVG + ChatGPT concept visuals only). Repo is empty (greenfield). One developer; the team handles research/outreach (no grower calls possible before the pitch; research comes later).

The app is proof for the 20% + 15% criteria. It cannot carry the 40%, so the business case, SDG indicators and honest "what has to be true" framing get as much attention as the code. Slides are NOT part of this build (user decision); the pitch script and Q&A prep are written after the app.

## Decisions settled
- Segment: region-agnostic for demo, Fraser Valley-style zone mix (tomato, lettuce, blueberry); beachhead to be chosen by later interviews.
- Advisory only; rules-based engine; no ML claims. No LLM explainer, no export, no accounts, no sensor/backend path.
- **Keep:** 3-zone dashboard, zone detail + "Why" panel, scenario sliders/presets, modelled water comparison, Open-Meteo + bundled fallback, provenance badges, **CSV import**, in-app "How the hardware would work" SVG diagram, Impact/SDG panel, presentation mode + reset button.
- SDGs: lead **SDG 6** and **SDG 13**, **SDG 2** via the free community-farm tier. Indicators: litres avoided, water per kg of crop, farms served. (SDG 12 dropped from the headline.)
- Name GeoViva kept (user states it is original; a quick CIPO search is still cheap insurance).
- Deploy to Vercel at the end; presenting laptop also holds a local production build (`dist/`) as the actual demo copy.
- Pricing lowered; 1-year financial table (below). All figures illustrative, not validated.

## Honest challenges to carry into Q&A
1. Free incumbent: the BC Agricultural Irrigation Scheduling Calculator. Our wedge: multi-zone, forecast-aware, tells you what to do (time saved), with a free tier for community farms.
2. Water savings alone are small (15% of $1,000 ≈ $150). At $99/yr the tool pays for itself even on the doc's own example, but this is a hypothesis for the pilot, not a result.
3. Savings (e.g. 33%) come from a modelled wasteful baseline (fixed 3×15 mm/week). Never present as expected results.
4. Cheap soil sensors need per-soil calibration; hardware is concept-only and labelled "proposed concept, not built or tested".
5. No grower interviews yet: pitch says "discovery stage, hypotheses we will test", not validation.

## PRD

### Goal
In a 90-second live demo a judge sees the system take data, explain a recommendation, and respond to a changed condition; the rest of the 5 minutes lands the business model, social tier and pilot plan.

### Persona
"Sam": 5-acre market garden/berry grower in BC, 3–5 beds, timer or by-feel watering, no precision-ag tools.

### Non-goals
Valve/pump automation, accounts/auth, backend/DB, ML, vendor sensor APIs, mobile app, payments, PDF/CSV export, LLM text.

### Features and acceptance criteria
1. **Dashboard** — 3 zone cards (moisture %, soil temp, status chip: Irrigate now / Soon / OK / Skip – rain), current weather, 7-day forecast strip. *AC:* loads with no network.
2. **Zone detail + Why panel** — moisture vs. refill/stress thresholds chart; recommendation (Y/N, mm, litres, suggested timing); itemised factors. *AC:* text is generated from the engine's actual numbers.
3. **Judge controls** — sliders: soil moisture, forecast rain, ET₀/temperature; crop and irrigation-method dropdowns; presets "Hot dry week", "Rain incoming", "Saturated soil". *AC:* updates <100 ms.
4. **Water-use comparison** — 14-day modelled run, farmer's fixed schedule (editable, default 3×15 mm/wk) vs. GeoViva. Litres, avoided litres, % per zone and total, labelled "Modelled – not validated", formula in tooltip.
5. **Data layer with provenance** — bundled sample data; live Open-Meteo; manual entry; **CSV import** (date, zone, moisture). *AC:* fetch failure → cached/bundled weather + "offline: sample weather" badge; malformed CSV → clear error, no crash.
6. **Impact panel** — SDG 6/13/2 tags with the three indicators; litres avoided is computed (tagged `projected`); water per kg and farms served shown as "pilot metrics to collect".
7. **How it works (hardware concept)** — SVG flow: probe in bed → ESP32 → Wi-Fi → GeoViva → recommendation, with BOM (~CAD $125) and limitations; banner "Proposed concept — not built or tested". Slot for ChatGPT-rendered images.
8. **Presentation mode + Reset demo** — larger type/contrast for projector, one-click return to default scenario, guided-path hint overlay (pick zone → drag moisture → rain preset → comparison).

### Provenance tags
`measured` (none in prototype; reserved), `live-weather`, `simulated`, `estimated` (engine-derived), `projected` (savings/impact). Badges plus legend. Impact numbers are only ever `projected`.

### Recommendation engine (pure functions, `src/engine/`)
- `ETc = Kc × ET₀` (ET₀ from Open-Meteo `et0_fao_evapotranspiration`; fallback bundled value).
- `TAW = (θ_fc − θ_wp) × rootDepth_mm` from soil preset (sandy loam / loam / silt loam) and crop root depth; `RAW = p × TAW` (allowed depletion per crop).
- `Dr = (θ_fc − θ_now) × rootDepth_mm`; 48 h projection `Dr_future = Dr + ΣETc − Σeffective_rain` (effective rain: 0 below ~3 mm, else ~80%).
- Irrigate if `Dr_future ≥ RAW`; Skip–rain if forecast keeps it below; else OK/Soon.
- Net = refill to field capacity; gross = net / efficiency (drip 0.90, sprinkler 0.75); litres = mm × area_m².
- Calibration offsets (`a`, `b`) kept as editable constants for any real sensor later.
- Constants (Kc, p, root depth, θ values) live in `crops.ts` / `soils.ts` with FAO-56 / BC Ministry citations and a "to be verified by an agronomist" note in-app.

### Stack
Vite + React + TypeScript + Tailwind + Recharts, Vitest, `localStorage`, Open-Meteo (no key), Vercel static deploy. No backend.

### File layout
```
src/engine/ irrigation.ts irrigation.test.ts
src/data/ crops.ts soils.ts sampleFarm.ts sampleWeather.json
src/services/ weather.ts (fetch+cache+fallback) csv.ts
src/state/ farmStore.ts
src/components/ ZoneCard ZoneDetail WhyPanel ScenarioControls WaterComparison
                ImpactPanel HardwareDiagram ProvenanceBadge WeatherStrip
src/App.tsx main.tsx
docs/ PRD.md sources.md hardware-image-prompts.md
```

## 4-day schedule
| Day | Date | Work | Exit check |
|---|---|---|---|
| 1 | Oct 21 (today) | Scaffold, engine + tests, crop/soil data with citations, sample farm | Vitest passes 6 engine cases |
| 2 | Oct 22 | Dashboard, zone detail, Why panel, scenario controls. (Evening: Module 3 online, book a mentor slot.) | Sliders change recommendation live |
| 3 | Oct 23 | Open-Meteo + fallback, water comparison, CSV import, Impact panel, SVG hardware diagram, provenance badges | Airplane-mode run works end to end |
| 4 | Oct 24 | Presentation mode + reset, polish, deploy to Vercel, local `dist/` on presenting laptop, rehearsal, 60 s backup screen recording, bug fixes only | Full guided path runs clean 3× |
| Pitch | Oct 25 | Arrive early; open local build before the 1-minute setup | — |

Cut order if behind schedule: CSV import → hardware diagram polish → impact panel details. Never cut: engine, Why panel, sliders, comparison, offline fallback.

## Pitch structure (5 min + 2.5 Q&A; script to be written after the app)
- 0:00–0:40 problem and evidence (BC drought/water pressure, fixed-schedule watering, honest "discovery stage")
- 0:40–2:10 live demo (guided path above, ≤90 s)
- 2:10–4:20 business model (pricing, 1-year table, free community tier, funding), SDGs + indicators, pilot plan, what has to be true
- 4:20–5:00 ask and close
Q&A prep sheet (15 hardest judge questions) is a later deliverable.

## Business model (illustrative, hypotheses to validate)
Pricing (lowered): Free (1 zone, manual entry) · **Grower $99/yr** (up to 5 zones, weather, history, CSV) · **Farm Pro $249/yr** (more zones, reports) · optional sensor kit **at cost (~$125)** · setup/training $99–$199.
Funding model: paying farms + grants/water-programme sponsors fund a **free tier for community and food-security farms** (SDG 2).

**1-year table** (volunteer-run, quarterly ramp; avg revenue/paying farm $129/yr = 20 Grower + 5 Pro mix):
| | Q1 | Q2 | Q3 | Q4 | Year 1 |
|---|---|---|---|---|---|
| Paying farms (end of quarter) | 0 | 5 | 15 | 25 | 25 |
| Subscription revenue | $0 | $161 | $484 | $806 | **$1,451** |
| Variable cost ($20/farm/yr) | – | – | – | – | $250 |
| Fixed cost (hosting, tools, pilot travel, insurance, sensor demo kits) | $1,000 | $1,000 | $1,000 | $1,000 | $4,000 |
| Operating result | | | | | **−$2,800** |
| Grant/sponsor target | | | | | $3,000 (also funds 5 free community farms) |

Exit run-rate ARR ≈ $3,225. **Break-even ≈ 37 paying farms** ($4,000 ÷ ($129 − $20)), targeted around month 15–18, versus ~101 under the original $25k fixed-cost assumption (possible only because development stays volunteer-run in year 1; full founder pay would raise it). These are assumptions, not validated forecasts.

## Hardware concept visuals (ChatGPT prompts; saved in `docs/hardware-image-prompts.md`)
All images labelled "Proposed concept — not built or tested". Do not show brand logos or real readings.
1. **Hero install:** "Photorealistic image of a small weather-resistant grey plastic enclosure on a short wooden stake beside a raised vegetable bed on a small BC farm in late summer; a thin capacitive soil-moisture probe and a separate waterproof temperature probe on cables enter the soil near tomato roots; cable glands visible; soft golden light, mountains in the background; no text or logos; documentary photo style."
2. **Close-up / cutaway:** "Product render, clean studio background, cutaway of a small outdoor sensor enclosure showing an ESP32 development board, a small USB power module, terminal connectors, and two cables with cable glands leading to a slim capacitive soil moisture probe and a stainless waterproof DS18B20 temperature probe; labelled callout lines with no readable text; realistic plastics and PCB detail."
3. **System flow infographic:** "Flat modern infographic, five steps left to right: soil probe in a garden bed → ESP32 controller → Wi-Fi signal → laptop showing a simple irrigation dashboard → farmer watering decision; muted green and teal palette, large icons, minimal text, white background."
Follow-ups: ask for 16:9 and a square variant for slides.

## Verification
- **Engine (Vitest):** dry+no rain → irrigate with correct mm/litres; dry + 15 mm rain forecast → skip; saturated → OK; drip vs sprinkler changes litres; crops differ at same moisture; missing ET₀/weather fallback path.
- Hand-check one zone in a spreadsheet to ±1 mm.
- Offline test: network disabled → loads, fallback badge, recommendations work.
- CSV: valid file loads; malformed file shows an error without breaking state.
- Run production build locally on the presenting laptop and projector; time the guided path to ≤90 s; rehearse 3×; 60 s backup recording.
- Run the Vercel URL on a phone as a second fallback.

## Work allocation (subagents)
**Model:** all agents run on Opus 5.5 (user choice). **Isolation:** one git worktree and branch per agent; I merge. Needs one initial scaffold commit (plain message, no attribution lines).

**Step 0 — me, Day 1 (~30–45 min, serial):** scaffold Vite/React/TS/Tailwind/Vitest; write the frozen contract: `src/types.ts` (Zone, Crop, Soil, WeatherDay, Reading, Recommendation, Provenance), empty engine signatures (`recommend(zone, reading, forecast, scenario)`, `simulateWater(zone, weather, schedule)`), and the sample-farm data shape. Commit. Nothing parallel starts before this. (Reason: lets agents build against the same shapes so merges are mechanical.)

| Agent | Branch | Owns (only these paths) | Done when |
|---|---|---|---|
| **A Engine** | `agent/engine` | `src/engine/*`, `src/data/crops.ts`, `src/data/soils.ts`, `docs/sources.md` | 6 Vitest cases pass; constants carry citations; hand-check matches ±1 mm |
| **B UI shell** | `agent/ui` | `src/components/{ZoneCard,ZoneDetail,WhyPanel,ScenarioControls,WaterComparison,WeatherStrip,ProvenanceBadge}`, styling (light, high-contrast, earthy green/teal, projector-size type) | Runs on stubbed engine output; sliders update live; uses one design skill for polish |
| **C Data services** | `agent/data` | `src/services/{weather,csv}.ts` + tests, `src/data/{sampleFarm.ts,sampleWeather.json}` | Offline fallback works; Open-Meteo parsed; bad CSV yields an error, not a crash |
| **D Story pieces** | `agent/story` | `src/components/{HardwareDiagram,ImpactPanel}`, presentation mode + Reset logic components, `docs/hardware-image-prompts.md` | SVG labelled "Proposed concept — not built or tested"; SDG 6/13/2 indicators shown; reset restores default scenario |

**Revision (user request): B owns the whole UI.** B also owns `src/App.tsx` layout, `src/theme.css`/design tokens, presentation mode + reset UI, and composes D's diagram and Impact panel. B publishes the theme tokens first (within ~30 min) so D can style with them. D keeps only SVG/content/prompt doc.

**Me (integrator):** owns `src/state/farmStore.ts`, merges, conflict resolution, deploy (not layout). Agents must not edit files outside their ownership; they report any needed contract change to me instead of changing `types.ts`.

**Review agents (Day 3–4):** `ecc:typescript-reviewer` / `ecc:react-reviewer` on the merged app; `ecc:e2e-runner` (Playwright) for the offline test and the guided demo path; `ecc:a11y-architect` quick pass on projector contrast.

**Checkpoints (major milestones only, each with a short summary + how to run it):**
1. Contract frozen and committed (end of step 0).
2. Engine + UI merged and working with sample data (end of Day 2).
3. Full integration: weather, CSV, comparison, Impact, diagram (end of Day 3).
4. Deployed build + backup recording ready (Day 4, before rehearsal).

## Later (not in the 4-day build)
Grower research/outreach plan and interview script; Q&A sheet; slides and speaker notes; agronomist review of constants; pilot design (split-field or baseline vs. GeoViva season, metered water, yield).
