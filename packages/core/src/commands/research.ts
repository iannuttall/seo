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
  research,
} from './research-providers.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { CommandError, type CommandResult } from './types.js'

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
  'link_gap',
  'ai_answers',
] as const satisfies readonly ResearchAction[]

export const RESEARCH_PROVIDERS = [
  'dataforseo',
  'ahrefs',
] as const satisfies readonly ResearchProvider[]

export const RESEARCH_HELP = `keyword_metrics (keywords: volume, difficulty, CPC), ranked_keywords (target: keywords a domain or URL ranks for), serp (keywords, up to 5: the ranking pages), competitors (target: domains that share keywords), backlinks (target: referring domains), link_gap (target and 2 to 5 competitors: referring domains that link to two or more competitors and not the target, highest authority first, from each site's top 1,000 referring domains; costs one backlinks call per site), ai_answers (DataForSEO only; target: the site. Without keywords it takes the site’s top ${AI_ANSWER_QUESTIONS} chat-style and long questions from Search Console’s AI-shaped queries itself. With up to ${AI_ANSWER_QUESTIONS} questions in keywords it asks those instead, and the target can be any domain, such as a competitor's. Each answer row also lists the other sites it cites, and the notes rank them. Answers come from DataForSEO's queue: answers not ready after about 40 seconds are returned as tasks, already paid for; call again with the same target and those tasks to read them at no cost. It asks ChatGPT search, Google AI Mode and Google AI Overviews each one and says whether the answer cites or mentions the site. DataForSEO’s queue prices are about $0.0072 a question across the three engines, so about $0.07 a run: tell the person before running it). Rows with a domain, and the target, get a free Ahrefs domain_rating column. Numbers are provider estimates, not Search Console data.`

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

export type ResearchInput = {
  provider: ResearchProvider
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
  const language =
    input.provider === 'dataforseo' ? dataForSeoLanguage(country) : null
  if (input.action === 'ai_answers') {
    throw new CommandError('INVALID_INPUT', 'ai_answers runs on its own.')
  }
  const {
    rows: found,
    costUsd,
    partial,
    missed,
    noData,
    floor,
    leftOut,
  } = await research(input.provider, keys, {
    action: input.action,
    keywords: input.keywords ?? [],
    target,
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
  const byDr =
    input.action === 'link_gap' && input.provider === 'dataforseo' && drKey
  const rated = byDr
    ? await sortedByDomainRating(rows, drKey)
    : await withDomainRating(rows, drKey, offset)
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
        ...(costUsd !== null ? [`DataForSEO cost: $${costUsd}.`] : []),
        ...(partial
          ? [
              'Partial: DataForSEO could not fetch some pages of results, so rows may be missing.',
            ]
          : []),
        ...(missed.length
          ? [
              `Partial: ${input.provider} failed for ${missed.join(', ')}, so those keywords have no rows. Ask for them again.`,
            ]
          : []),
        ...(noData.length ? [noDataNote(input, noData)] : []),
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
        ...(unresolved ? [unresolvedNote(input, unresolved, rows.length)] : []),
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

// Why some keywords have no rows: the provider has no data for them, or
// Google showed no results, which is not the same as nobody ranking.
function noDataNote(input: ResearchInput, keywords: string[]): string {
  const list = keywords.join(', ')
  if (input.action === 'serp') {
    return `No results: ${input.provider} got an empty results page for ${list}${input.provider === 'dataforseo' ? ', twice' : ''}. Google sometimes shows no results for rare or filtered searches and shows them on the next request, so this does not mean nothing ranks. Ask again later${input.provider === 'dataforseo' ? ', or use provider ahrefs' : ''}.`
  }
  return `No data: ${input.provider} has no metrics for ${keywords.length} of the keywords asked for (${list}). Their volume is unknown, not zero.`
}

// Results whose page is unknown because the provider returned a Google
// redirect link instead of the page.
function unresolvedNote(
  input: ResearchInput,
  count: number,
  total: number,
): string {
  return `${count} of ${total} results have no exact page: ${input.provider} returned Google redirect links for them. Their domain and url_hint come from Google's breadcrumb, which is shortened.${input.provider === 'dataforseo' ? ' For exact pages, use provider ahrefs.' : ''}`
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
