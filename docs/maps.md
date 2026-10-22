# Maps in GeoViva

All map code lives in `src/map/`. Other code imports only from `src/map/index.ts`
(`FarmMap`, `ZoneDrawMap`, `FarmLocator`, `MapSkeleton`). The three map components are
`React.lazy` modules, so MapLibre, Terra Draw and the MapLibre CSS ship in a separate chunk
that loads the first time a map is shown. Wrap them in `<Suspense fallback={<MapSkeleton />}>`.

| File | What it does |
| --- | --- |
| `config.ts` | Basemap providers (tile URLs, attribution, licence note). The one place to swap vendors. |
| `baseMap.tsx` | `useBaseMap` hook: creates one MapLibre map, controls, basemap toggle, tile-failure fallback. |
| `FarmMap.tsx` | Read-only view: zones coloured by status, labels, sensors, click handlers. |
| `ZoneDrawMap.tsx` | Draw and edit one zone boundary (Terra Draw). |
| `FarmLocator.tsx` | Place search (Nominatim), "use my location", centre pin. |
| `geo.ts` | Geodesic area, validation, bounds, area formatting, ring normaliser (unit-tested). |
| `geocode.ts` | Nominatim client with 1 request/second throttle and an in-memory cache. |

## Imagery providers

| Basemap | Default provider | Tiles |
| --- | --- | --- |
| Standard | OpenStreetMap (OSMF tile servers) | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| Satellite | Esri World Imagery | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` |

### Swapping the satellite vendor

You don't need to touch any component. Either:

1. **Env vars** (e.g. in `.env.local` or on the host):
   ```
   VITE_SATELLITE_TILES=https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=YOUR_KEY
   VITE_SATELLITE_ATTRIBUTION=© MapTiler © OpenStreetMap contributors
   ```
   `VITE_SATELLITE_TILES` takes one or more comma-separated XYZ templates.
2. **Or** edit `buildMapConfig()` in `src/map/config.ts`. Standard map, max zoom and default zoom are set there too.

Imagery always loads straight from the provider in the user's browser. Don't proxy, cache
or bulk-download tiles: most imagery licences forbid it.

### Licensing (checked October 2026)

- **OpenStreetMap tiles.** The data is ODbL. The OSMF tile servers are run on donations and
  covered by the [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/):
  light use is fine, you must show the "© OpenStreetMap contributors" attribution, and
  there's no SLA. Heavy or commercial traffic should move to a paid OSM tile host
  (MapTiler, Stadia, Thunderforest and others) by changing `standard.tiles` in `config.ts`.
  Browsers send a valid User-Agent and Referer automatically, so no custom headers are needed.
- **Esri World Imagery.** The item's licence says *"This work is licensed under the Esri
  Master License Agreement"*. The required attribution is
  "Esri, Vantor, Earthstar Geographics, and the GIS User Community" (Vantor is the new name
  for Maxar; older snippets still say Maxar). The layer is not meant for exporting tiles for
  offline use. Using the public tile endpoint for a demo or evaluation is common practice, but
  **commercial production use needs an Esri account** (ArcGIS Location Platform with an API
  key, or ArcGIS Online) **or a different licensed provider.** Confirm the terms with Esri
  before launch.
- **Alternatives:**
  - **MapTiler Satellite.** Needs an API key, has a free tier, and is licensed for
    commercial plans. Set it up with the env vars above.
  - **Mapbox Satellite.** Needs a token and is licensed under the Mapbox terms (raster
    tiles API).
  - **ArcGIS Location Platform basemap styles.** The same Esri imagery, served properly
    under a key.
  - **EOX Sentinel-2 cloudless.** Licensed CC BY-NC-SA, so no commercial use. At about
    10 m resolution it's too coarse to trace small zones.

### Attribution rule

`AttributionControl` is always on every map. It switches to the compact "ⓘ" form on narrow
screens, but it is never removed. Each raster source carries its own attribution, so the
text changes with the selected basemap. If you add a provider, put its required credit in
`attribution`.

## Tile failures

`useBaseMap` counts tile errors for each basemap; a tile that loads resets the count. After
4 errors in a row:

- If satellite fails, the map switches to standard and shows *"Satellite imagery unavailable —
  switched to standard map."*
- If standard fails, the map switches to satellite.
- If both fail, it shows *"Map tiles couldn't load. Your boundaries are still saved."*

Banners don't block the map, and the user can dismiss them. Pressing a basemap button again
retries that basemap. Overlays (zones, drawings, markers) are never removed: switching
basemap only flips raster layer visibility.

## Place search (Nominatim)

`geocode.ts` follows the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/):

- It searches only on submit, or after the user has stopped typing for 600 ms with at least
  3 characters. There's no per-keystroke autocomplete.
- It sends at most 1 request per second (enforced client-side) and caches results in memory
  per query.
- It searches Canada only (`countrycodes=ca`, `limit=5`), and the UI credits Nominatim/OSM.
- Network errors and empty results show a friendly message. Panning and zooming always work
  as a manual fallback.

For production volume, move to a hosted geocoder (MapTiler, Geoapify, LocationIQ, or your
own Nominatim). Only `searchPlaces()` needs to change.

## Drawing (Terra Draw)

`terra-draw` 1.38 with `terra-draw-maplibre-gl-adapter` 1.5:
`new TerraDraw({ adapter: new TerraDrawMapLibreGLAdapter({ map }), modes: [TerraDrawPolygonMode, TerraDrawSelectMode] })`.

- **Drawing:** each tap or click adds a corner, and drags still pan the map. Tapping the
  first corner, or pressing "Finish boundary" (which runs the polygon mode's Enter-key
  handler), closes the shape. "Undo last point" calls the polygon mode's `undo()`.
- **Done:** the map switches to the built-in `static` mode, so the map pans freely and stray
  taps don't start a new shape.
- **Editing:** uses select mode with draggable corners, tappable midpoints (each adds a
  corner) and right-click to delete a corner. "Delete point" deletes the corner the user
  tapped most recently. Keyboard delete is turned off so one key press can't wipe the zone.
- Every committed change (finish, drag end, midpoint insert, delete) calls
  `onChange(polygon, areaM2, error)`. The polygon is normalised to 7 decimals and closed,
  area is geodesic (`@turf/area`), and `error` comes from `validatePolygon` (self-crossing,
  too small, too few corners).

## Known limitations

- The OSM and Esri endpoints are fine for the pitch demo, but they aren't production-licensed
  for a commercial app (see above).
- Esri imagery in rural areas may stop at zoom 18–19. Past that, tiles are stretched.
- Zone labels and sensors are DOM markers. That's fine for tens of zones, but switch to
  symbol layers with a glyph server for hundreds.
- `ZoneDrawMap` reads `value` only when it mounts. To load a different boundary, remount it
  with a new `key`.
- Geolocation needs HTTPS (or localhost) and the user's permission. If either is missing,
  search still works.
