export const PAID_TOOL_DAILY_LIMIT = 10
export const MAX_PROVIDER_DAILY_LIMIT = 100_000
export const PAID_TOOL_GUARD_RETENTION_DAYS = 2

export const PAID_TOOL_PROVIDERS = {
  'spam-score': 'dataforseo-spam',
  'domain-rating': 'ahrefs',
  'website-traffic': 'dataforseo-traffic',
} as const

export const PUBLIC_WORKER_TOOLS = [
  'llms-txt',
  'sitemap',
  'sitemap-extractor',
  'sitemap-validator',
  'robots-txt',
  'favicon-checker',
] as const

export type PaidToolId = keyof typeof PAID_TOOL_PROVIDERS
export type PaidToolProvider = (typeof PAID_TOOL_PROVIDERS)[PaidToolId]
export type PublicWorkerToolId = (typeof PUBLIC_WORKER_TOOLS)[number]

export type ToolIdentityQuotaDecision =
  | {
      allowed: true
      identityUsed: number
      identityRemaining: number
    }
  | {
      allowed: false
      reason: 'identity-limit'
      identityUsed: number
      identityRemaining: number
    }

export type PaidToolQuotaDecision =
  | {
      allowed: true
      identityUsed: number
      identityRemaining: number
      providerUsed: number
      providerRemaining: number
    }
  | {
      allowed: false
      reason: 'identity-limit' | 'provider-limit'
      identityUsed: number
      identityRemaining: number
      providerUsed: number
      providerRemaining: number
    }

export type TurnstileVerification =
  | {
      ok: true
      action: string
      hostname: string
    }
  | {
      ok: false
      reason:
        | 'invalid-token'
        | 'action-mismatch'
        | 'hostname-mismatch'
        | 'unavailable'
      retryable: boolean
    }

type TurnstileResponse = {
  success?: unknown
  action?: unknown
  hostname?: unknown
  metadata?: unknown
}

type TurnstileFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type VerifyTurnstileOptions = {
  token: string
  secretKey: string
  expectedAction: PaidToolId
  remoteIp?: string
  allowLocalhostForTests?: boolean
  fetcher?: TurnstileFetch
  idempotencyKey?: string
  timeoutMilliseconds?: number
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const IDENTITY_HASH_PATTERN = /^[0-9a-f]{64}$/
const TURNSTILE_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_RESPONSE_BYTES = 16_384
const DEFAULT_TURNSTILE_TIMEOUT_MS = 5_000
const LOCAL_TEST_HOSTNAMES = new Set(['localhost', '127.0.0.1'])

function validUtcDay(day: string): boolean {
  if (!DAY_PATTERN.test(day)) return false
  const start = Date.parse(`${day}T00:00:00.000Z`)
  return (
    Number.isFinite(start) && new Date(start).toISOString().slice(0, 10) === day
  )
}

export function utcDay(now: Date | number = new Date()): string {
  const date = typeof now === 'number' ? new Date(now) : now
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date.')
  return date.toISOString().slice(0, 10)
}

export function paidToolQuotaObjectName(day: string): string {
  if (!validUtcDay(day)) throw new Error('Invalid UTC day.')
  return `paid-tools:${day}`
}

export function paidToolQuotaCleanupAt(day: string): number {
  if (!validUtcDay(day)) throw new Error('Invalid UTC day.')
  return (
    Date.parse(`${day}T00:00:00.000Z`) +
    PAID_TOOL_GUARD_RETENTION_DAYS * 86_400_000
  )
}

export function isPaidToolId(value: unknown): value is PaidToolId {
  return typeof value === 'string' && value in PAID_TOOL_PROVIDERS
}

export function isPublicWorkerToolId(
  value: unknown,
): value is PublicWorkerToolId {
  return (
    typeof value === 'string' &&
    PUBLIC_WORKER_TOOLS.includes(value as PublicWorkerToolId)
  )
}

export function isPaidToolIdentityHash(value: unknown): value is string {
  return typeof value === 'string' && IDENTITY_HASH_PATTERN.test(value)
}

export function validateProviderDailyLimit(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_PROVIDER_DAILY_LIMIT
  ) {
    throw new Error('Invalid provider daily limit.')
  }
  return value
}

export function decideToolIdentityQuota(
  identityUsed: number,
): ToolIdentityQuotaDecision {
  if (!Number.isSafeInteger(identityUsed) || identityUsed < 0) {
    throw new Error('Invalid quota usage.')
  }
  const identityRemaining = Math.max(0, PAID_TOOL_DAILY_LIMIT - identityUsed)
  if (identityUsed >= PAID_TOOL_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: 'identity-limit',
      identityUsed,
      identityRemaining,
    }
  }
  return {
    allowed: true,
    identityUsed: identityUsed + 1,
    identityRemaining: PAID_TOOL_DAILY_LIMIT - identityUsed - 1,
  }
}

