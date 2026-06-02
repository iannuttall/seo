import { deriveBrandTerms } from './brand.js'
import { readConfig, writeConfig } from './storage/config.js'
import type { ClientProfile } from './types.js'

export type ClientProfileInput = {
  id?: string
  name?: string
  siteUrl: string
  startUrl?: string
  watchUrls?: string[]
  brandTerms?: string[]
  ga4PropertyId?: string
  reportDay?: number
  technicalWeekday?: number
  isDefault?: boolean
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function uniqueStrings(values: string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function deriveId(input: ClientProfileInput): string {
  const base = input.id ?? input.name ?? input.siteUrl
  const id = slug(base)
  if (!id) throw new Error('Client id could not be derived.')
  return id
}

export function listClients(): ClientProfile[] {
  return [...readConfig().clients].sort((a, b) => a.name.localeCompare(b.name))
}

export function getClient(idOrName?: string): ClientProfile | undefined {
  const clients = readConfig().clients
  if (!idOrName) return clients.find((client) => client.isDefault)
  const normalized = idOrName.toLowerCase()
  return clients.find(
    (client) =>
      client.id.toLowerCase() === normalized ||
      client.name.toLowerCase() === normalized,
  )
}

export function saveClient(input: ClientProfileInput): ClientProfile {
  const config = readConfig()
  const id = deriveId(input)
  const existing = config.clients.find((client) => client.id === id)
  const now = Date.now()
  const client: ClientProfile = {
    id,
    name: input.name ?? existing?.name ?? id,
    siteUrl: input.siteUrl,
    startUrl: input.startUrl ?? existing?.startUrl,
    watchUrls: uniqueStrings(input.watchUrls ?? existing?.watchUrls),
    brandTerms: uniqueStrings(
      input.brandTerms ??
        existing?.brandTerms ??
        deriveBrandTerms({
          id,
          name: input.name ?? existing?.name,
          siteUrl: input.siteUrl,
        }),
    ),
    ga4PropertyId: input.ga4PropertyId ?? existing?.ga4PropertyId,
    reportDay: input.reportDay ?? existing?.reportDay,
    technicalWeekday: input.technicalWeekday ?? existing?.technicalWeekday,
    isDefault: input.isDefault ?? existing?.isDefault,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const clients = config.clients.filter((item) => item.id !== id)
  if (client.isDefault) {
    for (const item of clients) item.isDefault = false
    config.defaultSite = client.siteUrl
  }
  config.clients = [...clients, client]
  writeConfig(config)
  return client
}

export function deleteClient(idOrName: string): boolean {
  const config = readConfig()
  const client = getClient(idOrName)
  if (!client) return false
  config.clients = config.clients.filter((item) => item.id !== client.id)
  writeConfig(config)
  return true
}

export function setDefaultClient(idOrName: string): ClientProfile {
  const config = readConfig()
  const client = getClient(idOrName)
  if (!client) throw new Error(`Client not found: ${idOrName}`)
  config.clients = config.clients.map((item) => ({
    ...item,
    isDefault: item.id === client.id,
  }))
  config.defaultSite = client.siteUrl
  writeConfig(config)
  return { ...client, isDefault: true }
}
