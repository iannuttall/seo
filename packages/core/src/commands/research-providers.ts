import { readJson } from '../http/read-json.js'
import { ahrefs } from './research-ahrefs.js'
import { CommandError } from './types.js'

// Keyword, competitor and backlink data from the person's own DataForSEO,
// Ahrefs account. Keys come as header-style names (from request
// headers in the hosted MCP, from the local secret store in the CLI) and are
// used for this one call only. Each function returns plain rows with the provider's own metric
// names, so numbers from different providers are never mixed.

export type ResearchProvider = 'dataforseo' | 'ahrefs'
export type ResearchAction =
  | 'keyword_metrics'
  | 'ranked_keywords'
  | 'serp'
  | 'competitors'
  | 'backlinks'
  | 'link_gap'
  | 'ai_answers'
  | 'top_pages'
  | 'pages_by_backlinks'
  | 'keyword_ideas'
  | 'serp_overlap'

// What a target covers: the whole site with its subdomains, every URL under
// a path (a subfolder such as example.com/blog/), or one page.
export const RESEARCH_SCOPES = ['domain', 'prefix', 'exact'] as const
export type ResearchScope = (typeof RESEARCH_SCOPES)[number]

export type ResearchInput = {
  action: Exclude<ResearchAction, 'ai_answers'>
  keywords: string[]
  target: string
  // Without it the target decides: a bare domain is the site, a path that
  // ends in / is a prefix, any other path is one page.
  scope?: ResearchScope
  // serp: how many results to read per keyword, up to 100.
  depth?: number
  // serp: leave out DataForSEO's paid domain_rank lookup.
  noRank?: boolean
  // link_gap only: the sites to compare the target with.
  competitors?: string[]
  country: string
  limit: number
}

type Row = Record<string, string | number | boolean | null>

function need(headers: Headers, provider: ResearchProvider): string[] {
  const values =
    provider === 'dataforseo'
      ? [
          headers.get('x-dataforseo-login'),
          headers.get('x-dataforseo-password'),
        ]
      : [headers.get('x-ahrefs-key')]
  if (values.some((value) => !value)) {
    throw new CommandError(
      'NO_KEY',
      `No ${provider} key. Hosted MCP: save it at https://seoskill.dev/account#keys. CLI and local MCP: run \`seo login\` to use the account's keys, or \`seo providers ${provider} connect\`.`,
    )
  }
  return values as string[]
}

// How long one attempt may take. DataForSEO's live tasks, AI answers among
// them, can take most of a minute; lists and Ahrefs answer in seconds.
const TASK_TIMEOUT_MS = 60_000
const READ_TIMEOUT_MS = 30_000
const RETRY_DELAY_MS = 250

const retryStatus = (status: number) => status === 429 || status >= 500

