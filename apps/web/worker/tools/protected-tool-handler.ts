import type {
  PaidToolReservation,
  PaidToolReservationInput,
} from './paid-tool-guard.ts'
import {
  derivePaidToolIdentityFromRequest,
  PAID_TOOL_DAILY_LIMIT,
  PAID_TOOL_PROVIDERS,
  type PaidToolId,
  paidToolQuotaObjectName,
  utcDay,
  type VerifyTurnstileOptions,
  verifyTurnstile,
} from './paid-tool-guard-core.ts'
import { isBrowserRequestFromSameSite } from './sitemap.ts'

export const PROTECTED_TOOL_LIMITS = {
  bodyBytes: 8_192,
  targetCharacters: 2_048,
  turnstileTokenCharacters: 2_048,
} as const

export type ProtectedToolParsedInput<TInput> = {
  target: string
  turnstileToken: string
  providerInput: TInput
}

export type ProtectedToolGuardStub = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export type ProtectedToolGuardNamespace = {
  getByName(name: string): ProtectedToolGuardStub
}

export type ProtectedToolEnvironment = {
  PAID_TOOL_GUARD: ProtectedToolGuardNamespace
  TURNSTILE_SECRET_KEY: string
  TOOL_QUOTA_HASH_KEY: string
  LOCAL_TOOL_PREVIEW?: string
}

export type ProtectedToolHandlerOptions<TInput, TResult> = {
  tool: PaidToolId
  providerDailyLimit: number
  parse(value: unknown): ProtectedToolParsedInput<TInput>
  provider(input: TInput): Promise<TResult>
  now?: () => Date
  verifyTurnstile?: (
    options: VerifyTurnstileOptions,
  ) => ReturnType<typeof verifyTurnstile>
  allowLocalhostTurnstileForTests?: boolean
}

type QuotaEnvelope = {
  limit: typeof PAID_TOOL_DAILY_LIMIT
  remaining: number
  resetsAt: string
}

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

const LOCAL_TURNSTILE_BYPASS_TOKEN = 'local-preview'

class ProtectedToolInputError extends Error {}

function jsonResponse(
  value: unknown,
  status: number,
  headers: HeadersInit = {},
): Response {
  return Response.json(value, {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  })
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredHeader = request.headers.get('content-length')
  if (declaredHeader) {
    const declared = Number(declaredHeader)
    if (
      !Number.isSafeInteger(declared) ||
      declared > PROTECTED_TOOL_LIMITS.bodyBytes
    ) {
      throw new ProtectedToolInputError('The request is too large.')
    }
  }
  if (!request.body) throw new ProtectedToolInputError('Send a JSON request.')

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > PROTECTED_TOOL_LIMITS.bodyBytes) {
      await reader.cancel()
      throw new ProtectedToolInputError('The request is too large.')
    }
    text += decoder.decode(chunk.value, { stream: true })
  }

  try {
    return JSON.parse(text + decoder.decode()) as unknown
  } catch {
    throw new ProtectedToolInputError('Send a valid JSON request.')
  }
}

function validateParsedInput<TInput>(
  parsed: ProtectedToolParsedInput<TInput>,
): ProtectedToolParsedInput<TInput> {
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.target !== 'string' ||
    !parsed.target ||
    parsed.target.length > PROTECTED_TOOL_LIMITS.targetCharacters ||
    typeof parsed.turnstileToken !== 'string' ||
    !parsed.turnstileToken ||
    parsed.turnstileToken.length >
      PROTECTED_TOOL_LIMITS.turnstileTokenCharacters
  ) {
    throw new ProtectedToolInputError('Check the domain and verification.')
  }
  return parsed
}

function quotaEnvelope(
  reservation: PaidToolReservation,
  day: string,
  tool: PaidToolId,
): QuotaEnvelope | undefined {
  const expectedResetAt = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000
  if (
    reservation.day !== day ||
    reservation.provider !== PAID_TOOL_PROVIDERS[tool] ||
    !Number.isSafeInteger(reservation.identityRemaining) ||
    reservation.identityRemaining < 0 ||
    reservation.identityRemaining > PAID_TOOL_DAILY_LIMIT ||
    !Number.isSafeInteger(reservation.resetAt) ||
    reservation.resetAt !== expectedResetAt
  ) {
    return undefined
  }
  const resetsAt = new Date(reservation.resetAt)
  if (!Number.isFinite(resetsAt.getTime())) return undefined
  return {
    limit: PAID_TOOL_DAILY_LIMIT,
    remaining: reservation.identityRemaining,
    resetsAt: resetsAt.toISOString(),
  }
}

