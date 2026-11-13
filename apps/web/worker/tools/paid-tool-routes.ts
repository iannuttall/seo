import {
  dataForSeoLanguage,
  dataForSeoMarket,
  dataForSeoSerp,
  dataForSeoTask,
  GOTO,
  research,
  runResearch,
  titleWords,
} from '@seo/core/commands'
import { checkAhrefsDomainRating } from './ahrefs-domain-rating.ts'
import { checkDataForSeoBacklinks } from './dataforseo-backlinks.ts'
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

export function handleBacklinks(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'backlinks',
    providerDailyLimit: dailyLimit(
      env.DATAFORSEO_BACKLINKS_DAILY_PROVIDER_LIMIT,
    ),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseTarget,
    provider: ({ target }) =>
      checkDataForSeoBacklinks({
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
    depth?: number
  },
) {
  const { data } = await runResearch(
    { provider: 'dataforseo', ...input },
    new Headers({
      'x-dataforseo-login': env.DATAFORSEO_LOGIN,
      'x-dataforseo-password': env.DATAFORSEO_PASSWORD,
    }),
    // The free tools show live results, so nothing is read from a saved run.
    { drKey: env.AHREFS_API_KEY, call: () => '', store: null },
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
      researchRows(env, {
        action: 'serp',
        keywords: [keyword],
        country,
        depth: 30,
      }),
  })
}

// The title tag word counter and the People Also Ask finder read one live
// results page each on the site's DataForSEO account, without the paid
// domain rank lookup neither page shows.
const TITLE_DEPTH = 50

function serpKeys(env: Cloudflare.Env): string[] {
  return [env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD]
}

async function liveSerp(
  env: Cloudflare.Env,
  input: { keyword: string; country: string; depth: number; paa?: number },
) {
  return research(
    'dataforseo',
    new Headers({
      'x-dataforseo-login': env.DATAFORSEO_LOGIN,
      'x-dataforseo-password': env.DATAFORSEO_PASSWORD,
    }),
    {
      action: 'serp',
      keywords: [input.keyword],
      target: '',
      country: input.country,
      depth: input.depth,
      limit: input.depth,
      noRank: true,
      ...(input.paa ? { peopleAlsoAskDepth: input.paa } : {}),
    },
  )
}

export function handleTitleWords(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'title-words',
    providerDailyLimit: dailyLimit(
      env.DATAFORSEO_RESEARCH_DAILY_PROVIDER_LIMIT,
    ),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseSerp,
    provider: async ({ keyword, country }) => {
      const serp = await liveSerp(env, {
        keyword,
        country,
        depth: TITLE_DEPTH,
      })
      const results = serp.rows
        .filter((row) => typeof row.title === 'string' && row.title)
        .map((row) => ({
          position: typeof row.position === 'number' ? row.position : null,
          title: String(row.title),
          domain: typeof row.domain === 'string' ? row.domain : null,
        }))
      return {
        keyword,
        country,
        ...titleWords(results.map((row) => row.title)),
        results,
        partial: serp.partial,
        checkedAt: new Date().toISOString(),
      }
    },
  })
}

// Google answers most People Also Ask questions with its own AI text, so
// the page for each question is the first result when the question itself
// is searched. DataForSEO returns most results as Google redirect links;
// two redirect hops reach the page, and a link that does not resolve
// leaves the page unknown, with only its site.
const PAA_QUESTIONS = 8
const REDIRECT_TIMEOUT_MS = 4_000

async function resolveGoogleLink(url: string): Promise<string | null> {
  let next = url
  for (let hop = 0; hop < 2; hop += 1) {
    try {
      const response = await fetch(next, {
        redirect: 'manual',
        signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
      })
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || response.status < 300 || response.status > 399) {
        return null
      }
      const target = new URL(location, next)
      if (!GOTO.test(target.href)) {
        return ['http:', 'https:'].includes(target.protocol)
          ? target.href
          : null
      }
      next = target.href
    } catch {
      return null
    }
  }
  return null
}

