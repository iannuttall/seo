import { fetch } from 'undici'
import { z } from 'zod'
import type { ProviderFetch } from '../providers/transport.js'
import { providerRequestJson } from '../providers/transport.js'
import { loadInstalledProviderExtensions } from './loader.js'
import type { SeoProviderRegistration, SeoProviderRuntime } from './sdk.js'

const DEFAULT_MAX_REQUESTS = 8
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024
const MAX_REQUEST_BODY_BYTES = 64 * 1024
const TIMEOUT_MS = 15_000

export type ProviderRuntimeOptions = {
  fetch?: ProviderFetch
  maxRequests?: number
  now?: () => Date
}

export function normalizeProviderExtensionAccount(
  provider: Pick<SeoProviderRegistration, 'displayName' | 'connection'>,
  account: Readonly<Record<string, string>>,
): Record<string, string> {
  const fields = provider.connection.fields.filter(
    (field) => field.kind === 'account',
  )
  const allowed = new Set(fields.map((field) => field.id))
  const unknown = Object.keys(account).find((key) => !allowed.has(key))
  if (unknown) {
    throw new Error(
      `${unknown} is not an account field for ${provider.displayName}.`,
    )
  }
  const normalized = provider.connection.normalizeAccount
    ? provider.connection.normalizeAccount(account)
    : { ...account }
  for (const [key, value] of Object.entries(normalized)) {
    if (!allowed.has(key) || !value || value.length > 4_096) {
      throw new Error(`${provider.displayName} returned an invalid account.`)
    }
  }
  for (const field of fields) {
    if (field.required !== false && !normalized[field.id]?.trim()) {
      throw new Error(`${field.label} is required for ${provider.displayName}.`)
    }
  }
  return normalized
}

export async function loadProviderExtensions() {
  return loadInstalledProviderExtensions()
}

export function safeProviderAdapterError(
  providerId: string,
  error: unknown,
  credentials: Readonly<Record<string, string>>,
): Error {
  let message = error instanceof Error ? error.message : String(error)
  for (const value of Object.values(credentials)) {
    if (value.length >= 4) message = message.replaceAll(value, '[redacted]')
  }
  const bounded = message
    .replace(/[\r\n]+/gu, ' ')
    .slice(0, 500)
    .trim()
  return new Error(
    bounded || `${providerId} did not return valid provider evidence.`,
  )
}

export function runtimeForProvider(
  provider: string,
  options: ProviderRuntimeOptions = {},
): SeoProviderRuntime {
  const providerFetch = options.fetch ?? fetch
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS
  if (
    !Number.isSafeInteger(maxRequests) ||
    maxRequests < 1 ||
    maxRequests > 20
  ) {
    throw new Error('Provider request limit must be from 1 to 20.')
  }
  let requestCount = 0
  return {
    now: () => (options.now ?? (() => new Date()))().toISOString(),
    async requestJson(input) {
      requestCount += 1
      if (requestCount > maxRequests) {
        throw new Error(`${provider} exceeded its request limit.`)
      }
      const url = new URL(input.url)
      if (url.protocol !== 'https:') {
        throw new Error(`${provider} requests must use HTTPS.`)
      }
      if (input.url.length > 8_192) {
        throw new Error(`${provider} request URL is too long.`)
      }
      if (
        input.body &&
        Buffer.byteLength(input.body) > MAX_REQUEST_BODY_BYTES
      ) {
        throw new Error(`${provider} request body is too large.`)
      }
      const headers = Object.fromEntries(Object.entries(input.headers ?? {}))
      if (
        Object.keys(headers).length > 32 ||
        Object.entries(headers).some(
          ([name, value]) => name.length > 128 || value.length > 4_096,
        )
      ) {
        throw new Error(`${provider} request headers are too large.`)
      }
      return providerRequestJson({
        provider,
        operation: input.operation,
        url,
        init: {
          method: input.method ?? 'GET',
          headers,
          ...(input.body ? { body: input.body } : {}),
        },
        fetch: providerFetch,
        maxResponseBytes: MAX_RESPONSE_BYTES,
        timeoutMs: TIMEOUT_MS,
        retry: (input.method ?? 'GET') === 'GET' ? 'safe' : 'never',
        schema: z.unknown(),
      })
    },
  }
}

export async function verifyProviderExtension(input: {
  providerId: string
  account: Readonly<Record<string, string>>
  credentials: Readonly<Record<string, string>>
  runtime?: ProviderRuntimeOptions
}): Promise<void> {
  const loaded = await loadProviderExtensions()
  const provider = loaded.registry.get(input.providerId)
  if (!provider) {
    throw new Error(`Provider ${input.providerId} is not installed.`)
  }
  const account = normalizeProviderExtensionAccount(provider, input.account)
  try {
    await provider.connection.verify(
      { account, credentials: input.credentials },
      runtimeForProvider(input.providerId, input.runtime ?? {}),
    )
  } catch (error) {
    throw safeProviderAdapterError(input.providerId, error, input.credentials)
  }
}
