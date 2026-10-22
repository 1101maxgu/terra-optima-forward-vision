// Basemap provider config. Swap imagery vendors here or via env vars — components never hard-code tile URLs.
// See docs/maps.md for licensing. Imagery is always loaded straight from the provider (never proxied/cached).

export type BasemapId = 'standard' | 'satellite'

export interface Basemap {
  id: BasemapId
  label: string
  tiles: string[]
  tileSize: number
  attribution: string
  maxzoom: number
  providerName: string
  licenseNote: string
}

export interface MapConfig {
  standard: Basemap
  satellite: Basemap
  maxZoom: number
  defaultZoom: number
}

export interface MapEnv {
  VITE_SATELLITE_TILES?: string // comma-separated tile URL templates
  VITE_SATELLITE_ATTRIBUTION?: string
}

export function buildMapConfig(env: MapEnv = {}): MapConfig {
  const satTiles = env.VITE_SATELLITE_TILES?.split(',').map((s) => s.trim()).filter(Boolean)
  const custom = !!satTiles?.length
  return {
    maxZoom: 19,
    defaultZoom: 16,
    standard: {
      id: 'standard',
      label: 'Standard',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      providerName: 'OpenStreetMap',
      licenseNote:
        'OSM tile servers are for light use under the OSMF Tile Usage Policy (attribution required, no bulk/offline downloading). Use a commercial OSM tile host for production traffic.',
    },
    satellite: {
      id: 'satellite',
      label: 'Satellite',
      tiles: custom ? satTiles : ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: env.VITE_SATELLITE_ATTRIBUTION?.trim() || (custom ? 'Imagery © provider' : 'Tiles © Esri — Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community'),
      providerName: custom ? 'Custom imagery provider' : 'Esri World Imagery',
      licenseNote: custom
        ? 'Custom imagery from VITE_SATELLITE_TILES — check that vendor’s terms and attribution.'
        : 'Esri World Imagery is licensed under the Esri Master License Agreement. Fine for demos/evaluation; commercial production use needs an ArcGIS Location Platform (or other Esri) account or a different licensed provider.',
    },
  }
}

export const mapConfig: MapConfig = buildMapConfig(import.meta.env as MapEnv)
