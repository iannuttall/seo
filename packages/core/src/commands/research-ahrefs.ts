// Keyword, page, SERP, competitor and backlink rows from the person's own
// Ahrefs API v3 key, with Ahrefs' own metric names.

import { readJson } from '../http/read-json.js'
import {
  call,
  eachKeyword,
  IDEA_SEEDS,
  type ResearchInput,
  type SiteTotal,
  serpDepth,
  serpKeywords,
  targetParts,
} from './research-providers.js'

type Row = Record<string, string | number | boolean | null>

export async function ahrefs(
  key: string,
  input: ResearchInput,
  missed: string[],
  totals: { siteTotal?: SiteTotal },
): Promise<Row[]> {
  const where = targetParts(input).ahrefs
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
    return readJson<Record<string, Row[] | undefined>>(response, 'Ahrefs')
  }
  const today = new Date().toISOString().slice(0, 10)
  if (input.action === 'keyword_ideas') {
    return eachKeyword(
      input.keywords.slice(0, IDEA_SEEDS),
      missed,
      async (seed) => {
        const data = await get('keywords-explorer/matching-terms', {
          select: 'keyword,volume,difficulty,cpc,traffic_potential,intents',
          country: input.country,
          keywords: seed,
          limit: String(input.limit),
          order_by: 'volume:desc',
        })
        return (data.keywords ?? []).map((row) => ({
          seed,
          ...flattenIntents(row),
        }))
      },
    )
  }
  if (input.action === 'keyword_metrics') {
    const data = await get('keywords-explorer/overview', {
      select: 'keyword,volume,difficulty,cpc,traffic_potential,intents',
      country: input.country,
      keywords: input.keywords.slice(0, 100).join(','),
    })
    return (data.keywords ?? []).map(flattenIntents)
  }
  if (input.action === 'ranked_keywords') {
    const [data, metrics] = await Promise.all([
      get('site-explorer/organic-keywords', {
        select:
          'keyword,best_position,best_position_url,volume,sum_traffic,keyword_difficulty,cpc',
        ...where,
        country: input.country,
        date: today,
        limit: String(input.limit),
        order_by: 'sum_traffic:desc',
      }),
      // The total for the whole target, which the rows alone cannot give.
      get('site-explorer/metrics', {
        ...where,
        country: input.country,
        date: today,
      }),
    ])
    const total = (metrics as { metrics?: Row }).metrics
    if (typeof total?.org_traffic === 'number') {
      totals.siteTotal = {
        metric: 'org_traffic',
        traffic: total.org_traffic,
        keywords:
          typeof total.org_keywords === 'number' ? total.org_keywords : null,
      }
    }
    return data.keywords ?? []
  }
  if (input.action === 'top_pages') {
    const data = await get('site-explorer/top-pages', {
      select:
        'url,sum_traffic,keywords,top_keyword,top_keyword_volume,top_keyword_best_position,referring_domains',
      ...where,
      country: input.country,
      date: today,
      limit: String(input.limit),
      order_by: 'sum_traffic:desc',
    })
    return data.pages ?? []
  }
  if (input.action === 'pages_by_backlinks') {
    const data = await get('site-explorer/pages-by-backlinks', {
      select:
        'url_to,title_target,http_code_target,refdomains_target,links_to_target,dofollow_to_target,first_seen_link',
      ...where,
      history: 'live',
      limit: String(input.limit),
      order_by: 'refdomains_target:desc',
    })
    return data.pages ?? []
  }
  if (input.action === 'serp') {
    return eachKeyword(
      input.keywords.slice(0, serpKeywords(input)),
      missed,
      async (keyword) => {
        const data = await get('serp-overview/serp-overview', {
          select: 'position,type,url,title,domain_rating,traffic,keywords',
          keyword,
          country: input.country,
          top_positions: String(serpDepth(input)),
        })
        return (data.positions ?? []).map((row) => ({ keyword, ...row }))
      },
    )
  }
  if (input.action === 'backlinks') {
    const data = await get('site-explorer/refdomains', {
      select:
        'domain,domain_rating,links_to_target,dofollow_links,first_seen,last_seen',
      ...where,
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
