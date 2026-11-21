import {
  CHECKED_SERP,
  dataForSeoLanguage,
  dataForSeoMarket,
  dataForSeoSerp,
  dataForSeoTask,
  overlapKey,
} from '@seo/core/commands'
import {
  allowLocalTurnstileTest,
  dailyLimit,
  RESEARCH_COUNTRIES,
} from './paid-tool-routes.ts'
import {
  handleProtectedTool,
  type ProtectedToolParsedInput,
} from './protected-tool-handler.ts'

// The AI Overview checker: one live Google results page per keyword, read
// 20 organic results deep, with the AI Overview's text and its cited
// sources matched to their organic position on the same page.
const MAX_KEYWORDS = 5
const KEYWORD_CHARACTERS = 200
const DEPTH = 20

type ResearchRows = {
  rows: ReturnType<typeof dataForSeoSerp>['rows']
  aiOverviews: NonNullable<ReturnType<typeof dataForSeoSerp>['overview']>[]
  missed: string[]
  noData: string[]
  partial: boolean
}
type Device = 'desktop' | 'mobile'
type AiOverviewInput = {
  keywords: string[]
  domain: string | null
  country: string
  device: Device
}

export type AiOverviewSource = {
  // 1-based order in the overview.
  order: number
  title: string | null
  // null when Google linked the source through its own redirect link, so
  // the page is unknown.
  url: string | null
  domain: string | null
  // This exact page's organic position on the same results page, null when
  // it is not in the results read or the page is unknown.
  position: number | null
  // How position was matched: the result's own URL, or Google's breadcrumb
  // when the result's URL was a redirect link.
  matchedBy: 'url' | 'breadcrumb' | null
  // The best organic position of any page on the source's site.
  sitePosition: number | null
  mine: boolean
}

export type AiOverviewKeyword = {
  keyword: string
  // overview: Google showed an AI Overview. none: the page came back with
  // no AI Overview. no_results: the search came back with no results, so
  // the overview is unknown. failed: the search could not be read.
  status: 'overview' | 'none' | 'no_results' | 'failed'
  // The overview's Markdown, null when its words could not be read.
  text: string | null
  sources: AiOverviewSource[]
  // How many organic results were read for matching.
  organicRead: number
  // The person's best organic result, when they gave a domain.
  yourPosition: number | null
  yourUrl: string | null
  yourCited: boolean
}

export type AiOverviewResult = {
  country: string
  device: Device
  domain: string | null
  keywords: AiOverviewKeyword[]
  partial: boolean
  checkedAt: string
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid request.')
  }
  return value as Record<string, unknown>
}

const bare = (host: string) =>
  host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/\/$/u, '')
    .replace(/^www\./u, '')

export function parseAiOverview(
  value: unknown,
): ProtectedToolParsedInput<AiOverviewInput> {
  const input = record(value)
  const fields = ['keywords', 'domain', 'country', 'device', 'turnstileToken']
  if (Object.keys(input).some((field) => !fields.includes(field))) {
    throw new TypeError('Invalid request.')
  }
  if (
    typeof input.turnstileToken !== 'string' ||
    !Array.isArray(input.keywords) ||
    input.keywords.length < 1 ||
    input.keywords.length > MAX_KEYWORDS ||
    (input.domain !== undefined && typeof input.domain !== 'string') ||
    (input.device !== 'desktop' && input.device !== 'mobile') ||
    typeof input.country !== 'string' ||
    !RESEARCH_COUNTRIES.includes(
      input.country as (typeof RESEARCH_COUNTRIES)[number],
    )
  ) {
    throw new TypeError('Invalid request.')
  }
  const seen = new Set<string>()
  const keywords: string[] = []
  for (const raw of input.keywords) {
    if (typeof raw !== 'string') throw new TypeError('Invalid keyword.')
    const keyword = raw.trim().replace(/\s+/gu, ' ')
    if (!keyword || keyword.length > KEYWORD_CHARACTERS) {
      throw new TypeError('Invalid keyword.')
    }
    if (seen.has(keyword.toLowerCase())) continue
    seen.add(keyword.toLowerCase())
    keywords.push(keyword)
  }
  let domain: string | null = null
  if (typeof input.domain === 'string' && input.domain.trim()) {
    const target = input.domain.trim().toLowerCase()
    if (
      target.length > 253 ||
      !/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\/?$/u.test(target)
    ) {
      throw new TypeError('Invalid domain.')
    }
    domain = bare(target)
  }
  return {
    target: keywords.join('\n'),
    turnstileToken: input.turnstileToken,
    providerInput: {
      keywords,
      domain,
      country: input.country,
      device: input.device,
    },
  }
}