// One provider request with a timeout, tried twice when that is safe. A
// read (GET) is retried after a timeout, a network failure, a 429 or a 5xx.
// A DataForSEO task (POST) is charged once the provider takes it, so it is
// retried only when the provider refused it with a 429 or a 5xx, never
// after a timeout that may have been charged.
export async function call(
  provider: ResearchProvider,
  request: Request,
): Promise<Response> {
  const read = request.method === 'GET'
  const timeoutMs = read ? READ_TIMEOUT_MS : TASK_TIMEOUT_MS
  for (let attempt = 1; ; attempt += 1) {
    const last = attempt === 2
    let response: Response
    try {
      response = await fetch(request.clone(), {
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (read && !last) {
        await wait(RETRY_DELAY_MS)
        continue
      }
      const timedOut = (error as { name?: string }).name === 'TimeoutError'
      throw new CommandError(
        'PROVIDER_ERROR',
        timedOut
          ? `${provider} did not answer within ${timeoutMs / 1000} seconds.`
          : `${provider} could not be reached: ${(error as Error).message}`,
      )
    }
    if (response.ok) return response
    if (retryStatus(response.status) && !last) {
      await response.body?.cancel()
      await wait(RETRY_DELAY_MS)
      continue
    }
    const text = (await response.text()).slice(0, 300)
    throw new CommandError(
      response.status === 401 || response.status === 403
        ? 'NO_KEY'
        : response.status === 429
          ? 'RATE_LIMITED'
          : 'PROVIDER_ERROR',
      `${provider} answered ${response.status}. ${text}`,
    )
  }
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

// Actions that take keywords instead of a target.
const KEYWORD_ACTIONS: ResearchAction[] = [
  'keyword_metrics',
  'keyword_ideas',
  'serp',
  'serp_overlap',
]

// The default SERP depth, and how many keywords one call reads: serp reads
// up to 5 at any depth, serp_overlap up to 10 at depth 10.
export const SERP_DEPTH = 20
const SERP_KEYWORDS = 5
const OVERLAP_KEYWORDS = 10
const OVERLAP_DEPTH = 10
// keyword_ideas reads ideas for up to this many seed keywords.
export const IDEA_SEEDS = 5

function requireInput(input: ResearchInput) {
  const needsKeywords = KEYWORD_ACTIONS.includes(input.action)
  if (needsKeywords && input.keywords.length === 0) {
    throw new CommandError('INVALID_INPUT', `${input.action} needs keywords.`)
  }
  if (input.action === 'link_gap' && !input.target) {
    throw new CommandError(
      'INVALID_INPUT',
      'link_gap needs a target domain and competitors.',
    )
  }
  if (!needsKeywords && !input.target) {
    throw new CommandError(
      'INVALID_INPUT',
      `${input.action} needs a target domain or URL.`,
    )
  }
}

// Rows, plus what DataForSEO says the calls cost (null for Ahrefs, whose
// responses carry no cost), whether any call came back partial, the
// keywords that failed while others answered, and the keywords the provider
// answered with no data, so an empty answer is never silent.
export type ResearchRows = {
  rows: Row[]
  costUsd: number | null
  partial: boolean
  missed: string[]
  noData: string[]
  // link_gap: the authority the gap stops at, when a site's list was cut.
  floor?: { field: string; value: number }
  // link_gap: link lists, shorteners and directories left out.
  leftOut?: string[]
  // How many rows the provider has in all, when it says.
  available?: number
  // ranked_keywords: the provider's own estimate for the whole target.
  siteTotal?: SiteTotal
  // serp from DataForSEO: its domain_rank call failed, so the column is
  // missing, not zero.
  rankFailed?: boolean
  // serp_overlap: the top results read, and how many had a page and a site
  // to compare.
  compared?: { results: number; withPage: number; withSite: number }
}

// A provider's monthly organic traffic estimate for the whole target, in
// its own metric, with the keywords it counts.
export type SiteTotal = {
  metric: 'etv' | 'org_traffic'
  traffic: number
  keywords: number | null
}

// Each keyword's rows in order. A keyword that fails is listed in missed
// and the others still count; it throws only when every keyword failed, or
// at once when the key is missing or rejected.
export async function eachKeyword(
  keywords: string[],
  missed: string[],
  rowsFor: (keyword: string) => Promise<Row[]>,
): Promise<Row[]> {
  const rows: Row[] = []
  let failure: unknown
  for (const keyword of keywords) {
    try {
      rows.push(...(await rowsFor(keyword)))
    } catch (error) {
      if (error instanceof CommandError && error.code === 'NO_KEY') throw error
      failure ??= error
      missed.push(keyword)
    }
  }
  if (missed.length === keywords.length) throw failure
  return rows
}

export async function research(
  provider: ResearchProvider,
  headers: Headers,
  input: ResearchInput,
): Promise<ResearchRows> {
  requireInput(input)
  if (input.action === 'link_gap') return linkGap(provider, headers, input)
  if (input.action === 'serp_overlap') {
    return serpOverlap(provider, headers, input)
  }
  const keys = need(headers, provider)
  if (provider === 'dataforseo') return dataForSeo(keys, input)
  const missed: string[] = []
  const totals: { siteTotal?: SiteTotal } = {}
  const rows = await ahrefs(keys[0] ?? '', input, missed, totals)
  return {
    rows,
    costUsd: null,
    partial: false,
    missed,
    noData: withoutData(input, rows, missed, 100),
    ...totals,
  }
}

// DataForSEO

function countryName(code: string): string {
  return (
    new Intl.DisplayNames('en', { type: 'region' }).of(code.toUpperCase()) ??
    'United States'
  )
}

// The country's main language, for the SERP API, which takes any pair.
function mainLanguage(country: string): string {
  try {
    return new Intl.Locale(`und-${country.toUpperCase()}`).maximize().language
  } catch {
    return 'en'
  }
}

// DataForSEO Labs has data only for these countries, each in fixed
// languages. This is the one language used per country: the country's main
// language when Labs has it, else the first Labs language (English for India,
// Pakistan and Malaysia, where most search is in English). From the free
// v3/dataforseo_labs/locations_and_languages list.
const LABS_LANGUAGES: ReadonlyMap<string, string> = new Map(
  `
  ae:ar al:sq am:hy ao:pt ar:es at:de au:en az:az ba:bs bd:bn be:nl bf:fr
  bg:bg bh:ar bo:es br:pt ca:en ch:de ci:fr cl:es cm:fr co:es cr:es cy:el
  cz:cs de:de dk:da dz:ar ec:es ee:et eg:ar es:es fi:fi fr:fr gb:en gh:en
  gr:el gt:es hk:en hr:hr hu:hu id:id ie:en il:he in:en it:it jo:ar jp:ja
  ke:en kh:en kr:ko kz:ru lk:en lt:lt lv:lv ma:ar mc:fr md:ro mk:mk mm:en
  mt:en mx:es my:en ng:en ni:es nl:nl no:nb nz:en pa:es pe:es ph:en pk:en
  pl:pl pt:pt py:es ro:ro rs:sr sa:ar se:sv sg:en si:sl sk:sk sn:fr sv:es
  th:th tn:ar tr:tr tw:zh-TW ua:uk us:en uy:es ve:es vn:vi za:en
`
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(':') as [string, string]),
)

// The language DataForSEO gets for a country, or null when DataForSEO Labs
// has no data for it.
export function dataForSeoLanguage(country: string): string | null {
  return LABS_LANGUAGES.get(country.toLowerCase()) ?? null
}

export function dataForSeoMarket(country: string, language: string | null) {
  return {
    location_name: countryName(country),
    language_code: language ?? mainLanguage(country),
  }
}

// The DataForSEO login and password, or a NO_KEY error.
export function dataForSeoKeys(headers: Headers): string[] {
  return need(headers, 'dataforseo')
}

// A free DataForSEO list, such as an engine's locations or languages.
export async function dataForSeoList(
  [login, password]: string[],
  path: string,
): Promise<Record<string, unknown>[]> {
  const response = await call(
    'dataforseo',
    new Request(`https://api.dataforseo.com/${path}`, {
      headers: { authorization: `Basic ${btoa(`${login}:${password}`)}` },
    }),
  )
  const data = (await readJson(response, 'DataForSEO')) as {
    tasks?: { status_code: number; result?: Record<string, unknown>[] | null }[]
  }
  const task = data.tasks?.[0]
  if (!task || task.status_code >= 40000) {
    throw new CommandError('PROVIDER_ERROR', `dataforseo: no list at ${path}`)
  }
  return task.result ?? []
}

// One DataForSEO task: its first result and what it cost, in USD.
export async function dataForSeoTask(
  [login, password]: string[],
  path: string,
  task: Record<string, unknown>,
): Promise<{
  cost: number
  result: Record<string, unknown> | null
  partial: boolean
  noResults?: boolean
}> {
  const response = await call(
    'dataforseo',
    new Request(`https://api.dataforseo.com/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${login}:${password}`)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([task]),
    }),
  )
  const data = (await readJson(response, 'DataForSEO')) as {
    tasks?: {
      status_code: number
      status_message: string
      cost?: number
      result?: Record<string, unknown>[] | null
    }[]
  }
  const result = data.tasks?.[0]
  // 40102 is DataForSEO's "No Search Results": an empty answer, not an
  // error. 40106 is a result with some pages missing.
  if (result?.status_code === NO_RESULTS) {
    return {
      cost: result.cost ?? 0,
      result: null,
      partial: false,
      noResults: true,
    }
  }
  if (
    !result ||
    (result.status_code >= 40000 && result.status_code !== PARTIAL)
  ) {
    // A failed task can still be charged; the cost goes with the error.
    throw Object.assign(
      new CommandError(
        'PROVIDER_ERROR',
        `dataforseo: ${result?.status_message ?? 'no task result'}`,
      ),
      { cost: result?.cost ?? 0 },
    )
  }
  return {
    cost: result.cost ?? 0,
    result: result.result?.[0] ?? null,
    partial: result.status_code === PARTIAL,
  }
}

