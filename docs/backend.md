# GeoViva backend

A Postgres-backed JSON API that runs as one Vercel Node.js function next to the static site. Nothing
changes for the current deployment until you provision a database and set env vars. Until then every
`/api/*` call returns `503 {"error":"backend_not_configured"}` and the app keeps using browser storage.

## Architecture

```
browser (Vite/React)                Vercel                          Postgres (Supabase / Neon)
 src/data/apiRepo.ts  ──HTTPS──▶  /api/*  ─rewrite─▶ api/router.ts ──▶ server/router.ts ──▶ tables in db/001_init.sql
 src/services/deviceApi.ts                                │
                                                          ├─ server/auth.ts        Supabase JWT verify + farm membership
TTS webhook ──▶ /api/ingest/ttn/:connectionId            ├─ server/schemas.ts     zod validation for every payload
ESP32       ──▶ /api/ingest/esp32[/token]                ├─ server/geo.ts         polygon checks + area (@turf)
factory     ──▶ /api/admin/devices                       ├─ server/crypto.ts      AES-256-GCM, HMAC, constant-time compare
                                                          ├─ server/providers/lorawan.ts  TTN implemented, ChirpStack stub
                                                          └─ server/routes/{farm,lorawan,esp32}.ts
```

- **One function, one router.** `vercel.json` rewrites `/api/:path*` to `/api/router?path=…`. This gives one
  cold start, shared code, and no Next.js. Handlers use web-standard `Request`/`Response`.
- **Server code is Node ESM.** Relative imports in `api/` and `server/` use `.js` extensions, and
  `tsconfig.server.json` (NodeNext) enforces that. Server code never imports runtime code from `src/`,
  only types. That is why `server/geo.ts` repeats the checks in `src/map/geo.ts`.
- **Server deps stay out of the client bundle.** `postgres`, `jose` and `zod` are imported only from
  `server/`. The client build was checked to contain none of them.
- **The frontend switch is one line.** `createRepository()` in `src/data/repo.ts` returns
  `apiRepository('mine')` when `VITE_API_URL` is set. The sample farm always stays local.

## Endpoints

