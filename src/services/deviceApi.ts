// Client for server-side device integrations (frozen API; Agent D implements the bodies + server).
// LoRaWAN API keys and device credentials NEVER live in the browser: the browser sends the key
// once to the GeoViva server, which stores it encrypted; later calls only reference the connection.
import type { LorawanProvider, Sensor } from '../types'

export class BackendNotConfiguredError extends Error {
  constructor() {
    super('GeoViva server is not connected yet. LoRaWAN and Wi-Fi sensors need the server; manual readings work now.')
  }
}

/** True when VITE_API_URL is set (the GeoViva server is deployed and reachable). */
export function isBackendConfigured(): boolean {
  return Boolean(import.meta.env.VITE_API_URL)
}

export interface LorawanConnection {
  id: string
  provider: LorawanProvider
  label: string // e.g. "The Things Stack — eu1 / my-farm-app"
  status: 'connected' | 'error'
  lastSyncedAt?: string
  error?: string
}

export interface LorawanDevice {
  deviceId: string
  name: string
  lastSeen?: string
  lastMoisturePercent?: number
  depthCm?: number
  batteryPercent?: number
  alreadyRegistered: boolean
}

export interface Esp32Claim {
  deviceId: string
  sensor: Sensor // registered (unassigned or assigned) sensor record
  ingestUrl: string // where the device posts readings
  // The device token is delivered to the device during provisioning, never shown again in the UI.
}

export async function getLorawanConnections(): Promise<LorawanConnection[]> {
  throw new BackendNotConfiguredError()
}
export async function connectTheThingsStack(_input: { cluster: string; applicationId: string; apiKey: string }): Promise<LorawanConnection> {
  throw new BackendNotConfiguredError()
}
export async function listLorawanDevices(_connectionId: string): Promise<LorawanDevice[]> {
  throw new BackendNotConfiguredError()
}
export async function registerLorawanDevices(_connectionId: string, _devices: { deviceId: string; name: string; depthCm: number; zoneId: string | null }[]): Promise<Sensor[]> {
  throw new BackendNotConfiguredError()
}
export async function claimEsp32(_claimCode: string, _opts: { name: string; depthCm: number; zoneId: string | null }): Promise<Esp32Claim> {
  throw new BackendNotConfiguredError()
}
