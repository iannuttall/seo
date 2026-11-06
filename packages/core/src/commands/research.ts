import { AI_ANSWER_QUESTIONS } from './ai-answers.js'
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
  type ResearchScope,
  research,
  researchScope,
  type SiteTotal,
} from './research-providers.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { CommandError, type CommandResult } from './types.js'

export type {
  ResearchAction,
  ResearchProvider,
  ResearchScope,
} from './research-providers.js'
export { RESEARCH_SCOPES } from './research-providers.js'

export const RESEARCH_ACTIONS = [
  'keyword_metrics',
  'ranked_keywords',
  'serp',
  'competitors',
  'backlinks',
  'link_gap',
  'ai_answers',
  'top_pages',
  'pages_by_backlinks',
] as const satisfies readonly ResearchAction[]

export const RESEARCH_PROVIDERS = [
  'dataforseo',
  'ahrefs',
] as const satisfies readonly ResearchProvider[]

export const RESEARCH_HELP = `provider is optional: without it the call uses the saved key, DataForSEO when both are saved. The target is a domain (the whole site), a path ending in / such as example.com/blog/ (every URL under it), or one page; scope overrides that. keyword_metrics (keywords: volume, difficulty, CPC), ranked_keywords (target: keywords a site, subfolder or page ranks for, with the provider's traffic total for the whole target), top_pages (target: the pages with the most estimated organic traffic), serp (keywords, up to 5: the ranking pages, each with its domain's authority: DataForSEO domain_rank 0 to 100, Ahrefs domain_rating), competitors (target: domains that share keywords), backlinks (target: referring domains), pages_by_backlinks (target: the pages with the most referring domains), link_gap (target and 2 to 5 competitors: referring domains that link to two or more competitors and not the target, highest authority first, from each site's top 1,000 referring domains; costs one backlinks call per site), ai_answers (DataForSEO only; target: the site. Without keywords it takes the site’s top ${AI_ANSWER_QUESTIONS} chat-style and long questions from Search Console’s AI-shaped queries itself. With up to ${AI_ANSWER_QUESTIONS} questions in keywords it asks those instead, and the target can be any domain, such as a competitor's. Each answer row also lists the other sites it cites, and the notes rank them. Answers come from DataForSEO's queue: answers not ready after about 40 seconds are returned as tasks, already paid for; call again with the same target and those tasks to read them at no cost. It asks ChatGPT search, Google AI Mode and Google AI Overviews each one and says whether the answer cites or mentions the site. DataForSEO’s queue prices are about $0.0072 a question across the three engines, so about $0.07 a run: tell the person before running it). Rows with a domain, and the target, get a free Ahrefs domain_rating column. Numbers are provider estimates, not Search Console data.`

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

type Row = Awaited<ReturnType<typeof research>>['rows'][number]

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

// The header each provider's key arrives under.
const KEY_HEADER: Record<ResearchProvider, string> = {
  dataforseo: 'x-dataforseo-login',
  ahrefs: 'x-ahrefs-key',
}

// The provider to use: the one asked for, else the one with a saved key,
// DataForSEO when both are saved. A provider asked for without its key, or
// no key at all, fails in the call with how to add the key.
function chooseProvider(
  asked: ResearchProvider | undefined,
  keys: Headers,
): ResearchProvider {
  return (
    asked ??
    RESEARCH_PROVIDERS.find((name) => keys.has(KEY_HEADER[name])) ??
    'dataforseo'
  )
}

// How each provider estimates organic traffic, so totals from two providers
// are never read as the same measure.
const TRAFFIC_MODEL: Record<ResearchProvider, string> = {
  dataforseo:
    "DataForSEO etv (estimated traffic volume): each keyword's monthly search volume times DataForSEO's click-through rate for the ranking position, summed over the keywords in DataForSEO's database for this country",
  ahrefs:
    "Ahrefs organic traffic (sum_traffic, org_traffic): Ahrefs' estimate of monthly organic visits from its own keyword database, volumes and click-through model, for this country",
}

const PROVIDERS_DIFFER =
  'Providers track different keywords and use different click models, so their traffic for the same site or page can differ tenfold or more. Compare a site with itself in one provider, not across providers.'

