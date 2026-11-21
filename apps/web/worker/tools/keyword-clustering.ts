import { overlapKey, research } from '@seo/core/commands'
import {
  allowLocalTurnstileTest,
  dailyLimit,
  RESEARCH_COUNTRIES,
} from './paid-tool-routes.ts'
import {
  handleProtectedTool,
  type ProtectedToolParsedInput,
} from './protected-tool-handler.ts'

// The keyword clustering tool reads each keyword's top 10 organic results
// on the site's DataForSEO account and returns the pages behind them. The
// page groups the keywords itself, so changing how many shared pages make a
// group needs no new request.
const MIN_KEYWORDS = 2
const MAX_KEYWORDS = 50
// Raw lines read before dedupe, so a list of repeats is still bounded.
const MAX_LINES = 200
const KEYWORD_CHARACTERS = 200
const DEPTH = 10
// A DataForSEO serp call takes at most 5 keywords.
const BATCH = 5
// Batches run at once; each batch asks for its keywords in parallel.
const BATCHES_AT_ONCE = 3

type ClusteringInput = {
  keywords: string[]
  country: string
  domain: string | null
}

type Status = 'ok' | 'no_results' | 'failed'

export type ClusteringKeyword = {
  keyword: string
  // ok: results were read. no_results: Google showed no organic results.
  // failed: the search failed, so nothing is known about this keyword.
  status: Status
  // Organic results read, at most 10.
  results: number
  // Distinct pages among them; a Google redirect link whose breadcrumb
  // names only the site, or is shortened, has no page to compare.
  compared: number
  // Page keys (host and path, without www or query) in ranking order.
  pages: string[]
  // Sites in ranking order, without www.
  domains: string[]
  // The domain's first result, when a domain was given and it ranks in the
  // top 10. null when it does not, or when the keyword was not read.
  domainPosition: number | null
  domainUrl: string | null
}

export type ClusteringResult = {
  country: string
  domain: string | null
  keywords: ClusteringKeyword[]
  // DataForSEO could not fetch every results page it was asked for.
  partial: boolean
  checkedAt: string
}

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

const bare = (host: string) => host.toLowerCase().replace(/^www\./u, '')

function parseDomain(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new TypeError('Invalid domain.')
  const domain = value.trim().toLowerCase()
  if (!domain) return null
  if (!/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\/?$/u.test(domain)) {
    throw new TypeError('Invalid domain.')
  }
  return bare(domain.replace(/^https?:\/\//u, '').replace(/\/$/u, ''))
}

export function parseKeywordClustering(
  value: unknown,
): ProtectedToolParsedInput<ClusteringInput> {
  const input = record(value)
  exactFields(input, ['keywords', 'country', 'domain', 'turnstileToken'])
  if (
    !Array.isArray(input.keywords) ||
    input.keywords.length > MAX_LINES ||
    typeof input.turnstileToken !== 'string' ||
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
    if (!keyword) continue
    if (keyword.length > KEYWORD_CHARACTERS) {
      throw new TypeError('Invalid keyword.')
    }
    const key = keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    keywords.push(keyword)
  }
  if (keywords.length < MIN_KEYWORDS || keywords.length > MAX_KEYWORDS) {
    throw new TypeError('Invalid keyword count.')
  }
  return {
    target: keywords[0] ?? '',
    turnstileToken: input.turnstileToken,
    providerInput: {
      keywords,
      country: input.country,
      domain: parseDomain(input.domain),
    },
  }
}

type Serp = Awaited<ReturnType<typeof research>>

async function readBatch(
  headers: Headers,
  keywords: string[],
  country: string,
): Promise<Serp | null> {
  try {
    return await research('dataforseo', headers, {
      action: 'serp',
      keywords,
      target: '',
      country,
      depth: DEPTH,
      limit: DEPTH,
      noRank: true,
    })
  } catch {
    // Every keyword in the batch failed; each is flagged, not dropped.
    return null
  }
}

const hostOf = (url: unknown) => {
  try {
    return new URL(String(url)).hostname
  } catch {
    return ''
  }
}

function keywordResult(
  keyword: string,
  serp: Serp | null,
  domain: string | null,
): ClusteringKeyword {
  const empty = {
    keyword,
    results: 0,
    compared: 0,
    pages: [],
    domains: [],
    domainPosition: null,
    domainUrl: null,
  }
  if (!serp || serp.missed.includes(keyword)) {
    return { ...empty, status: 'failed' }
  }
  // The first ten organic results, as serp_overlap compares them.
  const rows = serp.rows
    .filter((row) => row.keyword === keyword && row.type !== 'featured_snippet')
    .slice(0, DEPTH)
  if (!rows.length) return { ...empty, status: 'no_results' }
  const pages = [
    ...new Set(rows.map((row) => overlapKey(row).key).filter(Boolean)),
  ]
  const sites = rows.map((row) =>
    bare(typeof row.domain === 'string' ? row.domain : hostOf(row.url)),
  )
  const mine = domain
    ? sites.findIndex((site) => site === domain || site.endsWith(`.${domain}`))
    : -1
  const found = mine >= 0 ? rows[mine] : undefined
  return {
    keyword,
    status: 'ok',
    results: rows.length,
    compared: pages.length,
    pages,
    domains: [...new Set(sites.filter(Boolean))],
    domainPosition:
      typeof found?.position === 'number' && Number.isFinite(found.position)
        ? found.position
        : null,
    domainUrl:
      typeof found?.url === 'string'
        ? found.url
        : typeof found?.url_hint === 'string'
          ? found.url_hint
          : null,
  }
}

export async function clusterSerps(
  headers: Headers,
  { keywords, country, domain }: ClusteringInput,
): Promise<ClusteringResult> {
  const batches: string[][] = []
  for (let start = 0; start < keywords.length; start += BATCH) {
    batches.push(keywords.slice(start, start + BATCH))
  }
  const serps: (Serp | null)[] = new Array(batches.length).fill(null)
  let next = 0
  await Promise.all(
    Array.from(
      { length: Math.min(BATCHES_AT_ONCE, batches.length) },
      async () => {
        while (next < batches.length) {
          const index = next
          next += 1
          serps[index] = await readBatch(headers, batches[index] ?? [], country)
        }
      },
    ),
  )
  const results = batches.flatMap((batch, index) =>
    batch.map((keyword) =>
      keywordResult(keyword, serps[index] ?? null, domain),
    ),
  )
  if (results.every((item) => item.status === 'failed')) {
    throw new Error('Every search failed.')
  }
  return {
    country,
    domain,
    keywords: results,
    partial: serps.some((serp) => serp?.partial === true),
    checkedAt: new Date().toISOString(),
  }
}

export function handleKeywordClustering(
  request: Request,
  env: Cloudflare.Env,
): Promise<Response> {
  return handleProtectedTool(request, env, {
    tool: 'keyword-clustering',
    providerDailyLimit: dailyLimit(env.DATAFORSEO_AI_DAILY_CENTS),
    allowLocalhostTurnstileForTests: allowLocalTurnstileTest(request),
    parse: parseKeywordClustering,
    provider: (input) =>
      clusterSerps(
        new Headers({
          'x-dataforseo-login': env.DATAFORSEO_LOGIN,
          'x-dataforseo-password': env.DATAFORSEO_PASSWORD,
        }),
        input,
      ),
  })
}
