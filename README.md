# GeoViva

Farmer-first irrigation management for small BC vegetable and berry growers: a satellite farm map with drawn irrigation zones, soil-moisture sensors, and plain-language watering advice (Water today / Water soon / No watering needed / Check sensor). Enactus SFU Forward Vision prototype, inspired by Terra-Optima (Reboot the Earth Morocco 2025).

**Live:** https://geoviva-tau.vercel.app · Pitch and impact material: [docs/GeoViva-Pitch-Reference.docx](docs/GeoViva-Pitch-Reference.docx)

## Run

```bash
npm install
npm run dev               # http://localhost:5173
npm test                  # engine, geometry, store, wizard, services, server (in-process Postgres)
npm run typecheck:server  # api/ + server/
npm run build             # production build in dist/
```

## Data

- **Sample farm** (default): fictional farm, illustrative boundaries, simulated sensors. Timestamps follow a "sample clock" so it always looks current. Reset it in Settings.
- **My farm**: the grower's own zones, sensors and readings. Kept separate from the sample farm.
- Both are stored in the browser today through `src/data/repo.ts`. When `VITE_API_URL` is set, "My farm" uses the backend instead (`src/data/apiRepo.ts`).

## What is real and what is not

| Part | Status |
|---|---|
| Zone drawing, area, GeoJSON storage | Real — MapLibre + Terra Draw on real coordinates; geodesic area via Turf. |
| Recommendations | Real FAO-56 root-zone water balance; constants cited in [docs/sources.md](docs/sources.md), to be reviewed by an agronomist. |
| Weather | Real Open-Meteo forecast in Live mode; simulated July fortnight in Sample mode. |
| Sensor readings | Simulated on the sample farm; real via manual entry or CSV. LoRaWAN (The Things Stack) and ESP32 ingestion are implemented in the backend but need it provisioned. |
| Backend | Implemented (Vercel function + Postgres + Supabase Auth). Not provisioned: every `/api` call returns `503 backend_not_configured`. See [docs/backend.md](docs/backend.md). |
| Hardware | Concept only — see the pitch reference document. |

## Maps

Imagery config lives in `src/map/config.ts` (overridable with `VITE_SATELLITE_TILES` / `VITE_SATELLITE_ATTRIBUTION`). The prototype uses Esri World Imagery and OpenStreetMap with required attribution; commercial use needs a licensed imagery provider. Details: [docs/maps.md](docs/maps.md).

## Layout

- `src/pages/` — Home, Zones, CreateZone (wizard), EditBoundary, ZoneDetail, Sensors, Weather, Reports, Settings
- `src/map/` — FarmMap, ZoneDrawMap, FarmLocator (lazy-loaded), geometry helpers, provider config
- `src/engine/` — `recommend()` and `simulateWater()` with tests
- `src/state/farmStore.tsx` — app state (`useFarm()`), freshness rules and farmer statuses
- `src/data/` — repository layer, crop/soil constants, sample farm
- `api/`, `server/`, `db/` — backend; `firmware/` — ESP32 example sketch
- `docs/` — PRD, sources, maps, backend, design references, pitch reference
