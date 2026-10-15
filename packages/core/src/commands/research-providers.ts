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

export type ResearchInput = {
  action: ResearchAction
  keywords: string[]
  target: string
  country: string
  language: string
  limit: number
}

export const KEY_HEADERS: Record<ResearchProvider, string> = {
  dataforseo: 'X-DataForSEO-Login and X-DataForSEO-Password',
  ahrefs: 'X-Ahrefs-Key',
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
      `No ${provider} key. Hosted MCP: save it at https://seoskill.dev/account#keys or send the ${KEY_HEADERS[provider]} header. CLI and local MCP: run \`seo providers ${provider} connect\`.`,
    )
  }
  return values as string[]
}

async function call(
  provider: ResearchProvider,
  request: Request,
): Promise<Response> {
  const response = await fetch(request)
  if (response.ok) return response
  const text = (await response.text()).slice(0, 300)
  throw new CommandError(
    response.status === 401 || response.status === 403
      ? 'NO_KEY'
      : 'PROVIDER_ERROR',
    `${provider} answered ${response.status}. ${text}`,
  )
}

function requireInput(input: ResearchInput) {
  const needsKeywords =
    input.action === 'keyword_metrics' || input.action === 'serp'
  if (needsKeywords && input.keywords.length === 0) {
    throw new CommandError('INVALID_INPUT', `${input.action} needs keywords.`)
  }
  if (!needsKeywords && !input.target) {
    throw new CommandError(
      'INVALID_INPUT',
      `${input.action} needs a target domain or URL.`,
    )
  }
}

export async function research(
  provider: ResearchProvider,
  headers: Headers,
  input: ResearchInput,
): Promise<Row[]> {
  requireInput(input)
  const keys = need(headers, provider)
  if (provider === 'dataforseo') return dataForSeo(keys, input)
  return ahrefs(keys[0] ?? '', input)
}

// DataForSEO

function countryName(code: string): string {
  return (
    new Intl.DisplayNames('en', { type: 'region' }).of(code.toUpperCase()) ??
    'United States'
  )
}

async function dataForSeo(
  [login, password]: string[],
  input: ResearchInput,
): Promise<Row[]> {
  const market = {
    location_name: countryName(input.country),
    language_code: input.language,
  }
  const post = async (path: string, task: Record<string, unknown>) => {
    const response = await call(
      'dataforseo',
      new Request(`https://api.dataforseo.com/${path}`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${btoa(`${login}:${password}`)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify([{ ...market, ...task }]),
      }),
    )
    const data = (await response.json()) as {
      tasks?: {
        status_code: number
        status_message: string
        result?: { items?: Record<string, unknown>[] }[] | null
      }[]
    }
    const result = data.tasks?.[0]
    if (!result || result.status_code >= 40000) {
      throw new CommandError(
        'PROVIDER_ERROR',
        `dataforseo: ${result?.status_message ?? 'no task result'}`,
      )
    }
    return result.result?.[0]?.items ?? []
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
  if (input.action === 'ranked_keywords') {
    const items = await post('v3/dataforseo_labs/google/ranked_keywords/live', {
      target: bareTarget(input.target),
      limit: input.limit,
      order_by: ['ranked_serp_element.serp_item.etv,desc'],
    })
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
    const rows: Row[] = []
    for (const keyword of input.keywords.slice(0, 5)) {
      const items = await post('v3/serp/google/organic/live/advanced', {
        keyword,
        depth: Math.min(input.limit, 100),
      })
      for (const item of items) {
        if (item.type !== 'organic') continue
        rows.push({
          keyword,
          ...pick(item, {
            position: 'rank_absolute',
            url: 'url',
            domain: 'domain',
            title: 'title',
          }),
        })
      }
    }
    return rows
  }
  if (input.action === 'backlinks') {
    const items = await post('v3/backlinks/referring_domains/live', {
      target: bareTarget(input.target),
      limit: input.limit,
      order_by: ['rank,desc'],
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

// A target with a path is one page; otherwise it is a whole site.
function isPage(target: string): boolean {
  return /\/./.test(bareTarget(target))
}

function bareTarget(target: string): string {
  return target.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

// Ahrefs API v3

async function ahrefs(key: string, input: ResearchInput): Promise<Row[]> {
  const get = async (path: string, params: Record<string, string>) => {
    const url = new URL(`https://api.ahrefs.com/v3/${path}`)
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value)
    }
    const response = await call(
      'ahrefs',
      new Request(url, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      }),
    )
    return (await response.json()) as Record<string, Row[] | undefined>
  }
  const today = new Date().toISOString().slice(0, 10)
  if (input.action === 'keyword_metrics') {
    const data = await get('keywords-explorer/overview', {
      select: 'keyword,volume,difficulty,cpc,traffic_potential,intents',
      country: input.country,
      keywords: input.keywords.slice(0, 100).join(','),
    })
    return (data.keywords ?? []).map(flattenIntents)
  }
  if (input.action === 'ranked_keywords') {
    const data = await get('site-explorer/organic-keywords', {
      select:
        'keyword,best_position,best_position_url,volume,sum_traffic,keyword_difficulty,cpc',
      target: input.target,
      country: input.country,
      date: today,
      mode: isPage(input.target) ? 'exact' : 'subdomains',
      limit: String(input.limit),
      order_by: 'sum_traffic:desc',
    })
    return data.keywords ?? []
  }
  if (input.action === 'serp') {
    const rows: Row[] = []
    for (const keyword of input.keywords.slice(0, 5)) {
      const data = await get('serp-overview/serp-overview', {
        select: 'position,type,url,title,domain_rating,traffic,keywords',
        keyword,
        country: input.country,
        top_positions: String(Math.min(input.limit, 100)),
      })
      for (const row of data.positions ?? []) rows.push({ keyword, ...row })
    }
    return rows
  }
  if (input.action === 'backlinks') {
    const data = await get('site-explorer/refdomains', {
      select:
        'domain,domain_rating,links_to_target,dofollow_links,first_seen,last_seen',
      target: input.target,
      mode: isPage(input.target) ? 'exact' : 'subdomains',
      history: 'live',
      limit: String(input.limit),
      order_by: 'domain_rating:desc',
    })
    return data.refdomains ?? []
  }
  const data = await get('site-explorer/organic-competitors', {
    select:
      'competitor_domain,keywords_common,keywords_competitor,keywords_target,share,traffic,domain_rating',
    target: input.target,
    country: input.country,
    date: today,
    mode: 'subdomains',
    limit: String(input.limit),
    order_by: 'keywords_common:desc',
  })
  return data.competitors ?? []
}

function flattenIntents(row: Row): Row {
  const intents = (row as Record<string, unknown>).intents
  if (!intents || typeof intents !== 'object') return row
  const names = Object.entries(intents as Record<string, unknown>)
    .filter(([, value]) => value === true)
    .map(([name]) => name.replace(/^is_/, ''))
  return { ...row, intents: names.join(' ') || null }
}