export type ResearchInput = {
  provider?: ResearchProvider
  scope?: ResearchScope
  action: ResearchAction
  keywords?: string[]
  target?: string
  competitors?: string[]
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
  if (input.action === 'ai_answers') {
    throw new CommandError('INVALID_INPUT', 'ai_answers runs on its own.')
  }
  const provider = chooseProvider(input.provider, keys)
  const language =
    provider === 'dataforseo' ? dataForSeoLanguage(country) : null
  const scoped = [
    'ranked_keywords',
    'top_pages',
    'backlinks',
    'pages_by_backlinks',
  ].includes(input.action)
  const scope = scoped && target ? researchScope(target, input.scope) : null
  const {
    rows: found,
    costUsd,
    partial,
    missed,
    noData,
    floor,
    leftOut,
    available,
    siteTotal,
    rankFailed,
  } = await research(provider, keys, {
    action: input.action,
    keywords: input.keywords ?? [],
    target,
    ...(scope ? { scope } : {}),
    competitors: input.competitors ?? [],
    country,
    limit: Math.min(1000, Math.max(100, offset + PAGE_SIZE)),
  })
  const { rows, note } =
    input.action === 'competitors'
      ? realCompetitors(found, target)
      : { rows: found, note: null }
  const unresolved = rows.filter(
    (row) => row.url === null && row.url_hint !== undefined,
  ).length
  const drKey = keys.get('x-ahrefs-key') ?? options.drKey
  const byDr = input.action === 'link_gap' && provider === 'dataforseo' && drKey
  const rated = byDr
    ? await sortedByDomainRating(rows, drKey)
    : await withDomainRating(rows, drKey, offset)
  const targetDr = target
    ? (await domainRatings([target], drKey)).get(bareDomain(target))
    : undefined
  const hasTargetDr = targetDr !== undefined && targetDr !== null
  return {
    text: rowsText({
      title: `${provider} ${input.action}${target ? ` for ${target}` : ''}${scope ? ` (${SCOPE_TEXT[scope]})` : ''}${LINK_ACTIONS.includes(input.action) ? ', all countries' : `, ${country}${language ? `, language ${language}` : ''}`}.`,
      rows: rated.rows,
      offset,
      limit: PAGE_SIZE,
      detail: input.detail ?? 'summary',
      notes: [
        `${provider} estimates, in the provider’s own units.`,
        ...(siteTotal ? [siteTotalNote(provider, siteTotal, rows.length)] : []),
        ...(available !== undefined && available > found.length
          ? [
              `Capped: ${provider} has ${available.toLocaleString('en-US')} rows for this; this read the first ${found.length.toLocaleString('en-US')} in its order.`,
            ]
          : []),
        ...(!found.length && scope ? [emptyNote(provider, input.action)] : []),
        ...(input.action === 'serp' && provider === 'dataforseo'
          ? [
              rankFailed
                ? 'domain_rank is missing: the DataForSEO rank call failed, so it is unknown, not zero.'
                : "domain_rank is DataForSEO's own authority score for the domain, 0 to 100. It is not Ahrefs' Domain Rating.",
            ]
          : []),
        ...(input.action === 'serp' && !drKey && provider === 'dataforseo'
          ? [
              'No domain_rating column: Domain Rating by Ahrefs needs an Ahrefs key (or the hosted MCP at https://seoskill.dev/mcp, which adds it).',
            ]
          : []),
        ...(costUsd !== null ? [`DataForSEO cost: $${costUsd}.`] : []),
        ...(partial
          ? [
              'Partial: DataForSEO could not fetch some pages of results, so rows may be missing.',
            ]
          : []),
        ...(missed.length
          ? [
              `Partial: ${provider} failed for ${missed.join(', ')}, so those keywords have no rows. Ask for them again.`,
            ]
          : []),
        ...(noData.length ? [noDataNote(provider, input.action, noData)] : []),
        ...(byDr
          ? [
              rows.length > GAP_RATED
                ? `Sorted by Domain Rating for the top ${GAP_RATED} rows by DataForSEO rank; the ${rows.length - GAP_RATED} rows after them follow by rank, with no Domain Rating.`
                : 'Sorted by Domain Rating, then DataForSEO rank.',
            ]
          : []),
        ...(leftOut?.length
          ? [
              `Left out ${leftOut.length} link lists, URL shorteners and directories that link to most sites (a guess from the host name): ${leftOut.join(', ')}.`,
            ]
          : []),
        ...(floor
          ? [
              `Cut at ${floor.field} ${floor.value}: at least one site has more than 1,000 referring domains, and only its top 1,000 were read, so domains below ${floor.field} ${floor.value} are left out rather than guessed.`,
            ]
          : []),
        ...(unresolved
          ? [unresolvedNote(provider, unresolved, rows.length)]
          : []),
        ...(note ? [note] : []),
        ...(hasTargetDr
          ? [`${bareDomain(target)} domain_rating: ${targetDr}.`]
          : []),
        ...(rated.added || hasTargetDr ? [DR_ATTRIBUTION] : []),
      ],
      more: options.call,
    }),
    data: {
      provider,
      action: input.action,
      target: target || null,
      scope,
      siteTotal: siteTotal
        ? { ...siteTotal, model: TRAFFIC_MODEL[provider] }
        : null,
      available: available ?? null,
      country,
      language,
      targetDomainRating: hasTargetDr ? targetDr : null,
      attribution: rated.added || hasTargetDr ? DR_ATTRIBUTION : null,
      leftOut: note,
      costUsd,
      partial,
      missedKeywords: missed,
      noDataKeywords: noData,
      ...(input.action === 'link_gap'
        ? {
            competitors: input.competitors ?? [],
            cutAt: floor ?? null,
            leftOut: leftOut ?? [],
          }
        : {}),
      total: rated.rows.length,
      offset,
      rows: rated.rows.slice(offset, offset + PAGE_SIZE),
    },
  }
}

