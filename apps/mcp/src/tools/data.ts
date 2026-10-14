import { collapseFragmentPageRows } from '@seo/core/hosted'
import { z } from 'zod'
import {
  inspectUrl,
  listAnalyticsProperties,
  listProperties,
  resolveProperty,
  searchAnalytics,
} from '../google.ts'
import {
  ANALYTICS_HEADERS,
  type AnalyticsProvider,
  landingPages,
} from '../providers/analytics.ts'
import {
  KEY_HEADERS,
  type ResearchProvider,
  research,
} from '../providers/research.ts'
import { table } from './present.ts'
import {
  DateWindow,
  Detail,
  defineTool,
  PAGE_SIZE,
  Site,
  ToolError,
} from './registry.ts'
import { dateWindow, earlierRange, FACTS_ONLY } from './reports.ts'

type Row = Record<string, unknown>

// Most Search Console rows read per period: one Google request.
const ROWS = 25_000

function rowsText(input: {
  title: string
  rows: Row[]
  offset: number
  limit: number
  detail: 'summary' | 'rows' | 'full'
  notes?: string[]
  origin?: string | null
}): string {
  const total = input.rows.length
  if (input.detail === 'full') {
    return `${input.title}\n\n${JSON.stringify(input.rows.slice(input.offset, input.offset + input.limit))}`
  }
  const size =
    input.detail === 'summary' ? Math.min(input.limit, 25) : input.limit
  const page = input.rows.slice(input.offset, input.offset + size)
  const columns = [...new Set(page.flatMap((row) => Object.keys(row)))]
  const end = input.offset + page.length
  return [
    input.title,
    ...(input.notes ?? []),
    total === 0
      ? 'No rows.'
      : `Rows ${input.offset + 1} to ${end} of ${total}:\n${table(page, columns, input.origin ?? null)}`,
    end < total ? `More: call again with detail "rows", offset ${end}.` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const seoSites = defineTool({
  name: 'seo_sites',
  title: 'List sites',
  description:
    'Lists the Search Console properties and Google Analytics properties this Google sign-in can read, and which provider keys this connection sends. Call it first.',
  input: z.object({}),
  async run(context) {
    const [properties, analytics] = await Promise.all([
      listProperties(context.google),
      listAnalyticsProperties(context.google).catch((error) =>
        error instanceof ToolError ? null : Promise.reject(error),
      ),
    ])
    const keys = [
      ['dataforseo', 'x-dataforseo-login'],
      ['ahrefs', 'x-ahrefs-key'],
      ['semrush', 'x-semrush-key'],
      ['clicky', 'x-clicky-sitekey'],
      ['fathom', 'x-fathom-key'],
      ['simple_analytics', 'x-simple-analytics-key'],
      ['plausible', 'x-plausible-key'],
    ]
      .filter(([, name]) => context.headers.get(name ?? ''))
      .map(([provider]) => provider)
    return [
      `Search Console properties (${properties.length}):`,
      properties.length
        ? table(properties, ['siteUrl', 'permissionLevel'], null)
        : 'None. This Google account has no Search Console access, so the reports cannot run.',
      analytics === null
        ? 'Google Analytics: not granted on this sign-in.'
        : `Google Analytics properties (${analytics.length}):\n${table(analytics, ['property', 'name', 'account'], null)}`,
      `Provider keys on this connection: ${keys.length ? keys.join(', ') : 'none'}.`,
      'Next: seo_report for a report, seo_search_console for raw rows.',
    ].join('\n\n')
  },
})

const Filter = z.object({
  dimension: z.enum(['query', 'page', 'country', 'device', 'searchAppearance']),
  operator: z
    .enum([
      'contains',
      'equals',
      'notContains',
      'notEquals',
      'includingRegex',
      'excludingRegex',
    ])
    .default('contains'),
  expression: z.string().min(1),
})

export const seoSearchConsole = defineTool({
  name: 'seo_search_console',
  title: 'Read Search Console rows',
  description:
    'Search Console rows for any dimensions and filters, each with the same rows from the previous period and the change. Use it for questions the reports do not answer, such as one page’s queries.',
  input: z.object({
    site: Site,
    dimensions: z
      .array(
        z.enum([
          'query',
          'page',
          'date',
          'country',
          'device',
          'searchAppearance',
        ]),
      )
      .max(4)
      .default(['query']),
    filters: z.array(Filter).max(10).default([]),
    ...DateWindow,
    ...Detail,
  }),
  async run(context, input) {
    const property = await resolveProperty(context.google, input.site)
    const range = dateWindow(input, 28)
    const query = {
      dimensions: input.dimensions,
      type: 'web' as const,
      dimensionFilterGroups: input.filters.length
        ? [{ groupType: 'and' as const, filters: input.filters }]
        : undefined,
    }
    const current = await searchAnalytics(
      context.google,
      property,
      { ...query, ...range },
      ROWS,
    )
    const pageAt = input.dimensions.indexOf('page')
    const notes: string[] = []
    // Page URLs with #fragments are one page; their rows merge.
    const merge = (found: typeof current) => {
      if (pageAt < 0) return found.rows
      const collapsed = collapseFragmentPageRows(found.rows, {
        pageKeyIndex: pageAt,
      })
      return collapsed.rows
    }
    current.rows = merge(current)
    const name = (keys: string[]) => keys.join('\u0000')
    let rows: Row[] = current.rows.map((row) => ({
      ...Object.fromEntries(input.dimensions.map((d, i) => [d, row.keys[i]])),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    {
      const previous = earlierRange(range, 'previous-period')
      const before = await searchAnalytics(
        context.google,
        property,
        { ...query, ...previous },
        ROWS,
      )
      before.rows = merge(before)
      // Dates never match across periods, so a date row pairs with the date
      // the same number of days into the earlier period.
      const dateAt = input.dimensions.indexOf('date')
      const keyOf = (keys: string[], start: string) =>
        name(
          keys.map((key, index) =>
            index === dateAt
              ? String(
                  Math.round(
                    (Date.parse(key) - Date.parse(start)) / 86_400_000,
                  ),
                )
              : key,
          ),
        )
      const earlier = new Map(
        before.rows.map((row) => [keyOf(row.keys, previous.startDate), row]),
      )
      const seen = new Set<string>()
      rows = current.rows.map((row, index) => {
        const key = keyOf(row.keys, range.startDate)
        seen.add(key)
        const old = earlier.get(key)
        return {
          ...rows[index],
          ...(dateAt >= 0 ? { previous_date: old?.keys[dateAt] ?? null } : {}),
          previous_clicks: old?.clicks ?? 0,
          clicks_change: row.clicks - (old?.clicks ?? 0),
          previous_position: old?.position ?? null,
        }
      })
      for (const old of before.rows) {
        if (seen.has(keyOf(old.keys, previous.startDate))) continue
        if (dateAt >= 0) continue
        rows.push({
          ...Object.fromEntries(
            input.dimensions.map((d, i) => [d, old.keys[i]]),
          ),
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: null,
          previous_clicks: old.clicks,
          clicks_change: -old.clicks,
          previous_position: old.position,
        })
      }
      notes.push(
        `Compared with ${previous.startDate} to ${previous.endDate}${before.truncated ? ' (earlier period hit the row limit)' : ''}. 0 clicks with no position means the row had no impressions in the current period.`,
      )
    }
    const dateDim = input.dimensions.includes('date')
    const sortKey = dateDim ? 'date' : 'clicks'
    rows.sort((a, b) => {
      if (sortKey === 'date')
        return String(a.date).localeCompare(String(b.date))
      const x = Number(a[sortKey] ?? 0)
      const y = Number(b[sortKey] ?? 0)
      return y - x
    })
    // Rows split only by date, device, country or appearance add up to the
    // property totals; query and page rows do not.
    if (
      !input.dimensions.includes('query') &&
      !input.dimensions.includes('page')
    ) {
      const sum = (key: string) =>
        rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
      notes.unshift(
        `Totals: clicks ${sum('clicks')}, impressions ${sum('impressions')}${`; previous period clicks ${sum('previous_clicks')}`}.`,
      )
    }
    if (pageAt >= 0) {
      notes.push('Page URLs with #fragments are merged into their page.')
    }
    if (current.truncated) {
      notes.push(
        `Search Console has more than ${ROWS} rows; add a filter to narrow it.`,
      )
    }
    notes.push(
      'Search Console hides some rare queries for privacy, so query rows do not add up to the site totals.',
    )
    return `${rowsText({
      title: `Search Console ${property}, ${range.startDate} to ${range.endDate}, web, by ${input.dimensions.join(' and ')}.`,
      rows,
      offset: input.offset,
      limit: PAGE_SIZE,
      detail: input.detail,
      notes,
      origin: property.startsWith('sc-domain:')
        ? `https://${property.slice('sc-domain:'.length)}`
        : property.replace(/\/$/, ''),
    })}\n\n${FACTS_ONLY}`
  },
})

export const seoInspect = defineTool({
  name: 'seo_inspect_url',
  title: 'Inspect URLs in Google',
  description:
    'Google’s index status for up to 10 URLs from the URL Inspection API: verdict, coverage, last crawl, canonicals and robots. Google allows about 2,000 inspections a day per property.',
  input: z.object({
    site: Site,
    urls: z.array(z.url()).min(1).max(10),
  }),
  async run(context, input) {
    const property = await resolveProperty(context.google, input.site)
    const rows: Row[] = []
    for (const url of input.urls) {
      const result = (await inspectUrl(context.google, property, url)) as {
        indexStatusResult?: Record<string, unknown>
      } | null
      const status = result?.indexStatusResult ?? {}
      rows.push({
        url,
        verdict: status.verdict ?? null,
        coverage: status.coverageState ?? null,
        indexing: status.indexingState ?? null,
        robots: status.robotsTxtState ?? null,
        fetch: status.pageFetchState ?? null,
        last_crawl: status.lastCrawlTime ?? null,
        google_canonical: status.googleCanonical ?? null,
        user_canonical: status.userCanonical ?? null,
      })
    }
    return `URL Inspection for ${property}:\n\n${table(rows, Object.keys(rows[0] ?? {}), null)}`
  },
})

export const seoAnalytics = defineTool({
  name: 'seo_analytics',
  title: 'Read landing page traffic',
  description: `Landing pages for visits from search, from Google Analytics (Google sign-in) or from Clicky, Fathom, Simple Analytics or Plausible (key headers: ${Object.entries(
    ANALYTICS_HEADERS,
  )
    .filter(([provider]) => provider !== 'google')
    .map(([provider, header]) => `${provider} ${header}`)
    .join('; ')}). Each provider keeps its own metric names.`,
  input: z.object({
    provider: z
      .enum(['google', 'clicky', 'fathom', 'simple_analytics', 'plausible'])
      .default('google'),
    site: z
      .string()
      .min(1)
      .describe(
        'google: numeric property id from seo_sites. clicky: site id. fathom: site id. simple_analytics and plausible: the domain.',
      ),
    ...DateWindow,
    ...Detail,
  }),
  async run(context, input) {
    const range = dateWindow(input, 28)
    const result = await landingPages(
      input.provider as AnalyticsProvider,
      context,
      {
        site: input.site,
        ...range,
        searchOnly: true,
        limit: Math.min(1000, input.offset + PAGE_SIZE),
      },
    )
    return rowsText({
      title: `${input.provider} search landing pages for ${input.site}, ${range.startDate} to ${range.endDate}.`,
      rows: result.rows,
      offset: input.offset,
      limit: PAGE_SIZE,
      detail: input.detail,
      notes: result.notes,
    })
  },
})

export const seoResearch = defineTool({
  name: 'seo_research',
  title: 'Keyword and competitor data',
  description: `Keyword and competitor data from the person’s own DataForSEO, Ahrefs or Semrush account, which costs them credits. Key headers: ${Object.entries(
    KEY_HEADERS,
  )
    .map(([provider, header]) => `${provider} ${header}`)
    .join(
      '; ',
    )}. Actions: keyword_metrics (keywords: volume, difficulty, CPC), ranked_keywords (target: keywords a domain or URL ranks for), serp (keywords, up to 5: the ranking pages), competitors (target: domains that share keywords). Numbers are provider estimates, not Search Console data.`,
  input: z.object({
    provider: z.enum(['dataforseo', 'ahrefs', 'semrush']),
    action: z.enum([
      'keyword_metrics',
      'ranked_keywords',
      'serp',
      'competitors',
    ]),
    keywords: z.array(z.string().min(1)).max(100).default([]),
    target: z.string().default('').describe('Domain or URL.'),
    country: z
      .string()
      .regex(/^[a-z]{2}$/)
      .default('us')
      .describe('Two-letter country code.'),
    ...Detail,
  }),
  async run(context, input) {
    const rows = await research(
      input.provider as ResearchProvider,
      context.headers,
      {
        action: input.action,
        keywords: input.keywords,
        target: input.target,
        country: input.country,
        language: 'en',
        limit: Math.min(1000, Math.max(100, input.offset + PAGE_SIZE)),
      },
    )
    return rowsText({
      title: `${input.provider} ${input.action}${input.target ? ` for ${input.target}` : ''}, ${input.country}.`,
      rows,
      offset: input.offset,
      limit: PAGE_SIZE,
      detail: input.detail,
      notes: [`${input.provider} estimates, in the provider’s own units.`],
    })
  },
})