const NO_RESULTS = 40102
const PARTIAL = 40106

// One DataForSEO task in the queue: what task_post or task_get said about it.
export type DataForSeoQueued = {
  id: string
  status_code: number
  status_message: string
  cost: number
  data: Record<string, unknown>
  result: Record<string, unknown> | null
}

const queued = (task: Record<string, unknown>): DataForSeoQueued => ({
  id: String(task.id ?? ''),
  status_code: Number(task.status_code ?? 0),
  status_message: String(task.status_message ?? ''),
  cost: Number(task.cost ?? 0),
  data: (task.data ?? {}) as Record<string, unknown>,
  result: (task.result as Record<string, unknown>[] | null)?.[0] ?? null,
})

// Up to 100 tasks queued in one request (DataForSEO's Standard method).
// Each task is charged when it is queued; its result is read later with
// dataForSeoGet, for free, for 30 days.
export async function dataForSeoPost(
  [login, password]: string[],
  path: string,
  tasks: Record<string, unknown>[],
): Promise<DataForSeoQueued[]> {
  const response = await call(
    'dataforseo',
    new Request(`https://api.dataforseo.com/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${login}:${password}`)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(tasks),
    }),
  )
  const data = (await readJson(response, 'DataForSEO')) as {
    tasks?: Record<string, unknown>[]
  }
  return (data.tasks ?? []).map(queued)
}