All responses are JSON. Farm-scoped routes need `Authorization: Bearer <Supabase access token>`. Ids are UUIDs.
Validation errors return `400 {error:'invalid_request', details:[{path,message}]}`. A farm you are not a member of returns `404`.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/farms` | any user | Farms you belong to, with your role |
| POST | `/api/farms` | any user | `{name?, location?, lat, lon}`. Caller becomes owner |
| PATCH | `/api/farms/:farmId` | editor | Partial farm |
| GET | `/api/farms/:farmId/data?since=` | viewer | `FarmData` (readings default to the last 14 days, newest 20k; events to 365 days) |
| POST | `/api/farms/:farmId/zones` | editor | `Zone` fields + optional client `id`. Boundary validated and `areaM2` recomputed |
| PATCH / DELETE | `/api/farms/:farmId/zones/:zoneId` | editor | PATCH re-validates the merged zone. DELETE unassigns sensors, keeps reading history, removes the zone's irrigation events |
| POST | `/api/farms/:farmId/sensors` | editor | `{id?, name, deviceId, type, provider?, depthCm, zoneId, lat?, lon?}` |
| PATCH / DELETE | `/api/farms/:farmId/sensors/:sensorId` | editor | PATCH changes only name, depthCm, zoneId, lat, lon. DELETE of an ESP32 releases its claim and revokes its token |
| POST | `/api/farms/:farmId/sensors/:sensorId/assign` | editor | `{zoneId: uuid \| null}`. Assignment is explicit only |
| GET | `/api/farms/:farmId/sensors/:sensorId/readings?since=` | viewer | History, default 30 days |
| GET | `/api/farms/:farmId/sensors/status` | viewer | Sensors with latest reading and `freshness` (fresh ≤3 h, stale ≤24 h; manual 24/72 h) |
| POST | `/api/farms/:farmId/readings/manual` | editor | `{id?, zoneId, timestamp, soilMoisturePercent, soilTemperatureC?, depthCm?, source: manual\|csv}` |
| POST | `/api/farms/:farmId/irrigation-events` | editor | `{id?, zoneId, timestamp, mm, litres, note?}` |
| POST | `/api/farms/:farmId/lorawan/ttn/connect` | editor | `{cluster, applicationId, apiKey, fieldMapping?}`, see below |
| GET | `/api/farms/:farmId/lorawan/connections` | viewer | Never includes the key or secret |
| PATCH | `/api/farms/:farmId/lorawan/:connectionId` | editor | `{fieldMapping}` |
| GET | `/api/farms/:farmId/lorawan/:connectionId/devices` | viewer | Live list from TTS, with `alreadyRegistered` |
| POST | `/api/farms/:farmId/lorawan/:connectionId/register` | editor | `{devices:[{deviceId,name,depthCm,zoneId}]}`. Upserts |
| POST | `/api/ingest/ttn/:connectionId` | webhook secret | TTS uplink webhook |
| POST | `/api/devices/claim` | editor | `{farmId, claimCode, name, depthCm, zoneId}` returns `{deviceId, sensor, ingestUrl}` |
| POST | `/api/ingest/esp32/token` | factory secret | `{device_id, factory_secret}` returns `{token, ingestUrl}` (409 until claimed) |
| POST | `/api/ingest/esp32` | device token | `{device_id, timestamp?, soil_moisture_percent, soil_temperature_c?, battery_percent?, depth_cm?}` |
| POST | `/api/admin/devices` | `GEOVIVA_ADMIN_TOKEN` | `{deviceId}` returns `{claimCode, factorySecret}` once |
| POST | `/api/assistant` | none (rate-limited per IP) | `{question, history?, context?}` returns `{answer}`. Needs only `ANTHROPIC_API_KEY` |

Timestamps more than 5 minutes in the future are rejected. Moisture must be 0–100 %, soil temperature
−40–85 °C and battery 0–100 %.

## Schema (`db/001_init.sql`)

`users` (Supabase user id) · `farms` · `farm_members (farm_id, user_id, role owner|editor|viewer)` ·
`zones` (boundary **JSONB** GeoJSON is the source of truth; `area_m2` is set by the server; optional
PostGIS `geom` generated column is added only if PostGIS is available) · `sensors` · `sensor_readings`
(normalized: sensor_id, zone_id, timestamp, soil_moisture_percent, soil_temperature_c, depth_cm,
battery_percent, source, received_at; indexed on (zone_id, timestamp desc) and (sensor_id, timestamp desc);
`unique(sensor_id, timestamp)` makes webhook retries idempotent) · `irrigation_events` ·
`lorawan_connections` (api_key_encrypted, webhook_secret_hash, field_mapping, status, last_synced_at, last_error) ·
`device_claims` (claim_code_hash, factory_secret_hash, device_token_hash, farm_id null until claimed) ·
`ingestion_log` (every rejected or unknown uplink, with a reason).

Child tables use composite foreign keys `(zone_id, farm_id) → zones(id, farm_id)`, so the database also
refuses to link a sensor, reading or event to another farm's zone. It needs Postgres 15+
(`NULLS NOT DISTINCT`, `ON DELETE SET NULL (col)`). Supabase and Neon both qualify.

There is one deliberate change from the original plan. Sensor uniqueness is `(farm_id, type, connection_id, device_id)`, not
`(provider, device_id)`, because TTS device ids are only unique within one application. Two farms can
both have a `soil-1`.

`db/002_supabase_rls.sql` is optional and Supabase only. It adds RLS policies (members read, owners/editors write;
the secret tables have no policies). The API does not depend on them: it connects as the table owner and checks
membership in code on every request.

## Environment variables

See `.env.example`. Server side: `DATABASE_URL`, `GEOVIVA_ENCRYPTION_KEY` (32 bytes base64),
`SUPABASE_URL` and/or `SUPABASE_JWT_SECRET`, `GEOVIVA_ALLOWED_ORIGINS`, `GEOVIVA_PUBLIC_API_URL`,
`GEOVIVA_ADMIN_TOKEN`. Client side: `VITE_API_URL`. The first three are required for the backend to switch on.

## Provisioning step by step

### Option A: Supabase (database + auth in one place)

1. Create a project in a region near your farmers (e.g. `ca-central-1`).
2. SQL editor: paste and run `db/001_init.sql`. Optionally run `db/002_supabase_rls.sql` too.
   PostGIS: enable it under Database → Extensions *before* step 2 if you want the `geom` column.
3. Project Settings → Database → Connection string → **Transaction pooler** (port 6543) gives you `DATABASE_URL`.
4. Project Settings → API: the project URL is `SUPABASE_URL`. If the project still uses the legacy JWT
   secret, copy it to `SUPABASE_JWT_SECRET`. Projects on the new signing keys need only `SUPABASE_URL` (JWKS).
5. Authentication → Providers: enable Email (magic link) or another provider.
   Authentication → URL configuration: add `https://geoviva-tau.vercel.app`.