async function answeringPage(
  env: Cloudflare.Env,
  question: string,
  country: string,
): Promise<{
  url: string | null
  domain: string | null
  title: string | null
}> {
  try {
    const done = await dataForSeoTask(
      serpKeys(env),
      'v3/serp/google/organic/live/advanced',
      {
        ...dataForSeoMarket(country, dataForSeoLanguage(country)),
        keyword: question,
        depth: 10,
      },
    )
    const items = (done.result?.items ?? []) as Record<string, unknown>[]
    const first = items.find(
      (item) => item.type === 'organic' || item.type === 'featured_snippet',
    )
    const row = dataForSeoSerp(question, items).rows[0]
    if (!first || !row) return { url: null, domain: null, title: null }
    const raw = typeof first.url === 'string' ? first.url : ''
    const url = GOTO.test(raw) ? await resolveGoogleLink(raw) : raw || null
    const host = url ? new URL(url).hostname : null
    return {
      url,
      domain: host ?? (typeof row.domain === 'string' ? row.domain : null),
      title: typeof row.title === 'string' ? row.title : null,
    }
  } catch {
    return { url: null, domain: null, title: null }
  }
}

// Each page's estimated monthly organic traffic, from one bulk DataForSEO
// call. A page DataForSEO has no data for stays null (unknown), and a
// failed call leaves every page unknown rather than zero.
async function pageTraffic(
  env: Cloudflare.Env,
  urls: string[],
  country: string,
): Promise<{ traffic: Map<string, number>; failed: boolean }> {
  const traffic = new Map<string, number>()
  if (!urls.length) return { traffic, failed: false }
  try {
    const done = await dataForSeoTask(
      serpKeys(env),
      'v3/dataforseo_labs/google/bulk_traffic_estimation/live',
      {
        ...dataForSeoMarket(country, dataForSeoLanguage(country)),
        targets: urls,
        item_types: ['organic'],
      },
    )
    const items = (done.result?.items ?? []) as Record<string, unknown>[]
    for (const item of items) {
      const organic = (item.metrics as Record<string, unknown> | undefined)
        ?.organic as Record<string, unknown> | undefined
      if (typeof item.target === 'string' && typeof organic?.etv === 'number') {
        traffic.set(item.target.toLowerCase(), Math.round(organic.etv))
      }
    }
    return { traffic, failed: false }
  } catch {
    return { traffic, failed: true }
  }
}

export function handlePeopleAlsoAsk(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'people-also-ask',
    providerDailyLimit: dailyLimit(
      env.DATAFORSEO_RESEARCH_DAILY_PROVIDER_LIMIT,
    ),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseSerp,
    provider: async ({ keyword, country }) => {
      // Opening the first questions makes Google show a few more.
      const serp = await liveSerp(env, { keyword, country, depth: 10, paa: 1 })
      const asked = (serp.peopleAlsoAsk?.[0]?.questions ?? []).slice(
        0,
        PAA_QUESTIONS,
      )
      const pages = await Promise.all(
        asked.map((item) =>
          item.url
            ? { url: item.url, domain: item.domain, title: item.title }
            : answeringPage(env, item.question, country),
        ),
      )
      const urls = [
        ...new Set(pages.map((page) => page.url).filter((url) => url !== null)),
      ]
      const { traffic, failed } = await pageTraffic(env, urls, country)
      return {
        keyword,
        country,
        questions: asked.map((item, index) => {
          const page = pages[index]
          return {
            question: item.question,
            aiAnswer: item.aiAnswer,
            // Google linked this page in the answer box itself.
            linked: item.url !== null,
            url: page?.url ?? null,
            domain: page?.domain ?? null,
            title: page?.title ?? null,
            traffic: page?.url
              ? (traffic.get(page.url.toLowerCase()) ?? null)
              : null,
          }
        }),
        trafficFailed: failed,
        partial: serp.partial,
        checkedAt: new Date().toISOString(),
      }
    },
  })
}