// Task in queue (40601 handed, 40602 in queue): not ready yet.
export const DATAFORSEO_NOT_READY = new Set([40601, 40602])
export const DATAFORSEO_NO_RESULTS = NO_RESULTS

// A queued task's state and, once it is done, its first result.
export async function dataForSeoGet(
  [login, password]: string[],
  path: string,
): Promise<DataForSeoQueued> {
  const response = await call(
    'dataforseo',
    new Request(`https://api.dataforseo.com/${path}`, {
      headers: { authorization: `Basic ${btoa(`${login}:${password}`)}` },
    }),
  )
  const data = (await readJson(response, 'DataForSEO')) as {
    tasks?: Record<string, unknown>[]
  }
  const task = data.tasks?.[0]
  if (!task) {
    throw new CommandError('PROVIDER_ERROR', `dataforseo: no task at ${path}`)
  }
  return queued(task)
}

async function dataForSeo(
  keys: string[],
  input: ResearchInput,
): Promise<ResearchRows> {
  const spent: Spent = { cost: 0, partial: false, missed: [] }
  const rows = await dataForSeoRows(keys, input, spent)
  return {
    rows,
    costUsd: Math.round(spent.cost * 10_000) / 10_000,
    partial: spent.partial,
    missed: spent.missed,
    noData: withoutData(input, rows, spent.missed, 700),
    ...(spent.available !== undefined ? { available: spent.available } : {}),
    ...(spent.siteTotal ? { siteTotal: spent.siteTotal } : {}),
    ...(spent.rankFailed ? { rankFailed: true } : {}),
  }
}

// The keywords asked for that got no row and did not fail: the provider
// has no data for them, or Google showed no results.
function withoutData(
  input: ResearchInput,
  rows: Row[],
  missed: string[],
  keywordLimit: number,
): string[] {
  if (input.action === 'keyword_metrics' || input.action === 'serp') {
    const max = input.action === 'serp' ? serpKeywords(input) : keywordLimit
    // A keyword_metrics row with no volume is no data too: the volume is
    // unknown, not zero.
    const answered = new Set(
      rows
        .filter(
          (row) =>
            input.action === 'serp' ||
            (row.search_volume ?? row.volume ?? null) !== null,
        )
        .map((row) => String(row.keyword ?? '').toLowerCase()),
    )
    const failed = new Set(missed)
    return input.keywords
      .slice(0, max)
      .filter(
        (keyword) =>
          !failed.has(keyword) && !answered.has(keyword.toLowerCase()),
      )
  }
  return []
}

type Spent = {
  cost: number
  partial: boolean
  missed: string[]
  available?: number
  siteTotal?: SiteTotal
  // serp: the domain_rank call failed.
  rankFailed?: boolean
}

