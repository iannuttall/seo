import type {
  ToolIdentityReservation,
  ToolIdentityReservationInput,
} from './paid-tool-guard.ts'
import {
  derivePaidToolIdentityFromRequest,
  PAID_TOOL_DAILY_LIMIT,
  type PublicWorkerToolId,
  paidToolQuotaObjectName,
  utcDay,
} from './paid-tool-guard-core.ts'
import type {
  ProtectedToolGuardNamespace,
  ProtectedToolGuardStub,
} from './protected-tool-handler.ts'

type DailyToolQuotaEnv = {
  PAID_TOOL_GUARD: ProtectedToolGuardNamespace
  TOOL_QUOTA_HASH_KEY: string
}

const PUBLIC_TOOL_BY_PATH = new Map<string, PublicWorkerToolId>([
  ['/api/tools/llms-txt', 'llms-txt'],
  ['/api/tools/sitemap', 'sitemap'],
  ['/api/tools/sitemap-extractor', 'sitemap-extractor'],
  ['/api/tools/sitemap-validator', 'sitemap-validator'],
  ['/api/tools/robots-txt', 'robots-txt'],
  ['/api/tools/serp-preview', 'serp-preview'],
  ['/api/tools/favicon-checker', 'favicon-checker'],
])

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

function jsonResponse(
  value: unknown,
  status: number,
  headers: HeadersInit = {},
) {
  return Response.json(value, {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  })
}

async function reserveIdentityQuota(
  guard: ProtectedToolGuardStub,
  input: ToolIdentityReservationInput,
): Promise<ToolIdentityReservation> {
  const response = await guard.fetch(
    'https://paid-tool-guard.internal/reserve',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > 2_048) {
    throw new Error('Quota reservation failed.')
  }
  const text = await response.text()
  if (!response.ok || text.length > 2_048) {
    throw new Error('Quota reservation failed.')
  }
  return JSON.parse(text) as ToolIdentityReservation
}

function validReservation(
  reservation: ToolIdentityReservation,
  day: string,
  tool: PublicWorkerToolId,
): boolean {
  const expectedResetAt = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000
  return (
    reservation.day === day &&
    reservation.tool === tool &&
    Number.isSafeInteger(reservation.identityRemaining) &&
    reservation.identityRemaining >= 0 &&
    reservation.identityRemaining <= PAID_TOOL_DAILY_LIMIT &&
    reservation.resetAt === expectedResetAt
  )
}

function retryAfter(resetAt: number, now: Date): string {
  return String(Math.max(1, Math.ceil((resetAt - now.getTime()) / 1_000)))
}

export async function applyDailyToolQuota(
  request: Request,
  env: DailyToolQuotaEnv,
  now = new Date(),
): Promise<Response | undefined> {
  if (request.method !== 'POST') return undefined
  const tool = PUBLIC_TOOL_BY_PATH.get(new URL(request.url).pathname)
  if (!tool) return undefined
  if (!Number.isFinite(now.getTime()) || !env.TOOL_QUOTA_HASH_KEY) {
    return jsonResponse({ error: 'The tool is temporarily unavailable.' }, 503)
  }

  const day = utcDay(now)
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
    return jsonResponse({ error: 'The tool is temporarily unavailable.' }, 503)
  }

  try {
    const guard = env.PAID_TOOL_GUARD.getByName(paidToolQuotaObjectName(day))
    const reservation = await reserveIdentityQuota(guard, {
      kind: 'identity',
      day,
      identityHash,
      tool,
    })
    if (!validReservation(reservation, day, tool)) {
      throw new Error('Invalid quota response.')
    }
    if (!reservation.allowed) {
      return jsonResponse(
        { error: 'Daily check limit reached. Try again tomorrow.' },
        429,
        { 'retry-after': retryAfter(reservation.resetAt, now) },
      )
    }
  } catch {
    return jsonResponse({ error: 'The tool is temporarily unavailable.' }, 503)
  }

  return undefined
}
