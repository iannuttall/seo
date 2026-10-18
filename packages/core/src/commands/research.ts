import {
  bareDomain,
  DR_ATTRIBUTION,
  domainRatings,
  withDomainRating,
} from './domain-rating.js'
import type { Detail } from './present.js'
import {
  dataForSeoLanguage,
  type ResearchAction,
  type ResearchProvider,
  research,
} from './research-providers.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import type { CommandResult } from './types.js'

export type {
  ResearchAction,
  ResearchProvider,
} from './research-providers.js'

export const RESEARCH_ACTIONS = [
  'keyword_metrics',
  'ranked_keywords',
  'serp',
  'competitors',
  'backlinks',
] as const satisfies readonly ResearchAction[]

export const RESEARCH_PROVIDERS = [
  'dataforseo',
  'ahrefs',
] as const satisfies readonly ResearchProvider[]

export const RESEARCH_HELP =
  'keyword_metrics (keywords: volume, difficulty, CPC), ranked_keywords (target: keywords a domain or URL ranks for), serp (keywords, up to 5: the ranking pages), competitors (target: domains that share keywords), backlinks (target: referring domains). Rows with a domain, and the target, get a free Ahrefs domain_rating column. Numbers are provider estimates, not Search Console data.'

// Platforms that share keywords with almost every site. Competitor lists
// leave them out, with the target itself, and say how many rows went.
export const GENERIC_PLATFORMS = [
  'youtube.com',
  'facebook.com',
  'wikipedia.org',
  'reddit.com',
  'quora.com',
  'instagram.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'pinterest.com',
  'tiktok.com',
  'amazon.com',
]

const within = (domain: string, parent: string) =>
  domain === parent || domain.endsWith(`.${parent}`)

type Row = Awaited<ReturnType<typeof research>>[number]

// Competitor rows without the target (or its subdomains) and generic
// platforms. The note says how many rows went, which ones and why.
function realCompetitors(
  rows: Row[],
  target: string,
): { rows: Row[]; note: string | null } {
  const self = bareDomain(target)
  const domainOf = (row: Row) =>
    bareDomain(String(row.domain ?? row.competitor_domain ?? ''))
  const isSelf = (domain: string) => self !== '' && within(domain, self)
  const isPlatform = (domain: string) =>
    GENERIC_PLATFORMS.some((name) => within(domain, name))
  const domains = rows.map(domainOf)
  const own = domains.filter(isSelf)
  const platforms = domains.filter((d) => !isSelf(d) && isPlatform(d))
  const gone = own.length + platforms.length
  if (!gone) return { rows, note: null }
  const reasons = [
    own.length ? `the target itself (${own.join(', ')})` : '',
    platforms.length
      ? `generic platforms that share keywords with most sites (${platforms.join(', ')})`
      : '',
  ].filter(Boolean)
  return {
    rows: rows.filter((row) => {
      const domain = domainOf(row)
      return !isSelf(domain) && !isPlatform(domain)
    }),
    note: `Left out ${gone} ${gone === 1 ? 'row' : 'rows'}: ${reasons.join(' and ')}. The fixed platform list is ${GENERIC_PLATFORMS.join(', ')}.`,
  }
}

export type ResearchInput = {
  provider: ResearchProvider
  action: ResearchAction
  keywords?: string[]
  target?: string
  country?: string
  detail?: Detail
  offset?: number
}

// Provider data for one action. keys holds header-style key names such as
// x-ahrefs-key; drKey is the Ahrefs key for the free Domain Rating column.
export async function runResearch(
  input: ResearchInput,
  keys: Headers,
  options: {
    drKey?: string | null
    call: (offset: number) => string
  },
): Promise<CommandResult> {
  const country = input.country ?? 'us'
  const target = input.target ?? ''
  const offset = input.offset ?? 0
  const language =
    input.provider === 'dataforseo' ? dataForSeoLanguage(country) : null
  const found = await research(input.provider, keys, {
    action: input.action,
    keywords: input.keywords ?? [],
    target,
    country,
    limit: Math.min(1000, Math.max(100, offset + PAGE_SIZE)),
  })
  const { rows, note } =
    input.action === 'competitors'
      ? realCompetitors(found, target)
      : { rows: found, note: null }
  const drKey = keys.get('x-ahrefs-key') ?? options.drKey
  const rated = await withDomainRating(rows, drKey)
  const targetDr = target
    ? (await domainRatings([target], drKey)).get(bareDomain(target))
    : undefined
  const hasTargetDr = targetDr !== undefined && targetDr !== null
  return {
    text: rowsText({
      title: `${input.provider} ${input.action}${target ? ` for ${target}` : ''}, ${country}${language ? `, language ${language}` : ''}.`,
      rows: rated.rows,
      offset,
      limit: PAGE_SIZE,
      detail: input.detail ?? 'summary',
      notes: [
        `${input.provider} estimates, in the provider’s own units.`,
        ...(note ? [note] : []),
        ...(hasTargetDr
          ? [`${bareDomain(target)} domain_rating: ${targetDr}.`]
          : []),
        ...(rated.added || hasTargetDr ? [DR_ATTRIBUTION] : []),
      ],
      more: options.call,
    }),
    data: {
      provider: input.provider,
      action: input.action,
      target: target || null,
      country,
      language,
      targetDomainRating: hasTargetDr ? targetDr : null,
      attribution: rated.added || hasTargetDr ? DR_ATTRIBUTION : null,
      leftOut: note,
      total: rated.rows.length,
      offset,
      rows: rated.rows.slice(offset, offset + PAGE_SIZE),
    },
  }
}
