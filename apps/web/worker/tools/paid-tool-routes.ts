import { checkAhrefsDomainRating } from './ahrefs-domain-rating.ts'
import { checkDataForSeoSpamScore } from './dataforseo-spam-score.ts'
import { checkDataForSeoWebsiteTraffic } from './dataforseo-traffic.ts'
import {
  handleProtectedTool,
  type ProtectedToolParsedInput,
} from './protected-tool-handler.ts'

type TargetInput = { target: string }
type TrafficInput = {
  target: string
  locationCode: number
  languageCode: string
}

const TRAFFIC_MARKETS = new Map<number, string>([
  [2840, 'en'],
  [2826, 'en'],
  [2124, 'en'],
  [2036, 'en'],
  [2356, 'en'],
  [2276, 'de'],
  [2250, 'fr'],
  [2724, 'es'],
  [2380, 'it'],
  [2528, 'nl'],
])

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid request.')
  }
  return value as Record<string, unknown>
}

function exactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): void {
  if (Object.keys(value).some((field) => !fields.includes(field))) {
    throw new TypeError('Invalid request.')
  }
}

function parseTarget(value: unknown): ProtectedToolParsedInput<TargetInput> {
  const input = record(value)
  exactFields(input, ['target', 'turnstileToken'])
  if (
    typeof input.target !== 'string' ||
    typeof input.turnstileToken !== 'string'
  ) {
    throw new TypeError('Invalid request.')
  }
  return {
    target: input.target,
    turnstileToken: input.turnstileToken,
    providerInput: { target: input.target },
  }
}

function parseTraffic(value: unknown): ProtectedToolParsedInput<TrafficInput> {
  const input = record(value)
  exactFields(input, [
    'target',
    'turnstileToken',
    'locationCode',
    'languageCode',
  ])
  if (
    typeof input.target !== 'string' ||
    typeof input.turnstileToken !== 'string' ||
    !Number.isSafeInteger(input.locationCode) ||
    typeof input.languageCode !== 'string'
  ) {
    throw new TypeError('Invalid request.')
  }
  const locationCode = input.locationCode as number
  const languageCode = input.languageCode.trim().toLowerCase()
  if (TRAFFIC_MARKETS.get(locationCode) !== languageCode) {
    throw new TypeError('Invalid market.')
  }
  return {
    target: input.target,
    turnstileToken: input.turnstileToken,
    providerInput: { target: input.target, locationCode, languageCode },
  }
}

function dailyLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100_000) {
    return 0
  }
  return parsed
}

export function allowLocalTurnstileTest(request: Request): boolean {
  const hostname = new URL(request.url).hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export function handleSpamScore(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'spam-score',
    providerDailyLimit: dailyLimit(env.DATAFORSEO_SPAM_DAILY_PROVIDER_LIMIT),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseTarget,
    provider: ({ target }) =>
      checkDataForSeoSpamScore({
        target,
        login: env.DATAFORSEO_LOGIN,
        password: env.DATAFORSEO_PASSWORD,
      }),
  })
}

export function handleDomainRating(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'domain-rating',
    providerDailyLimit: dailyLimit(env.AHREFS_DAILY_PROVIDER_LIMIT),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseTarget,
    provider: ({ target }) =>
      checkAhrefsDomainRating({ target, apiKey: env.AHREFS_API_KEY }),
  })
}

export function handleWebsiteTraffic(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'website-traffic',
    providerDailyLimit: dailyLimit(env.DATAFORSEO_TRAFFIC_DAILY_PROVIDER_LIMIT),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseTraffic,
    provider: ({ target, locationCode, languageCode }) =>
      checkDataForSeoWebsiteTraffic({
        target,
        login: env.DATAFORSEO_LOGIN,
        password: env.DATAFORSEO_PASSWORD,
        locationCode,
        languageCode,
      }),
  })
}
