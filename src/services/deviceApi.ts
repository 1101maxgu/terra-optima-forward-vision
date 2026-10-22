// Client for server-side device integrations (frozen API; Agent D implements the bodies + server).
// LoRaWAN API keys and device credentials NEVER live in the browser: the browser sends the key
// once to the GeoViva server, which stores it encrypted; later calls only reference the connection.
import type { LorawanProvider, Sensor } from '../types'
import { ApiError, apiFetch, currentFarmId } from '../data/apiRepo'

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

/**
 * Extra fields returned by connectTheThingsStack (structurally still a LorawanConnection).
 * `webhook.headerValue` is shown ONCE so the farmer can paste it into the TTS console when
 * `webhook.created` is false (the API key lacked rights to create the webhook automatically).
 */
export interface LorawanConnectResult extends LorawanConnection {
  webhook: { created: boolean; url: string; format: 'json'; headerName: string; headerValue: string; enabledMessages: string[] }
}

/** Runs a server call; 503 from the server also means "not connected yet". */
async function call<T>(fn: (farmPath: string) => Promise<T>): Promise<T> {
  if (!isBackendConfigured()) throw new BackendNotConfiguredError()
  try {
    return await fn(`/farms/${await currentFarmId()}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) throw new BackendNotConfiguredError()
    throw e
  }
}

export async function getLorawanConnections(): Promise<LorawanConnection[]> {
  return call(async (farm) => (await apiFetch<{ connections: LorawanConnection[] }>(`${farm}/lorawan/connections`)).connections)
}
export async function connectTheThingsStack(input: { cluster: string; applicationId: string; apiKey: string }): Promise<LorawanConnection> {
  return call((farm) => apiFetch<LorawanConnectResult>(`${farm}/lorawan/ttn/connect`, { method: 'POST', body: input }))
}
export async function listLorawanDevices(connectionId: string): Promise<LorawanDevice[]> {
  return call(async (farm) => (await apiFetch<{ devices: LorawanDevice[] }>(`${farm}/lorawan/${connectionId}/devices`)).devices)
}
export async function registerLorawanDevices(connectionId: string, devices: { deviceId: string; name: string; depthCm: number; zoneId: string | null }[]): Promise<Sensor[]> {
  return call(async (farm) => (await apiFetch<{ sensors: Sensor[] }>(`${farm}/lorawan/${connectionId}/register`, { method: 'POST', body: { devices } })).sensors)
}
export async function claimEsp32(claimCode: string, opts: { name: string; depthCm: number; zoneId: string | null }): Promise<Esp32Claim> {
  return call(async () => apiFetch<Esp32Claim>('/devices/claim', { method: 'POST', body: { farmId: await currentFarmId(), claimCode, ...opts } }))
}