// Link data has no country: the provider counts links from everywhere.
const LINK_ACTIONS: ResearchAction[] = [
  'backlinks',
  'pages_by_backlinks',
  'link_gap',
]

const SCOPE_TEXT: Record<ResearchScope, string> = {
  domain: 'the whole site with its subdomains',
  prefix: 'every URL under this path',
  exact: 'this page only',
}

// The provider's traffic total for the whole target, named in its own
// metric and model, beside the rows.
function siteTotalNote(
  provider: ResearchProvider,
  total: SiteTotal,
  shown: number,
): string {
  const keywords =
    total.keywords !== null
      ? ` from ${total.keywords.toLocaleString('en-US')} keywords`
      : ''
  return `Total for the whole target: ${total.metric} ${total.traffic.toLocaleString('en-US')} a month${keywords} (the rows below are ${shown.toLocaleString('en-US')} of them). Model: ${TRAFFIC_MODEL[provider]}. ${PROVIDERS_DIFFER}`
}

// An empty list for a site, subfolder or page: the provider has no rows for
// it, which is not the same as no traffic or no links.
function emptyNote(provider: ResearchProvider, action: ResearchAction): string {
  const what =
    action === 'backlinks' || action === 'pages_by_backlinks'
      ? 'links'
      : 'rankings'
  return `No rows: ${provider} has no ${what} for this target in its database. That does not show the target has none; check the target and scope, or ask the other provider.`
}

// Why some keywords have no rows: the provider has no data for them, or
// Google showed no results, which is not the same as nobody ranking.
function noDataNote(
  provider: ResearchProvider,
  action: ResearchAction,
  keywords: string[],
): string {
  const list = keywords.join(', ')
  if (action === 'serp') {
    return `No results: ${provider} got an empty results page for ${list}${provider === 'dataforseo' ? ', twice' : ''}. Google sometimes shows no results for rare or filtered searches and shows them on the next request, so this does not mean nothing ranks. Ask again later${provider === 'dataforseo' ? ', or use provider ahrefs' : ''}.`
  }
  return `No data: ${provider} has no metrics for ${keywords.length} of the keywords asked for (${list}). Their volume is unknown, not zero.`
}

// Results whose page is unknown because the provider returned a Google
// redirect link instead of the page.
function unresolvedNote(
  provider: ResearchProvider,
  count: number,
  total: number,
): string {
  return `${count} of ${total} results have no exact page: ${provider} returned Google redirect links for them. Their domain and url_hint come from Google's breadcrumb, which is shortened.${provider === 'dataforseo' ? ' For exact pages, use provider ahrefs.' : ''}`
}

// How many link_gap rows get a Domain Rating to sort by when the gap comes
// from DataForSEO, whose own rank is a different scale.
const GAP_RATED = 200

// link_gap rows from DataForSEO: the top GAP_RATED by rank get a Domain
// Rating and are sorted by it, then by rank and domain; the rest keep their
// order by rank.
async function sortedByDomainRating(
  rows: Row[],
  key: string,
): Promise<{ rows: Row[]; added: boolean }> {
  const top = rows.slice(0, GAP_RATED)
  const ratings = await domainRatings(
    top.map((row) => String(row.domain ?? '')),
    key,
    GAP_RATED,
  )
  // domain_rating goes right after domain, as withDomainRating places it.
  const withDr = (row: Row, rated: boolean): Row => {
    const { domain = null, ...rest } = row
    return {
      domain,
      domain_rating: rated
        ? (ratings.get(bareDomain(String(domain ?? ''))) ?? null)
        : null,
      ...rest,
    }
  }
  const dr = (row: Row) => Number(row.domain_rating ?? -1)
  const sorted = top
    .map((row) => withDr(row, true))
    .sort(
      (a, b) =>
        dr(b) - dr(a) ||
        Number(b.rank ?? 0) - Number(a.rank ?? 0) ||
        String(a.domain).localeCompare(String(b.domain)),
    )
  return {
    rows: [
      ...sorted,
      ...rows.slice(GAP_RATED).map((row) => withDr(row, false)),
    ],
    added: true,
  }
}