async function dataForSeoRows(
  keys: string[],
  input: ResearchInput,
  spent: Spent,
): Promise<Row[]> {
  const language = dataForSeoLanguage(input.country)
  // The Backlinks API and live SERPs work for any country; Labs does not.
  const anyCountry = ['serp', 'backlinks', 'pages_by_backlinks']
  if (!language && !anyCountry.includes(input.action)) {
    throw new CommandError(
      'INVALID_INPUT',
      `DataForSEO has no ${input.action} data for country "${input.country}".`,
    )
  }
  const market = dataForSeoMarket(input.country, language)
  const where = targetParts(input)
  // The last task's result without its items, for totals.
  let header: Record<string, unknown> | null = null
  const post = async (
    path: string,
    task: Record<string, unknown>,
    attempts = 1,
  ): Promise<Record<string, unknown>[]> => {
    const done = await dataForSeoTask(keys, path, {
      ...market,
      ...task,
    }).catch((error: unknown) => {
      spent.cost += (error as { cost?: number }).cost ?? 0
      throw error
    })
    spent.cost += done.cost
    spent.partial ||= done.partial
    header = done.result
    const total = done.result?.total_count
    if (typeof total === 'number') spent.available = total
    // Google sometimes shows DataForSEO no results for a search that has
    // them; a second request usually gets the page.
    if (done.noResults && attempts > 1) return post(path, task, attempts - 1)
    return (done.result?.items as Record<string, unknown>[] | undefined) ?? []
  }
  const get = (value: unknown, path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (current, key) =>
          current && typeof current === 'object'
            ? (current as Record<string, unknown>)[key]
            : undefined,
        value,
      )
  const pick = (item: unknown, fields: Record<string, string>): Row =>
    Object.fromEntries(
      Object.entries(fields).map(([name, path]) => [
        name,
        (get(item, path) as Row[string] | undefined) ?? null,
      ]),
    )

  if (input.action === 'keyword_metrics') {
    const items = await post(
      'v3/dataforseo_labs/google/keyword_overview/live',
      { keywords: input.keywords.slice(0, 700) },
    )
    return items.map((item) =>
      pick(item, {
        keyword: 'keyword',
        search_volume: 'keyword_info.search_volume',
        keyword_difficulty: 'keyword_properties.keyword_difficulty',
        cpc: 'keyword_info.cpc',
        competition: 'keyword_info.competition',
        main_intent: 'search_intent_info.main_intent',
      }),
    )
  }
  if (input.action === 'keyword_ideas') {
    // Keyword suggestions contain the seed, as Ahrefs' matching terms do.
    // DataForSEO's keyword_ideas, by category, drifts to unrelated searches.
    return eachKeyword(
      input.keywords.slice(0, IDEA_SEEDS),
      spent.missed,
      async (seed) => {
        const items = await post(
          'v3/dataforseo_labs/google/keyword_suggestions/live',
          {
            keyword: seed,
            include_seed_keyword: true,
            limit: input.limit,
            order_by: ['keyword_info.search_volume,desc'],
          },
        )
        return items.map((item) => ({
          seed,
          ...pick(item, {
            keyword: 'keyword',
            search_volume: 'keyword_info.search_volume',
            keyword_difficulty: 'keyword_properties.keyword_difficulty',
            cpc: 'keyword_info.cpc',
            main_intent: 'search_intent_info.main_intent',
          }),
        }))
      },
    )
  }
  if (input.action === 'ranked_keywords') {
    const items = await post('v3/dataforseo_labs/google/ranked_keywords/live', {
      target: where.scope === 'exact' ? where.page : where.host,
      limit: input.limit,
      order_by: ['ranked_serp_element.serp_item.etv,desc'],
      ...(where.scope === 'prefix'
        ? {
            filters: [
              'ranked_serp_element.serp_item.relative_url',
              'like',
              `${where.path}%`,
            ],
          }
        : {}),
    })
    // The totals cover the whole target (or prefix), not only these rows.
    const organic = get(header, 'metrics.organic')
    const etv = get(organic, 'etv')
    if (typeof etv === 'number') {
      const count = get(organic, 'count')
      spent.siteTotal = {
        metric: 'etv',
        traffic: Math.round(etv),
        keywords: typeof count === 'number' ? count : null,
      }
    }
    return items.map((item) =>
      pick(item, {
        keyword: 'keyword_data.keyword',
        position: 'ranked_serp_element.serp_item.rank_absolute',
        url: 'ranked_serp_element.serp_item.url',
        search_volume: 'keyword_data.keyword_info.search_volume',
        etv: 'ranked_serp_element.serp_item.etv',
        keyword_difficulty:
          'keyword_data.keyword_properties.keyword_difficulty',
        main_intent: 'keyword_data.search_intent_info.main_intent',
      }),
    )
  }
  if (input.action === 'serp') {
    const rows = await eachKeyword(
      input.keywords.slice(0, serpKeywords(input)),
      spent.missed,
      async (keyword) => {
        const items = await post(
          'v3/serp/google/organic/live/advanced',
          { keyword, depth: serpDepth(input) },
          2,
        )
        return items
          .filter((item) => item.type === 'organic')
          .map((item) => {
            const row: Row = pick(item, {
              position: 'rank_absolute',
              url: 'url',
              domain: 'domain',
              title: 'title',
            })
            // DataForSEO leaves most of Google's goto redirects unresolved,
            // and they resolve only in a browser. The page is then unknown,
            // but Google's breadcrumb still shows the site and the start of
            // the path.
            if (
              /^https?:\/\/(www\.)?google\.[a-z.]+\/goto\b/.test(
                String(row.url),
              )
            ) {
              const crumb = String(item.breadcrumb ?? '')
              const site = /^https?:\/\/([^/\s›]+)/.exec(crumb)
              row.url = null
              row.domain = site?.[1] ?? null
              row.url_hint = site ? crumb.replace(/^https?:\/\//, '') : null
            }
            return { keyword, ...row }
          })
      },
    )
    return input.noRank ? rows : withDomainRank(keys, rows, spent)
  }
  if (input.action === 'top_pages') {
    const items = await post('v3/dataforseo_labs/google/relevant_pages/live', {
      target: where.host,
      limit: input.limit,
      order_by: ['metrics.organic.etv,desc'],
      ...(where.scope === 'domain'
        ? {}
        : {
            filters:
              where.scope === 'prefix'
                ? ['page_address', 'like', likePrefix(where.host, where.path)]
                : ['page_address', '=', where.page],
          }),
    })
    return items.map((item) =>
      pick(item, {
        url: 'page_address',
        etv: 'metrics.organic.etv',
        keywords: 'metrics.organic.count',
        pos_1: 'metrics.organic.pos_1',
        pos_2_3: 'metrics.organic.pos_2_3',
        pos_4_10: 'metrics.organic.pos_4_10',
      }),
    )
  }
  if (input.action === 'pages_by_backlinks') {
    const items = await post('v3/backlinks/domain_pages/live', {
      target: where.host,
      limit: input.limit,
      order_by: ['page_summary.referring_domains,desc'],
      ...(where.scope === 'domain'
        ? {}
        : {
            filters:
              where.scope === 'prefix'
                ? ['page', 'like', likePrefix(where.host, where.path)]
                : ['page', '=', where.page],
          }),
    })
    return items.map((item) =>
      pick(item, {
        url: 'page',
        status: 'status_code',
        title: 'meta.title',
        referring_domains: 'page_summary.referring_domains',
        backlinks: 'page_summary.backlinks',
        rank: 'page_summary.rank',
        first_seen: 'page_summary.first_seen',
      }),
    )
  }
  if (input.action === 'backlinks') {
    const items = await post('v3/backlinks/referring_domains/live', {
      target: where.scope === 'exact' ? where.page : where.host,
      limit: input.limit,
      order_by: ['rank,desc'],
      ...(where.scope === 'prefix'
        ? {
            backlinks_filters: [
              'url_to',
              'like',
              likePrefix(where.host, where.path),
            ],
          }
        : {}),
    })
    return items.map((item) =>
      pick(item, {
        domain: 'domain',
        rank: 'rank',
        backlinks: 'backlinks',
        referring_pages: 'referring_pages',
        first_seen: 'first_seen',
      }),
    )
  }
  const items = await post(
    'v3/dataforseo_labs/google/competitors_domain/live',
    {
      target: bareTarget(input.target),
      limit: input.limit,
    },
  )
  return items.map((item) =>
    pick(item, {
      domain: 'domain',
      shared_keywords: 'intersections',
      avg_position: 'avg_position',
      organic_keywords: 'full_domain_metrics.organic.count',
      organic_etv: 'full_domain_metrics.organic.etv',
    }),
  )
}

// DataForSEO's own authority score for each result's domain, 0 to 100, as
// domain_rank right after domain: one bulk_ranks call for every domain in
// the SERPs (at most 5 searches of 100 results). It is not Ahrefs' Domain
// Rating. When the call fails the rows stay, with domain_rank null.
async function withDomainRank(
  keys: string[],
  rows: Row[],
  spent: Spent,
): Promise<Row[]> {
  const domains = [
    ...new Set(rows.map((row) => String(row.domain ?? '')).filter(Boolean)),
  ].slice(0, 1000)
  const ranks = new Map<string, number | null>()
  if (domains.length) {
    try {
      const done = await dataForSeoTask(keys, 'v3/backlinks/bulk_ranks/live', {
        targets: domains,
        rank_scale: 'one_hundred',
      })
      spent.cost += done.cost
      const items = (done.result?.items ?? []) as {
        target?: string
        rank?: number
      }[]
      for (const item of items) {
        if (item.target) ranks.set(item.target, item.rank ?? null)
      }
    } catch (error) {
      spent.cost += (error as { cost?: number }).cost ?? 0
      spent.rankFailed = true
    }
  }
  return rows.map((row) => {
    const next: Row = {}
    for (const [name, value] of Object.entries(row)) {
      next[name] = value
      if (name === 'domain') {
        next.domain_rank = ranks.get(String(value ?? '')) ?? null
      }
    }
    return next
  })
}

const siteOf = (url: unknown) => {
  try {
    return new URL(String(url)).hostname
  } catch {
    return ''
  }
}

export const serpKeywords = (input: ResearchInput) =>
  input.action === 'serp_overlap' ? OVERLAP_KEYWORDS : SERP_KEYWORDS
export const serpDepth = (input: ResearchInput) =>
  Math.max(1, Math.min(input.depth ?? SERP_DEPTH, 100))

// For each pair of keywords, how many of their top 10 results are the same
// page and the same site: one SERP per keyword at depth 10. A result whose
// page the provider did not return (a Google redirect link) cannot be
// compared by page, so each keyword says how many pages it compared.
async function serpOverlap(
  provider: ResearchProvider,
  headers: Headers,
  input: ResearchInput,
): Promise<ResearchRows> {
  const serps = await research(provider, headers, {
    ...input,
    action: 'serp',
    depth: OVERLAP_DEPTH,
    limit: OVERLAP_DEPTH,
    noRank: true,
  })
  const keywords = [
    ...new Set(input.keywords.slice(0, OVERLAP_KEYWORDS)),
  ].filter(
    (keyword) =>
      !serps.missed.includes(keyword) && !serps.noData.includes(keyword),
  )
  const host = (value: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/^www\./, '')
  const top = new Map(
    keywords.map((keyword) => {
      // The first ten organic results; rank_absolute also counts ads and
      // other features, so it is not used to cut.
      const rows = serps.rows
        .filter((row) => row.keyword === keyword)
        .slice(0, OVERLAP_DEPTH)
      const pages = new Set(
        rows
          .map((row) => row.url)
          .filter((url): url is string => typeof url === 'string' && url !== '')
          .map((url) => url.replace(/\/$/, '').toLowerCase()),
      )
      const sites = new Set(
        rows.map((row) => host(row.domain ?? siteOf(row.url))).filter(Boolean),
      )
      return [keyword, { results: rows.length, pages, sites }] as const
    }),
  )
  const rows: Row[] = []
  for (const [i, a] of keywords.entries()) {
    for (const b of keywords.slice(i + 1)) {
      const left = top.get(a)
      const right = top.get(b)
      if (!left || !right) continue
      rows.push({
        keyword_a: a,
        keyword_b: b,
        shared_pages: [...left.pages].filter((url) => right.pages.has(url))
          .length,
        shared_sites: [...left.sites].filter((site) => right.sites.has(site))
          .length,
        pages_compared_a: left.pages.size,
        pages_compared_b: right.pages.size,
        results_a: left.results,
        results_b: right.results,
      })
    }
  }
  rows.sort(
    (x, y) =>
      Number(y.shared_pages) - Number(x.shared_pages) ||
      Number(y.shared_sites) - Number(x.shared_sites) ||
      String(x.keyword_a).localeCompare(String(y.keyword_a)) ||
      String(x.keyword_b).localeCompare(String(y.keyword_b)),
  )
  const results = [...top.values()]
  return {
    ...serps,
    rows,
    compared: {
      results: results.reduce((sum, item) => sum + item.results, 0),
      withPage: results.reduce((sum, item) => sum + item.pages.size, 0),
      withSite: results.reduce((sum, item) => sum + item.sites.size, 0),
    },
  }
}

// How many referring domains link_gap reads per site, highest authority
// first, and how many competitors it compares.
const GAP_DOMAINS = 1000
const GAP_COMPETITORS = 5

// Hosts that link to every site because they list or redirect links, not
// because they chose to: URL shorteners, free app hosting used for login
// and link pages, and domain, coupon and site-stats directories. A heuristic
// by name; the note lists every host it left out.
const SHORTENERS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'ow.ly',
  'buff.ly',
  'is.gd',
  'cutt.ly',
  'rebrand.ly',
  'shorturl.at',
  'rb.gy',
  'lnkd.in',
]
const FREE_APP_HOSTS = ['web.app', 'firebaseapp.com', 'pages.dev']
const LINK_LIST_NAME =
  /(subdomain|whois|login|signin|coupon|promo|voucher|discount|sitelike|similarsite|sitesimilar|siteprice|sitevalue|siteworth|websiteworth|hypestat|statshow|websiteoutlook|siteinfo|domaininfo|domainstat|domaintools|ipaddress|dnslookup|linkdirectory|webdirectory|alternativeto-)/