export function decidePaidToolQuota(input: {
  identityUsed: number
  providerUsed: number
  providerDailyLimit: number
}): PaidToolQuotaDecision {
  const providerDailyLimit = validateProviderDailyLimit(
    input.providerDailyLimit,
  )
  if (
    !Number.isSafeInteger(input.identityUsed) ||
    input.identityUsed < 0 ||
    !Number.isSafeInteger(input.providerUsed) ||
    input.providerUsed < 0
  ) {
    throw new Error('Invalid quota usage.')
  }

  const identity = decideToolIdentityQuota(input.identityUsed)
  const providerRemaining = Math.max(0, providerDailyLimit - input.providerUsed)

  if (!identity.allowed) {
    return {
      allowed: false,
      reason: 'identity-limit',
      identityUsed: identity.identityUsed,
      identityRemaining: identity.identityRemaining,
      providerUsed: input.providerUsed,
      providerRemaining,
    }
  }
  if (input.providerUsed >= providerDailyLimit) {
    return {
      allowed: false,
      reason: 'provider-limit',
      identityUsed: input.identityUsed,
      identityRemaining: identity.identityRemaining,
      providerUsed: input.providerUsed,
      providerRemaining,
    }
  }

  return {
    allowed: true,
    identityUsed: identity.identityUsed,
    identityRemaining: identity.identityRemaining,
    providerUsed: input.providerUsed + 1,
    providerRemaining: providerDailyLimit - input.providerUsed - 1,
  }
}

function normalizeConnectingIp(value: string | null): string | undefined {
  const ip = value?.trim()
  if (!ip || ip.length > 64 || !/^[0-9a-f:.]+$/i.test(ip)) {
    return undefined
  }
  return ip.toLowerCase()
}

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export async function derivePaidToolIdentityHash(
  ip: string,
  day: string,
  secret: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const normalizedIp = normalizeConnectingIp(ip)
  if (!normalizedIp) throw new Error('Invalid connecting IP.')
  if (!validUtcDay(day)) throw new Error('Invalid UTC day.')
  if (secret.length < 32) throw new Error('Identity secret is too short.')

  const encoder = new TextEncoder()
  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await subtle.sign(
    'HMAC',
    key,
    encoder.encode(`paid-tool:v1\n${day}\n${normalizedIp}`),
  )
  return bytesToHex(signature)
}

export async function derivePaidToolIdentityFromRequest(
  request: Request,
  day: string,
  secret: string,
): Promise<string | undefined> {
  const ip = normalizeConnectingIp(request.headers.get('cf-connecting-ip'))
  if (!ip) return undefined
  return derivePaidToolIdentityHash(ip, day, secret)
}

async function boundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new Error('Response is too large.')
  }
  if (!response.body) throw new Error('Response body is missing.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > maximumBytes) {
      await reader.cancel()
      throw new Error('Response is too large.')
    }
    text += decoder.decode(chunk.value, { stream: true })
  }
  return JSON.parse(text + decoder.decode()) as unknown
}

function isTurnstileResponse(value: unknown): value is TurnstileResponse {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isOfficialAlwaysPassTestResponse(result: TurnstileResponse): boolean {
  if (
    result.hostname !== 'example.com' ||
    result.action !== undefined ||
    !result.metadata ||
    typeof result.metadata !== 'object' ||
    Array.isArray(result.metadata)
  ) {
    return false
  }

  return (
    (result.metadata as Record<string, unknown>).result_with_testing_key ===
    true
  )
}

export async function verifyTurnstile(
  options: VerifyTurnstileOptions,
): Promise<TurnstileVerification> {
  if (
    !options.token ||
    options.token.length > 2_048 ||
    !options.secretKey ||
    !isPaidToolId(options.expectedAction)
  ) {
    return { ok: false, reason: 'invalid-token', retryable: true }
  }

  const timeoutMilliseconds =
    options.timeoutMilliseconds ?? DEFAULT_TURNSTILE_TIMEOUT_MS
  if (
    !Number.isSafeInteger(timeoutMilliseconds) ||
    timeoutMilliseconds < 250 ||
    timeoutMilliseconds > 10_000
  ) {
    throw new Error('Invalid Turnstile timeout.')
  }

  try {
    const response = await (options.fetcher ?? fetch)(TURNSTILE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: options.secretKey,
        response: options.token,
        ...(options.remoteIp ? { remoteip: options.remoteIp } : {}),
        idempotency_key: options.idempotencyKey ?? crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(timeoutMilliseconds),
    })
    if (!response.ok) {
      return { ok: false, reason: 'unavailable', retryable: true }
    }

    const result = await boundedJson(response, TURNSTILE_RESPONSE_BYTES)
    if (!isTurnstileResponse(result) || result.success !== true) {
      return { ok: false, reason: 'invalid-token', retryable: true }
    }
    if (
      options.allowLocalhostForTests === true &&
      isOfficialAlwaysPassTestResponse(result)
    ) {
      return {
        ok: true,
        action: options.expectedAction,
        hostname: 'example.com',
      }
    }
    if (result.action !== options.expectedAction) {
      return { ok: false, reason: 'action-mismatch', retryable: true }
    }
    if (typeof result.hostname !== 'string') {
      return { ok: false, reason: 'hostname-mismatch', retryable: false }
    }
    const validHostname =
      result.hostname === 'seoskill.dev' ||
      (options.allowLocalhostForTests === true &&
        LOCAL_TEST_HOSTNAMES.has(result.hostname))
    if (!validHostname) {
      return { ok: false, reason: 'hostname-mismatch', retryable: false }
    }

    return {
      ok: true,
      action: options.expectedAction,
      hostname: result.hostname,
    }
  } catch {
    return { ok: false, reason: 'unavailable', retryable: true }
  }
}