const isMine = (host: string | null, mine: string | null) => {
  if (!host || !mine) return false
  const site = bare(host)
  return site === mine || site.endsWith(`.${mine}`)
}

type Organic = {
  position: number
  key: string
  breadcrumb: boolean
  site: string
  url: string | null
}

// Builds each keyword's result from one serp research run. Keywords stay
// in the order they were asked, sources in the overview's order.
export function aiOverviewResult(
  input: AiOverviewInput,
  serp: ResearchRows,
  checkedAt: string,
): AiOverviewResult {
  const missed = new Set(serp.missed)
  const noData = new Set(serp.noData)
  const keywords = input.keywords.map((keyword): AiOverviewKeyword => {
    const organic: Organic[] = serp.rows
      .filter(
        (row) =>
          row.keyword === keyword &&
          row.type === 'organic' &&
          typeof row.position === 'number' &&
          row.position >= 1 &&
          row.position <= DEPTH,
      )
      .map((row) => {
        const { key, breadcrumb } = overlapKey(row)
        return {
          position: row.position as number,
          key,
          breadcrumb,
          site: typeof row.domain === 'string' ? bare(row.domain) : '',
          url:
            typeof row.url === 'string'
              ? row.url
              : typeof row.url_hint === 'string'
                ? row.url_hint
                : null,
        }
      })
      .sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))
    const yours = organic.find((row) => isMine(row.site, input.domain))
    const overview = serp.aiOverviews?.find((item) => item.keyword === keyword)
    const sources = (overview?.references ?? []).map(
      (ref, index): AiOverviewSource => {
        const key = ref.url ? overlapKey({ url: ref.url }).key : ''
        const page = key ? organic.find((row) => row.key === key) : undefined
        const site = ref.domain ? bare(ref.domain) : ''
        const best = site ? organic.find((row) => row.site === site) : undefined
        return {
          order: index + 1,
          title: ref.title,
          url: ref.url,
          domain: ref.domain,
          position: page?.position ?? null,
          matchedBy: page ? (page.breadcrumb ? 'breadcrumb' : 'url') : null,
          sitePosition: best?.position ?? null,
          mine: isMine(ref.domain, input.domain),
        }
      },
    )
    const status: AiOverviewKeyword['status'] = missed.has(keyword)
      ? 'failed'
      : overview
        ? 'overview'
        : noData.has(keyword)
          ? 'no_results'
          : 'none'
    return {
      keyword,
      status,
      text: overview?.text ?? null,
      sources,
      organicRead: organic.length,
      yourPosition: yours?.position ?? null,
      yourUrl: yours?.url ?? null,
      yourCited: sources.some((source) => source.mine),
    }
  })
  return {
    country: input.country,
    device: input.device,
    domain: input.domain,
    keywords,
    partial: serp.partial,
    checkedAt,
  }
}

// One live results page per keyword, all at once (5 at most). Each search
// waits for an AI Overview Google builds after the page loads, which a
// plain search misses: about $0.002 more, refunded when there is none.
async function liveSerps(
  env: Cloudflare.Env,
  input: AiOverviewInput,
): Promise<ResearchRows> {
  const market = dataForSeoMarket(
    input.country,
    dataForSeoLanguage(input.country),
  )
  const serp: ResearchRows = {
    rows: [],
    aiOverviews: [],
    missed: [],
    noData: [],
    partial: false,
  }
  const pages = await Promise.all(
    input.keywords.map((keyword) =>
      dataForSeoTask(
        [env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD],
        'v3/serp/google/organic/live/advanced',
        {
          ...market,
          keyword,
          depth: DEPTH,
          device: input.device,
          load_async_ai_overview: true,
          ...CHECKED_SERP,
        },
      ).catch(() => null),
    ),
  )
  for (const [index, keyword] of input.keywords.entries()) {
    const done = pages[index]
    if (!done) {
      serp.missed.push(keyword)
      continue
    }
    if (done.partial) serp.partial = true
    const items = (done.result?.items ?? []) as Record<string, unknown>[]
    if (!done.result || !items.length) {
      serp.noData.push(keyword)
      continue
    }
    const { rows, overview } = dataForSeoSerp(keyword, items)
    serp.rows.push(...rows)
    if (overview) serp.aiOverviews.push(overview)
  }
  if (serp.missed.length === input.keywords.length) {
    throw new Error('Every search failed.')
  }
  return serp
}

export function handleAiOverview(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'ai-overview',
    providerDailyLimit: dailyLimit(env.DATAFORSEO_AI_DAILY_CENTS),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseAiOverview,
    provider: async (input) => {
      const serp = await liveSerps(env, input)
      return aiOverviewResult(input, serp, new Date().toISOString())
    },
  })
}