export function isLinkList(domain: string): boolean {
  const within = (name: string) =>
    domain === name || domain.endsWith(`.${name}`)
  if (SHORTENERS.some(within)) return true
  if (FREE_APP_HOSTS.some((name) => domain.endsWith(`.${name}`))) return true
  return LINK_LIST_NAME.test(domain.replace(/[-.]/g, ''))
}

// Referring domains that link to two or more competitors and not to the
// target. Each site's list is its top GAP_DOMAINS referring domains by the
// provider's own authority (Ahrefs Domain Rating, DataForSEO rank). When a
// list is cut there, a domain below its lowest authority may be missing
// from it, so the gap stops at that authority and says so.
async function linkGap(
  provider: ResearchProvider,
  headers: Headers,
  input: ResearchInput,
): Promise<ResearchRows> {
  const target = bareTarget(input.target).replace(/^www\./, '')
  const competitors = [
    ...new Set(
      (input.competitors ?? []).map((site) =>
        bareTarget(site).replace(/^www\./, ''),
      ),
    ),
  ].filter((site) => site && site !== target)
  if (competitors.length < 2 || competitors.length > GAP_COMPETITORS) {
    throw new CommandError(
      'INVALID_INPUT',
      `link_gap needs a target and 2 to ${GAP_COMPETITORS} competitors.`,
    )
  }
  const score = provider === 'ahrefs' ? 'domain_rating' : 'rank'
  const sites = [target, ...competitors]
  const lists: Row[][] = []
  let cost = 0
  let partial = false
  for (const site of sites) {
    const got = await research(provider, headers, {
      ...input,
      action: 'backlinks',
      target: site,
      scope: 'domain',
      limit: GAP_DOMAINS,
    })
    cost += got.costUsd ?? 0
    partial ||= got.partial
    lists.push(got.rows)
  }
  const domainOf = (row: Row) =>
    String(row.domain ?? '')
      .toLowerCase()
      .replace(/^www\./, '')
  const authority = (row: Row) => Number(row[score] ?? 0)
  const floors = lists
    .filter((rows) => rows.length >= GAP_DOMAINS)
    .map((rows) => Math.min(...rows.map(authority)))
  const floor = floors.length ? Math.max(...floors) : null
  const own = new Set((lists[0] ?? []).map(domainOf))
  const found = new Map<string, { value: number; sites: string[] }>()
  competitors.forEach((site, index) => {
    for (const row of lists[index + 1] ?? []) {
      const domain = domainOf(row)
      if (!domain || own.has(domain) || domain === target) continue
      if (domain.endsWith(`.${target}`)) continue
      const entry = found.get(domain) ?? { value: 0, sites: [] }
      entry.value = Math.max(entry.value, authority(row))
      if (!entry.sites.includes(site)) entry.sites.push(site)
      found.set(domain, entry)
    }
  })
  const gap = [...found.entries()].filter(
    ([, entry]) =>
      entry.sites.length >= 2 && (floor === null || entry.value >= floor),
  )
  const linkLists = gap
    .map(([domain]) => domain)
    .filter(isLinkList)
    .sort((a, b) => a.localeCompare(b))
  const rows = gap
    .filter(([domain]) => !isLinkList(domain))
    .sort(
      ([a, left], [b, right]) =>
        right.value - left.value ||
        right.sites.length - left.sites.length ||
        a.localeCompare(b),
    )
    .map(([domain, entry]) => ({
      domain,
      [score]: entry.value,
      competitors_linking: entry.sites.length,
      links_to: entry.sites.join(' '),
    }))
  return {
    rows,
    costUsd:
      provider === 'dataforseo' ? Math.round(cost * 10_000) / 10_000 : null,
    partial,
    missed: [],
    noData: [],
    ...(floor !== null ? { floor: { field: score, value: floor } } : {}),
    ...(linkLists.length ? { leftOut: linkLists } : {}),
  }
}

