# GeoViva

Advisory irrigation recommendations for small BC vegetable and berry growers. Enactus SFU Forward Vision prototype, inspired by Terra-Optima (Reboot the Earth Morocco 2025).

**Live:** https://geoviva-tau.vercel.app

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine, data and service tests
npm run build      # production build in dist/
npx vite preview   # serve dist/ locally (use this on the pitch laptop)
```

The app works offline once loaded: sample farm, sample July weather and the engine are all bundled. "Live forecast" calls Open-Meteo (no key) and falls back to a cached or bundled forecast if the network fails.

## What is real and what is not

| Part | Status |
|---|---|
| Recommendation engine | Real FAO-56 root-zone water balance. Constants cited in [docs/sources.md](docs/sources.md); to be reviewed by an agronomist. |
| Weather | Real (Open-Meteo) in Live mode; simulated July fortnight in Sample mode. |
| Soil readings | Simulated sample farm, or real measurements via CSV import. No sensor hardware exists. |
| Water savings | Modelled 14-day comparison against a fixed schedule. Not validated. |
| Hardware | Proposed concept only — not built or tested. Image prompts in [docs/hardware-image-prompts.md](docs/hardware-image-prompts.md). |

Every number in the UI carries a provenance tag: measured, live weather, simulated, estimated or projected.

## Layout

- `src/engine/` — `recommend()` and `simulateWater()`, pure functions with tests
- `src/data/` — crop and soil constants, sample farm and weather
- `src/services/` — Open-Meteo fetch with cache and fallback, CSV parser
- `src/state/farmStore.tsx` — app state (`useFarm()`), saved in localStorage
- `src/components/` — UI
- `docs/PRD.md` — product requirements and build plan

## Concept images

Generate with the prompts in `docs/hardware-image-prompts.md` and save as `public/concepts/hero.png`, `cutaway.png`, `flow.png`. The "How it works" tab shows them automatically.
