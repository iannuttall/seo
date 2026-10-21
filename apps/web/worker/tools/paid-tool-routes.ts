import { runResearch } from '@seo/core/commands'
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

// Research lookups for the competitor keyword and SERP checker pages. They
// run the same research as the agent's seo research command, on the site's
// DataForSEO account, so the free page shows exactly what a person gets.
export const RESEARCH_COUNTRIES = [
  'us',
  'gb',
  'ca',
  'au',
  'in',
  'de',
  'fr',
  'es',
  'it',
  'nl',
] as const

type CompetitorInput = {
  action: 'ranked_keywords' | 'competitors'
  target: string
  country: string
}
type SerpInput = { keyword: string; country: string }

function country(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !RESEARCH_COUNTRIES.includes(value as (typeof RESEARCH_COUNTRIES)[number])
  ) {
    throw new TypeError('Invalid market.')
  }
  return value
}

function parseCompetitors(
  value: unknown,
): ProtectedToolParsedInput<CompetitorInput> {
  const input = record(value)
  exactFields(input, ['target', 'turnstileToken', 'country', 'mode'])
  if (
    typeof input.target !== 'string' ||
    typeof input.turnstileToken !== 'string' ||
    (input.mode !== 'keywords' && input.mode !== 'competitors')
  ) {
    throw new TypeError('Invalid request.')
  }
  const target = input.target.trim().toLowerCase()
  if (!/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\/?$/u.test(target)) {
    throw new TypeError('Invalid domain.')
  }
  return {
    target,
    turnstileToken: input.turnstileToken,
    providerInput: {
      action: input.mode === 'keywords' ? 'ranked_keywords' : 'competitors',
      target,
      country: country(input.country),
    },
  }
}

function parseSerp(value: unknown): ProtectedToolParsedInput<SerpInput> {
  const input = record(value)
  exactFields(input, ['target', 'turnstileToken', 'country'])
  if (
    typeof input.target !== 'string' ||
    typeof input.turnstileToken !== 'string'
  ) {
    throw new TypeError('Invalid request.')
  }
  const keyword = input.target.trim().replace(/\s+/gu, ' ')
  if (!keyword || keyword.length > 200) throw new TypeError('Invalid keyword.')
  return {
    target: keyword,
    turnstileToken: input.turnstileToken,
    providerInput: { keyword, country: country(input.country) },
  }
}

async function researchRows(
  env: Cloudflare.Env,
  input: {
    action: 'ranked_keywords' | 'competitors' | 'serp'
    target?: string
    keywords?: string[]
    country: string
  },
) {
  const { data } = await runResearch(
    { provider: 'dataforseo', ...input },
    new Headers({
      'x-dataforseo-login': env.DATAFORSEO_LOGIN,
      'x-dataforseo-password': env.DATAFORSEO_PASSWORD,
    }),
    { drKey: env.AHREFS_API_KEY, call: () => '' },
  )
  const result = data as Record<string, unknown>
  return {
    action: input.action,
    target: input.target ?? input.keywords?.[0] ?? '',
    country: input.country,
    rows: result.rows,
    total: result.total,
    partial: result.partial,
    leftOut: result.leftOut,
    targetDomainRating: result.targetDomainRating,
    checkedAt: new Date().toISOString(),
  }
}

export function handleCompetitorKeywords(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'competitor-keywords',
    providerDailyLimit: dailyLimit(
      env.DATAFORSEO_RESEARCH_DAILY_PROVIDER_LIMIT,
    ),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseCompetitors,
    provider: (input) => researchRows(env, input),
  })
}

export function handleSerpChecker(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'serp-checker',
    providerDailyLimit: dailyLimit(
      env.DATAFORSEO_RESEARCH_DAILY_PROVIDER_LIMIT,
    ),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseSerp,
    provider: ({ keyword, country }) =>
      researchRows(env, { action: 'serp', keywords: [keyword], country }),
  })
}
