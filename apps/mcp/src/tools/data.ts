import { dateWindow, rowsText, runRows, table } from '@seo/core/commands'
import { z } from 'zod'
import {
  listAnalyticsProperties,
  listProperties,
  resolveProperty,
} from '../google.ts'
import {
  ANALYTICS_HEADERS,
  type AnalyticsProvider,
  landingPages,
} from '../providers/analytics.ts'
import {
  bareDomain,
  DR_ATTRIBUTION,
  domainRatings,
  withDomainRating,
} from '../providers/domain-rating.ts'
import {
  KEY_HEADERS,
  type ResearchProvider,
  research,
} from '../providers/research.ts'
import { deps } from './deps.ts'
import {
  DateWindow,
  Detail,
  defineTool,
  PAGE_SIZE,
  Site,
  ToolError,
} from './registry.ts'

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
      'Next: seo_report with a site.',
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

const searchConsoleRows = defineTool({
  name: 'seo_data',
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
    const site = await resolveProperty(context.google, input.site)
    const result = await runRows(
      {
        site,
        dimensions: input.dimensions,
        filters: input.filters,
        startDate: input.start_date,
        endDate: input.end_date,
        detail: input.detail,
        offset: input.offset,
      },
      deps(context.google),
    )
    return result.text
  },
})

const analyticsRows = defineTool({
  name: 'seo_data',
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
    const range = dateWindow(
      { startDate: input.start_date, endDate: input.end_date },
      28,
    )
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

const SOURCES = [
  'search_console',
  'google_analytics',
  'clicky',
  'fathom',
  'simple_analytics',
  'plausible',
] as const

export const seoData = defineTool({
  name: 'seo_data',
  title: 'Raw rows',
  description: `Raw rows for questions the report does not answer. search_console (default): rows for any dimensions and filters, each with the previous period and the change. The other sources: landing pages for visits from search, from Google Analytics (Google sign-in) or Clicky, Fathom, Simple Analytics or Plausible (key headers: ${Object.entries(
    ANALYTICS_HEADERS,
  )
    .filter(([provider]) => provider !== 'google')
    .map(([provider, header]) => `${provider} ${header}`)
    .join('; ')}); each keeps its own metric names.`,
  input: z.object({
    source: z.enum(SOURCES).default('search_console'),
    site: z
      .string()
      .min(1)
      .describe(
        'search_console: the property or site. google_analytics: numeric property id from seo_sites. clicky and fathom: site id. simple_analytics and plausible: the domain.',
      ),
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
      .default(['query'])
      .describe('search_console only.'),
    filters: z
      .array(Filter)
      .max(10)
      .default([])
      .describe('search_console only.'),
    ...DateWindow,
    ...Detail,
  }),
  async run(context, input) {
    if (input.source === 'search_console') {
      return searchConsoleRows.run(context, input)
    }
    const { dimensions: _d, filters: _f, source, ...rest } = input
    return analyticsRows.run(context, {
      ...rest,
      provider: source === 'google_analytics' ? 'google' : source,
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
    )}. Actions: keyword_metrics (keywords: volume, difficulty, CPC), ranked_keywords (target: keywords a domain or URL ranks for), serp (keywords, up to 5: the ranking pages), competitors (target: domains that share keywords), backlinks (target: referring domains). Rows with a domain, and the target, get a free Ahrefs domain_rating column. Numbers are provider estimates, not Search Console data.`,
  input: z.object({
    provider: z.enum(['dataforseo', 'ahrefs', 'semrush']),
    action: z.enum([
      'keyword_metrics',
      'ranked_keywords',
      'serp',
      'competitors',
      'backlinks',
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
    const drKey =
      context.headers.get('x-ahrefs-key') ?? context.env.AHREFS_DR_KEY
    const rated = await withDomainRating(rows, drKey)
    const targetDr = input.target
      ? (await domainRatings([input.target], drKey)).get(
          bareDomain(input.target),
        )
      : undefined
    const hasDr = rated.added || (targetDr !== undefined && targetDr !== null)
    return rowsText({
      title: `${input.provider} ${input.action}${input.target ? ` for ${input.target}` : ''}, ${input.country}.`,
      rows: rated.rows,
      offset: input.offset,
      limit: PAGE_SIZE,
      detail: input.detail,
      notes: [
        `${input.provider} estimates, in the provider’s own units.`,
        ...(targetDr !== undefined && targetDr !== null
          ? [`${bareDomain(input.target)} domain_rating: ${targetDr}.`]
          : []),
        ...(hasDr ? [DR_ATTRIBUTION] : []),
      ],
    })
  },
})