function retryAfter(resetAt: number, now: Date): string {
  return String(Math.max(1, Math.ceil((resetAt - now.getTime()) / 1_000)))
}

async function reservePaidToolQuota(
  guard: ProtectedToolGuardStub,
  input: PaidToolReservationInput,
): Promise<PaidToolReservation> {
  const response = await guard.fetch(
    'https://paid-tool-guard.internal/reserve',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  const text = await response.text()
  if (!response.ok || text.length > 2_048) {
    throw new Error('Quota reservation failed.')
  }
  return JSON.parse(text) as PaidToolReservation
}

export async function handleProtectedTool<TInput, TResult>(
  request: Request,
  env: ProtectedToolEnvironment,
  options: ProtectedToolHandlerOptions<TInput, TResult>,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { allow: 'POST' })
  }
  if (
    !Number.isSafeInteger(options.providerDailyLimit) ||
    options.providerDailyLimit < 1 ||
    options.providerDailyLimit > 100_000
  ) {
    return jsonResponse({ error: 'This check is temporarily unavailable' }, 503)
  }
  if (!isBrowserRequestFromSameSite(request)) {
    return jsonResponse({ error: 'Cross-site requests are not allowed' }, 403)
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return jsonResponse({ error: 'Send a JSON request' }, 415)
  }

  let parsed: ProtectedToolParsedInput<TInput>
  try {
    parsed = validateParsedInput(options.parse(await readBoundedJson(request)))
  } catch {
    return jsonResponse({ error: 'Check the submitted fields' }, 400)
  }

  const now = options.now?.() ?? new Date()
  if (!Number.isFinite(now.getTime())) {
    return jsonResponse({ error: 'This check is temporarily unavailable' }, 503)
  }
  const day = utcDay(now)
  const connectingIp = request.headers.get('cf-connecting-ip')?.trim()
  if (!connectingIp || !env.TURNSTILE_SECRET_KEY || !env.TOOL_QUOTA_HASH_KEY) {
    return jsonResponse({ error: 'This check is temporarily unavailable' }, 503)
  }

  const bypassLocalVerification =
    env.LOCAL_TOOL_PREVIEW === 'true' &&
    parsed.turnstileToken === LOCAL_TURNSTILE_BYPASS_TOKEN
  if (!bypassLocalVerification) {
    let verification: Awaited<ReturnType<typeof verifyTurnstile>>
    try {
      verification = await (options.verifyTurnstile ?? verifyTurnstile)({
        token: parsed.turnstileToken,
        secretKey: env.TURNSTILE_SECRET_KEY,
        expectedAction: options.tool,
        remoteIp: connectingIp,
        allowLocalhostForTests: options.allowLocalhostTurnstileForTests,
      })
    } catch {
      return jsonResponse(
        { error: 'Verification is temporarily unavailable' },
        503,
      )
    }
    if (!verification.ok) {
      if (verification.reason === 'unavailable') {
        return jsonResponse(
          { error: 'Verification is temporarily unavailable' },
          503,
        )
      }
      return jsonResponse({ error: 'Verification failed. Try again.' }, 403)
    }
  }

  let identityHash: string | undefined
  try {
    identityHash = await derivePaidToolIdentityFromRequest(
      request,
      day,
      env.TOOL_QUOTA_HASH_KEY,
    )
  } catch {
    identityHash = undefined
  }
  if (!identityHash) {
    return jsonResponse({ error: 'This check is temporarily unavailable' }, 503)
  }

  let reservation: PaidToolReservation
  try {
    const guard = env.PAID_TOOL_GUARD.getByName(paidToolQuotaObjectName(day))
    reservation = await reservePaidToolQuota(guard, {
      day,
      identityHash,
      tool: options.tool,
      providerDailyLimit: options.providerDailyLimit,
    })
  } catch {
    return jsonResponse({ error: 'This check is temporarily unavailable' }, 503)
  }

  const quota = quotaEnvelope(reservation, day, options.tool)
  if (!quota) {
    return jsonResponse({ error: 'This check is temporarily unavailable' }, 503)
  }
  if (!reservation.allowed) {
    const headers = {
      'retry-after': retryAfter(reservation.resetAt, now),
    }
    if (reservation.reason === 'identity-limit') {
      return jsonResponse(
        { error: 'Daily check limit reached. Try again tomorrow.' },
        429,
        headers,
      )
    }
    return jsonResponse(
      { error: 'This check is temporarily unavailable' },
      503,
      headers,
    )
  }

  try {
    const result = await options.provider(parsed.providerInput)
    return jsonResponse({ schema: 1, result }, 200)
  } catch {
    return jsonResponse(
      { error: 'The provider could not complete this check. Try again later.' },
      502,
    )
  }
}
