-- GeoViva schema v1. Postgres 15+ (Supabase, Neon, Vercel Postgres). Idempotent-ish: run once.
-- JSONB boundary is the source of truth; a PostGIS geometry column is added only if available.
-- Sensor -> zone assignment is always explicit (sensors.zone_id); never inferred from geometry.

begin;

create table users (
  id          uuid primary key,              -- Supabase auth.users.id (JWT sub)
  email       text,
  created_at  timestamptz not null default now()
);

create table farms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 120),
  location    text not null default '' check (length(location) <= 200),
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table farm_members (
  farm_id     uuid not null references farms on delete cascade,
  user_id     uuid not null references users on delete cascade,
  role        text not null check (role in ('owner', 'editor', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (farm_id, user_id)
);
create index farm_members_user_idx on farm_members (user_id);

create table zones (
  id                 uuid primary key default gen_random_uuid(),
  farm_id            uuid not null references farms on delete cascade,
  name               text not null check (length(name) between 1 and 80),
  crop               text not null,
  soil_type          text not null,
  irrigation_method  text not null check (irrigation_method in ('drip', 'sprinkler')),
  boundary           jsonb check (boundary is null or (boundary->>'type' = 'Polygon' and jsonb_typeof(boundary->'coordinates') = 'array')),
  area_m2            double precision not null check (area_m2 > 0),  -- recomputed server-side from boundary
  root_depth_mm      double precision check (root_depth_mm > 0 and root_depth_mm <= 5000),
  efficiency         double precision check (efficiency > 0 and efficiency <= 1),
  notes              text check (length(notes) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, farm_id)  -- target for composite FKs that pin children to the same farm
);
create index zones_farm_idx on zones (farm_id);

create table lorawan_connections (
  id                   uuid primary key default gen_random_uuid(),
  farm_id              uuid not null references farms on delete cascade,
  provider             text not null check (provider in ('ttn', 'chirpstack')),
  cluster              text,                          -- TTS cluster (eu1, nam1, au1); null for ChirpStack
  application_id       text not null,
  api_key_encrypted    text not null,                 -- AES-256-GCM (GEOVIVA_ENCRYPTION_KEY); never returned
  webhook_secret_hash  text not null,                 -- HMAC-SHA256; plaintext shown once at connect
  webhook_created      boolean not null default false,
  field_mapping        jsonb not null default '{}',   -- decoded_payload field names, see server/providers/lorawan.ts
  status               text not null default 'connected' check (status in ('connected', 'error')),
  last_synced_at       timestamptz,
  last_error           text,
  created_at           timestamptz not null default now()
);
create unique index lorawan_connections_app_uidx on lorawan_connections (farm_id, provider, cluster, application_id) nulls not distinct;

create table sensors (
  id               uuid primary key default gen_random_uuid(),
  farm_id          uuid not null references farms on delete cascade,
  zone_id          uuid,
  connection_id    uuid references lorawan_connections on delete set null,
  name             text not null check (length(name) between 1 and 80),
  device_id        text not null check (length(device_id) between 1 and 64),
  type             text not null check (type in ('lorawan', 'esp32', 'manual')),
  provider         text check (provider in ('ttn', 'chirpstack')),
  depth_cm         double precision not null default 15 check (depth_cm > 0 and depth_cm <= 300),
  lat              double precision check (lat between -90 and 90),
  lon              double precision check (lon between -180 and 180),
  battery_percent  double precision check (battery_percent between 0 and 100),
  last_seen        timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (zone_id, farm_id) references zones (id, farm_id) on delete set null (zone_id)
);
-- LoRaWAN device ids are only unique per network-server application, so uniqueness is per connection
-- (spec said unique(provider, device_id); that would collide across farms using different TTS apps).
create unique index sensors_device_uidx on sensors (farm_id, type, connection_id, device_id) nulls not distinct;
create index sensors_zone_idx on sensors (zone_id);
create index sensors_connection_idx on sensors (connection_id, device_id);

create table sensor_readings (
  id                     uuid primary key default gen_random_uuid(),
  farm_id                uuid not null references farms on delete cascade,
  sensor_id              uuid references sensors on delete set null,  -- null for manual / CSV readings
  zone_id                uuid,                                         -- null while the sensor is unassigned
  timestamp              timestamptz not null,
  soil_moisture_percent  double precision not null check (soil_moisture_percent between 0 and 100),
  soil_temperature_c     double precision check (soil_temperature_c between -40 and 85),
  depth_cm               double precision check (depth_cm > 0 and depth_cm <= 300),
  battery_percent        double precision check (battery_percent between 0 and 100),
  source                 text not null check (source in ('lorawan', 'esp32', 'manual', 'csv', 'sample')),
  received_at            timestamptz not null default now(),
  foreign key (zone_id, farm_id) references zones (id, farm_id) on delete set null (zone_id),
  unique (sensor_id, timestamp)  -- webhook retries are idempotent
);
create index sensor_readings_zone_ts_idx on sensor_readings (zone_id, timestamp desc);
create index sensor_readings_sensor_ts_idx on sensor_readings (sensor_id, timestamp desc);
create index sensor_readings_farm_ts_idx on sensor_readings (farm_id, timestamp desc);

create table irrigation_events (
  id          uuid primary key default gen_random_uuid(),
  farm_id     uuid not null references farms on delete cascade,
  zone_id     uuid not null,
  timestamp   timestamptz not null,
  mm          double precision not null check (mm between 0 and 500),
  litres      double precision not null check (litres >= 0),
  note        text check (length(note) <= 500),
  source      text not null default 'manual' check (source in ('manual', 'sample')),
  created_at  timestamptz not null default now(),
  foreign key (zone_id, farm_id) references zones (id, farm_id) on delete cascade
);
create index irrigation_events_zone_ts_idx on irrigation_events (zone_id, timestamp desc);
create index irrigation_events_farm_ts_idx on irrigation_events (farm_id, timestamp desc);

-- ESP32 provisioning. Created at the factory (POST /api/admin/devices); farm_id stays null until claimed.
create table device_claims (
  id                   uuid primary key default gen_random_uuid(),
  device_id            text not null unique,
  claim_code_hash      text not null unique,   -- HMAC of the normalized label code
  factory_secret_hash  text not null,          -- HMAC of the secret flashed into the firmware
  device_token_hash    text unique,            -- HMAC of the current device token
  farm_id              uuid references farms on delete set null,
  sensor_id            uuid references sensors on delete set null,
  claimed_at           timestamptz,
  token_issued_at      timestamptz,
  last_ingest_at       timestamptz,            -- per-device rate limit window
  created_at           timestamptz not null default now()
);

create table ingestion_log (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  source         text not null,               -- ttn | chirpstack | esp32
  reason         text not null,
  connection_id  uuid,
  device_id      text,
  farm_id        uuid,
  payload        text                         -- truncated JSON, never secrets
);
create index ingestion_log_created_idx on ingestion_log (created_at desc);
create index ingestion_log_farm_idx on ingestion_log (farm_id, created_at desc);

commit;

-- Optional PostGIS mirror of zones.boundary (for spatial queries later). Skipped silently without PostGIS.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'postgis') then
    create extension if not exists postgis;
    execute $sql$
      alter table zones add column if not exists geom geometry(Polygon, 4326)
        generated always as (case when boundary is null then null
                                  else ST_SetSRID(ST_GeomFromGeoJSON(boundary::text), 4326) end) stored
    $sql$;
    execute 'create index if not exists zones_geom_idx on zones using gist (geom)';
  end if;
exception when others then
  raise notice 'PostGIS geometry column skipped: %', sqlerrm;
end $$;
