export type ProviderFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type ProviderAdapterDependencies = {
  fetch?: ProviderFetcher
  now?: () => Date
  timeoutMs?: number
  responseByteLimit?: number
}

export type ProviderDataStatus = 'complete' | 'partial' | 'unavailable'

export type ProviderAdapterErrorCode =
  | 'invalid-target'
  | 'invalid-credentials'
  | 'invalid-request'
  | 'rate-limited'
  | 'upstream-unavailable'
  | 'invalid-response'
  | 'response-too-large'
  | 'timeout'

export class ProviderAdapterError extends Error {
  readonly code: ProviderAdapterErrorCode
  readonly retryable: boolean

  constructor(
    code: ProviderAdapterErrorCode,
    message: string,
    retryable = false,
  ) {
    super(message)
    this.name = 'ProviderAdapterError'
    this.code = code
    this.retryable = retryable
  }
}

export const PROVIDER_ADAPTER_LIMITS = {
  targetCharacters: 2_048,
  credentialCharacters: 512,
  timeoutMilliseconds: 10_000,
  maximumTimeoutMilliseconds: 15_000,
  responseBytes: 524_288,
  maximumResponseBytes: 1_048_576,
} as const

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidTarget(): ProviderAdapterError {
  return new ProviderAdapterError(
    'invalid-target',
    'Enter a public domain or website URL.',
  )
}

export function normalizeProviderDomain(value: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > PROVIDER_ADAPTER_LIMITS.targetCharacters
  ) {
    throw invalidTarget()
  }

  const trimmed = value.trim()
  const candidate = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw invalidTarget()
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw invalidTarget()
  }

  let hostname = url.hostname.toLowerCase().replace(/\.$/u, '')
  if (hostname.startsWith('www.')) hostname = hostname.slice(4)
  if (
    !hostname.includes('.') ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.includes(':') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)
  ) {
    throw invalidTarget()
  }

  const labels = hostname.split('.')
  if (
    labels.some(
      (label) =>
        label.length < 1 ||
        label.length > 63 ||
        !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/u.test(label),
    ) ||
    hostname.length > 253
  ) {
    throw invalidTarget()
  }

  return hostname
}

export function normalizeProviderDomainOrPage(value: string): string {
  const domain = normalizeProviderDomain(value)
  const trimmed = value.trim()
  const candidate = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  const url = new URL(candidate)

  if (url.pathname === '/' && !url.search) return domain

  url.hostname = url.hostname.toLowerCase().replace(/\.$/u, '')
  url.hash = ''
  return url.toString()
}

export function providerCheckedAt(
  dependencies: ProviderAdapterDependencies,
): string {
  const now = dependencies.now?.() ?? new Date()
  if (Number.isNaN(now.getTime())) {
    throw new ProviderAdapterError(
      'invalid-request',
      'The provider request date is invalid.',
    )
  }
  return now.toISOString()
}

export function basicAuthorization(login: string, password: string): string {
  if (
    typeof login !== 'string' ||
    typeof password !== 'string' ||
    !login ||
    !password ||
    login.length > PROVIDER_ADAPTER_LIMITS.credentialCharacters ||
    password.length > PROVIDER_ADAPTER_LIMITS.credentialCharacters ||
    /[\r\n]/u.test(login) ||
    /[\r\n]/u.test(password)
  ) {
    throw new ProviderAdapterError(
      'invalid-credentials',
      'Provider credentials are not configured.',
    )
  }

  const bytes = new TextEncoder().encode(`${login}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

export function bearerAuthorization(apiKey: string): string {
  if (
    typeof apiKey !== 'string' ||
    !apiKey ||
    apiKey.length > PROVIDER_ADAPTER_LIMITS.credentialCharacters ||
    /[\r\n]/u.test(apiKey)
  ) {
    throw new ProviderAdapterError(
      'invalid-credentials',
      'Provider credentials are not configured.',
    )
  }
  return `Bearer ${apiKey}`
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel()
    throw new ProviderAdapterError(
      'response-too-large',
      'The provider response exceeded the safe processing limit.',
    )
  }

  if (!response.body) {
    throw new ProviderAdapterError(
      'invalid-response',
      'The provider returned an invalid response.',
    )
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maximumBytes) {
        await reader.cancel()
        throw new ProviderAdapterError(
          'response-too-large',
          'The provider response exceeded the safe processing limit.',
        )
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body),
    )
  } catch {
    throw new ProviderAdapterError(
      'invalid-response',
      'The provider returned an invalid response.',
    )
  }
}

function httpError(status: number): ProviderAdapterError {
  if (status === 401 || status === 403) {
    return new ProviderAdapterError(
      'invalid-credentials',
      'The provider rejected its configured credentials.',
    )
  }
  if (status === 429) {
    return new ProviderAdapterError(
      'rate-limited',
      'The provider rate limit was reached. Try again later.',
      true,
    )
  }
  return new ProviderAdapterError(
    'upstream-unavailable',
    'The provider could not complete this check. Try again later.',
    status >= 500,
  )
}

export async function fetchProviderJson(
  url: string | URL,
  init: RequestInit,
  dependencies: ProviderAdapterDependencies = {},
): Promise<unknown> {
  const fetcher = dependencies.fetch ?? fetch
  const timeoutMilliseconds = boundedInteger(
    dependencies.timeoutMs,
    PROVIDER_ADAPTER_LIMITS.timeoutMilliseconds,
    PROVIDER_ADAPTER_LIMITS.maximumTimeoutMilliseconds,
  )
  const maximumBytes = boundedInteger(
    dependencies.responseByteLimit,
    PROVIDER_ADAPTER_LIMITS.responseBytes,
    PROVIDER_ADAPTER_LIMITS.maximumResponseBytes,
  )
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds)

  try {
    const response = await fetcher(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      await response.body?.cancel()
      throw httpError(response.status)
    }
    return await readBoundedJson(response, maximumBytes)
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error
    if (controller.signal.aborted) {
      throw new ProviderAdapterError(
        'timeout',
        'The provider took too long to respond. Try again later.',
        true,
      )
    }
    throw new ProviderAdapterError(
      'upstream-unavailable',
      'The provider could not complete this check. Try again later.',
      true,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function nonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value)
  return number !== null && number >= 0 ? number : null
}

export function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_048) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function dataForSeoTask(value: unknown): {
  task: Record<string, unknown>
  result: Record<string, unknown>
  costUsd: number | null
} {
  if (!isRecord(value) || value.status_code !== 20_000) {
    throw new ProviderAdapterError(
      'upstream-unavailable',
      'DataForSEO could not complete this check. Try again later.',
      true,
    )
  }
  const task = Array.isArray(value.tasks) ? value.tasks[0] : undefined
  if (!isRecord(task) || task.status_code !== 20_000) {
    throw new ProviderAdapterError(
      'upstream-unavailable',
      'DataForSEO could not complete this check. Try again later.',
      true,
    )
  }
  const result = Array.isArray(task.result) ? task.result[0] : undefined
  if (!isRecord(result)) {
    throw new ProviderAdapterError(
      'invalid-response',
      'DataForSEO returned an invalid response.',
    )
  }
  return { task, result, costUsd: nonNegativeNumber(task.cost) }
}