6. `openssl rand -base64 32` gives `GEOVIVA_ENCRYPTION_KEY`. Run it again for `GEOVIVA_ADMIN_TOKEN`.
7. Vercel → geoviva → Settings → Environment Variables: add everything from `.env.example`, then redeploy.
8. Frontend sign-in (built: `src/auth/`, page `#/account`). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API, the anon/publishable key). Sign-in is an email magic link using the PKCE flow, so the
   link must be opened in the same browser that requested it. Under Authentication → URL configuration, add the
   app origin (e.g. `https://geoviva-tau.vercel.app/`) as the site URL and a redirect URL.
9. Billing (optional): run `db/003_billing.sql`, then follow "Stripe billing" below.

### Option B: Neon (or Vercel Postgres) + Supabase Auth

Follow the same steps, but run `db/001_init.sql` in the Neon SQL editor (skip `002`, because it needs Supabase's `auth.uid()`).
Use the **pooled** connection string as `DATABASE_URL`. Auth still uses a (free) Supabase project for
`SUPABASE_URL`. To use another identity provider, replace `verifySupabaseToken` in `server/auth.ts`. It only
needs to return `{ userId: uuid, email? }`.

### Running migrations

The migrations are plain SQL files, run once in order: `psql "$DATABASE_URL" -f db/001_init.sql` (use the direct, non-pooler URL for DDL).
`db/003_billing.sql` adds the billing tables. Add new changes as `db/004_*.sql` and so on. Never edit a migration that has already been applied.

### Local development

`vercel dev` runs the Vite app and `/api` together with `.env.local`. The tests need no database:
`npm test` runs `server/integration.test.ts` against in-process PGlite (real Postgres 17 SQL) using the
production `postgres` client and the real migration.

## Stripe billing

Grower is a Stripe subscription per farm. The browser is never trusted about plans: only the signed webhook
writes `subscriptions`, and limits are checked on the server (`server/entitlements.ts`, numbers from
`src/pricing/plans.ts`, the same file the Pricing page shows).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/farms/:farmId/billing` | viewer | plan, limits, usage, renewal date, `billingEnabled` |
| POST | `/api/farms/:farmId/billing/checkout` | owner | `{billing: 'monthly' or 'yearly', extraSensors}` returns `{url}` (Stripe Checkout). 409 if already subscribed |
| POST | `/api/farms/:farmId/billing/portal` | owner | returns `{url}` (Stripe Customer Portal) |
| POST | `/api/billing/webhook` | Stripe signature | applied once per event id (`stripe_events`) |

Setup (use test mode first):
1. Stripe → Products: create **Grower** with two recurring CAD prices ($8/month, $80/year) and **Extra sensor**
   with two ($3/month, $30/year). Put the four price ids in `STRIPE_PRICE_*`. If you change a price, change
   `src/pricing/plans.ts` too.
2. Settings → Tax: turn on Stripe Tax and add your GST/PST registrations. Checkout uses `automatic_tax`, so
   the farmer sees the tax before paying.
3. Settings → Billing → Customer portal: allow updating the card, viewing invoices, changing the Extra sensor
   quantity, and cancelling **at the end of the billing period** with **no prorations** (no partial refunds).
4. Developers → Webhooks: endpoint `https://<your-app>/api/billing/webhook` with events `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
5. Set `STRIPE_SECRET_KEY` and `GEOVIVA_APP_URL`, redeploy, sign in, and buy Grower with test card 4242 4242 4242 4242.

Plan rules: Free is 2 zones, 1 connected sensor (manual readings never count), 30 days of history and reports. Grower is
unlimited zones, 3 sensors plus paid extras and 1 year of history. `past_due` keeps Grower for 7 days
after the period ends. When a plan ends nothing is deleted: the newest zones and sensors past the Free limits
become read-only (writes get `402 plan_read_only`, sensor uplinks are logged as `plan_limit`).

## The Things Stack (LoRaWAN)

1. In the TTS Console (e.g. `eu1.cloud.thethings.network`), go to Applications → your app → API keys → Add API key.
   Grant **Read application info / devices** (`RIGHT_APPLICATION_DEVICES_READ`). To let GeoViva create the webhook
   for you, also grant **Edit basic application settings** (`RIGHT_APPLICATION_SETTINGS_BASIC`).
2. In GeoViva, open Sensors → Connect The Things Stack and enter the cluster (`eu1`, `nam1`, `au1`), the application id and the key.
   The server calls `GET https://{cluster}.cloud.thethings.network/api/v3/applications/{app}/devices?field_mask=name&limit=1`
   to check the key. It then stores the key encrypted and generates a webhook secret.
3. Webhook: the server tries `POST /api/v3/as/webhooks/{app}` (or `PUT …/{webhook_id}` if it already exists) with
   `base_url = https://<host>/api/ingest/ttn/<connectionId>`, format `json`, header `X-GeoViva-Secret: <secret>` and
   uplink messages enabled. The connect response includes `webhook.created`. If it is `false`, add the webhook by hand in
   Integrations → Webhooks → Custom webhook:
   - Webhook format: JSON. Base URL: `webhook.url` from the response.
   - Additional headers: `X-GeoViva-Secret` = `webhook.headerValue`. This is shown only once. Reconnecting rotates it.
   - Enabled event types: **Uplink message** only.
4. Configure a **payload formatter** in TTS so `uplink_message.decoded_payload` contains moisture. Default field names are
   matched case-insensitively. A string number like `"31.5"` is accepted.
   - moisture %: `soil_moisture_percent, soil_moisture, moisture, vwc, water_soil, soil_water, soilmoisture`
   - temperature °C: `soil_temperature_c, soil_temperature, temp_soil, soil_temp, soiltemperature, temperature`
   - battery %: `battery_percent, battery_level, battery, bat_percent`. Voltage fields are ignored on purpose.

   Other decoders: `PATCH /api/farms/:farmId/lorawan/:connectionId` with
   `{"fieldMapping":{"moisture":["sensor.vwc"],"moistureScale":"fraction"}}` (dot paths are allowed; `fraction` means 0–1).
5. Register devices: the app lists the devices from TTS and you pick a name, a depth and a zone (or leave it unassigned).
   Uplinks from devices that are not registered are logged to `ingestion_log` (`unknown_device`) and answered with 202.
   Data errors also answer 202, so TTS does not mark the webhook unhealthy.

**ChirpStack** has the same `LorawanProvider` interface, but only a stub (`server/providers/lorawan.ts`). Its v4 HTTP integration
POSTs `?event=up` with `{deduplicationId, time, deviceInfo:{devEui, deviceName, applicationId}, object:{…decoded…}}`.
To add it, implement `verify`/`listDevices` against the ChirpStack API, map `object` through `normalizeDecoded()`, and add
an ingest route.

## ESP32 provisioning

1. **Factory/admin:** `curl -X POST https://<host>/api/admin/devices -H "Authorization: Bearer $GEOVIVA_ADMIN_TOKEN" -d '{"deviceId":"esp32-0001"}'`
   returns `{claimCode:"7K2M-Q9XD-4T1B", factorySecret:"…"}` exactly once. Print the claim code on the device label and
   put `DEVICE_ID`, `FACTORY_SECRET`, Wi-Fi and `API_BASE` in `firmware/esp32-geoviva/secrets.h`, then flash.
2. **Farmer:** in the app, Sensors → Add Wi-Fi sensor → type the label code. `claimEsp32()` calls `POST /api/devices/claim`. The code is
   case-insensitive, ignores dashes and spaces, and treats O as 0 and I/L as 1.
3. **Device:** on wake it calls `POST /api/ingest/esp32/token` with its id and factory secret and gets a device token (409 until claimed).
   It stores the token in NVS, then posts readings every 15 minutes with `Authorization: Bearer <token>`.
   If the farmer removes the sensor, the claim is released and the token is revoked. The device then gets 401 and asks for a new token.
4. Ingest limits: at most one reading per device per 60 s (429 otherwise), future timestamps (> 5 min) are rejected, and
   values must be in range. Rejections are logged to `ingestion_log`.

The token never passes through the browser. The farmer only ever sees the claim code.

## Security model

- **Authentication:** Supabase access tokens are verified server-side, with the HS256 secret or the project JWKS.
  Audience must be `authenticated`, and the issuer `${SUPABASE_URL}/auth/v1` when `SUPABASE_URL` is set.
- **Authorization:** every farm route calls `requireMember(farm, role)` first. Non-members get 404, so a farm's existence is not leaked.
  All child queries also filter by `farm_id`, and the composite foreign keys enforce the same rule in the database.
- **Secrets:** LoRaWAN API keys are stored AES-256-GCM encrypted. Webhook secrets, device tokens, factory secrets and claim
  codes are stored only as HMAC-SHA256, with a key derived from `GEOVIVA_ENCRYPTION_KEY` via HKDF. Plaintexts are returned
  exactly once at creation and never afterwards. Comparisons are constant-time (`timingSafeEqual`), and token lookups go
  by HMAC.
- **Validation:** zod checks every body, and unknown keys are dropped. Path ids must be UUIDs. Bodies are limited to 512 KB.
  The TTS host is fixed (`{cluster}.cloud.thethings.network`, where the cluster must match `^[a-z0-9]{2,10}$`), so
  connect requests cannot be used for SSRF.
- **CORS:** only the origins in `GEOVIVA_ALLOWED_ORIGINS` are allowed. Same-origin calls need no entry.
- **Errors:** Postgres constraint errors are mapped to 400/409 without SQL detail, and anything unexpected returns 500 `internal_error`.
  `ingestion_log` never stores secrets. The token endpoint does not log its payload.

## Tests

- `server/unit.test.ts`: zod schemas, polygon validation and area, TTS uplink normalization (generic, Dragino, Milesight,
  fraction/nested mapping, error cases), ESP32 payload validation, encryption round-trip and tamper detection, HMAC and
  constant-time compare, claim-code normalization, the farm-scoping guard against a mock DB, routing, and the 503 when unconfigured.
- `server/integration.test.ts`: the full API against PGlite with the real migration. Covers farms, zones (area recompute,
  bow-tie rejection), cross-farm denial, manual readings and events, TTN connect/list/register/ingest against a fake TTS,
  ESP32 provision/claim/token/ingest/rate-limit/revoke, zone deletion semantics, CORS, and the rewrite path.

Run `npm test`, `npx tsc --noEmit` and `npm run typecheck:server`.

## Not verified without real services or hardware

- Real Supabase JWT verification (JWKS fetch, issuer format) and a real Supabase/Neon connection through the pooler.
  The SQL runs on PGlite (Postgres 17), not on those hosts. `002_supabase_rls.sql` has not been executed at all.
- The Vercel runtime: the `/api/:path*` rewrite and the web-standard `GET/POST…` exports in `api/router.ts`.
  This has not been deployed, by design.
- Real TTS calls: the API endpoints and payloads come from the TTS HTTP API reference (`/api/v3/applications/{app}/devices`,
  `/api/v3/as/webhooks/{app}`). They were not called with a live key, and the rights needed for webhook creation are not confirmed.
  Device `last_seen_at` may be missing on some TTS versions.
- Vendor payload formatters other than the field names above, e.g. SenseCAP's `messages[]` arrays, which need a custom formatter.
- The ESP32 firmware has not been compiled or run. Calibration constants are placeholders, and TLS uses `setInsecure()` until a root CA is pinned.
- Rate limits are per device in the database. Nothing limits per IP; add Vercel firewall rules if abuse shows up.

## Known limitations (by design for now)

- `/data` returns at most the newest 20k readings in the window. Older history is paged per sensor.
- Changing `GEOVIVA_ENCRYPTION_KEY` invalidates every stored key, token and claim code. There is no key rotation yet.
- No invitations or member management endpoints yet (`farm_members` supports them).
- `ingestion_log` has no retention job. Prune it with a scheduled `delete … where created_at < now() - interval '30 days'`.
