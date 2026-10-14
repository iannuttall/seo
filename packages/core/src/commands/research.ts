import {
  bareDomain,
  DR_ATTRIBUTION,
  domainRatings,
  withDomainRating,
} from './domain-rating.js'
import type { Detail } from './present.js'
import {
  type ResearchAction,
  type ResearchProvider,
  research,
} from './research-providers.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import type { CommandResult } from './types.js'

export {
  KEY_HEADERS,
  type ResearchAction,
  type ResearchProvider,
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
  const rows = await research(input.provider, keys, {
    action: input.action,
    keywords: input.keywords ?? [],
    target,
    country,
    language: 'en',
    limit: Math.min(1000, Math.max(100, offset + PAGE_SIZE)),
  })
  const drKey = keys.get('x-ahrefs-key') ?? options.drKey
  const rated = await withDomainRating(rows, drKey)
  const targetDr = target
    ? (await domainRatings([target], drKey)).get(bareDomain(target))
    : undefined
  const hasTargetDr = targetDr !== undefined && targetDr !== null
  return {
    text: rowsText({
      title: `${input.provider} ${input.action}${target ? ` for ${target}` : ''}, ${country}.`,
      rows: rated.rows,
      offset,
      limit: PAGE_SIZE,
      detail: input.detail ?? 'summary',
      notes: [
        `${input.provider} estimates, in the provider’s own units.`,
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
      targetDomainRating: hasTargetDr ? targetDr : null,
      attribution: rated.added || hasTargetDr ? DR_ATTRIBUTION : null,
      total: rated.rows.length,
      offset,
      rows: rated.rows.slice(offset, offset + PAGE_SIZE),
    },
  }
}