function bareTarget(target: string): string {
  return target.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

// The scope a target is read in: the one asked for, else a bare domain is
// the site, a path that ends in / is a prefix and any other path one page.
export function researchScope(
  target: string,
  scope?: ResearchScope,
): ResearchScope {
  if (scope) return scope
  const bare = target.trim().replace(/^https?:\/\//, '')
  if (!/\/./.test(bare)) return 'domain'
  return bare.endsWith('/') ? 'prefix' : 'exact'
}

// The target's host, its path (ending in / for a prefix) and the page as an
// absolute URL, which DataForSEO needs to read one page: without the scheme
// it answers for the whole domain, or with no rows.
export function targetParts(input: ResearchInput) {
  const scope = researchScope(input.target, input.scope)
  const bare = input.target.trim().replace(/^https?:\/\//, '')
  const slash = bare.indexOf('/')
  const host = (slash === -1 ? bare : bare.slice(0, slash)).toLowerCase()
  let path = slash === -1 ? '/' : bare.slice(slash)
  if (scope === 'prefix' && !path.endsWith('/')) path += '/'
  const scheme = /^http:\/\//.test(input.target.trim()) ? 'http' : 'https'
  return {
    scope,
    host,
    path,
    page: `${scheme}://${host}${path}`,
    // Ahrefs reads a target in one of its own modes.
    ahrefs:
      scope === 'domain'
        ? { target: host, mode: 'subdomains' }
        : scope === 'prefix'
          ? { target: `${host}${path}`, mode: 'prefix' }
          : { target: `${host}${path}`, mode: 'exact' },
  }
}

// A DataForSEO "like" pattern for every URL under the prefix.
const likePrefix = (host: string, path: string) => `%${host}${path}%`
