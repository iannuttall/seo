import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { AI_ANSWER_QUESTIONS } from './ai-answers.js'
import {
  bareDomain,
  DR_ATTRIBUTION,
  domainRatings,
  withDomainRating,
} from './domain-rating.js'
import { INDEX_CHECK_PHRASES, runIndexCheck } from './index-check.js'
import type { Detail } from './present.js'
import {
  type ResearchStore,
  readResearch,
  researchKey,
  saveResearch,
  workersResearchStore,
} from './research-cache.js'
import {
  type InstalledSerp,
  installedSerpResearch,
} from './research-installed.js'
import { runMentions } from './research-mentions.js'
import {
  type AiOverview,
  dataForSeoLanguage,
  type PeopleAlsoAsk,
  type ResearchAction,
  type ResearchDevice,
  type ResearchProvider,
  type ResearchScope,
  research,
  researchScope,
  SERP_DEPTH,
  type SiteTotal,
} from './research-providers.js'
import {
  ZERO_VOLUME_KEYWORDS,
  zeroVolumeCandidates,
  zeroVolumeRows,
} from './research-zero-volume.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { CommandError, type CommandResult } from './types.js'

export type { InstalledSerp } from './research-installed.js'
export type {
  ResearchAction,
  ResearchDevice,
  ResearchProvider,
  ResearchScope,
} from './research-providers.js'
export {
  RESEARCH_DEVICES,
  RESEARCH_SCOPES,
  SERP_DEPTH,
} from './research-providers.js'

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
  'keyword_ideas',
  'serp_overlap',
  'index_check',
  'mentions',
] as const satisfies readonly ResearchAction[]

export const RESEARCH_PROVIDERS = [
  'dataforseo',
  'ahrefs',
] as const satisfies readonly ResearchProvider[]

export const RESEARCH_HELP = `provider is optional: without it the call uses the saved key, DataForSEO when both are saved. In the CLI and the local MCP server, serp can also use a provider package installed on this machine that supplies live search results: pass its id as provider. The target is a domain (the whole site), a path ending in / such as example.com/blog/ (every URL under it), or one page; scope overrides that. keyword_metrics (keywords: volume, difficulty, CPC; or target a Search Console site with no keywords: its top queries by impressions that the provider rates at zero or does not know, zero-volume keywords, in one call of up to 700 queries, about $0.10 on DataForSEO or 100 on Ahrefs), keyword_ideas (up to 5 seed keywords: searches that contain each seed, by volume), ranked_keywords (target: keywords a site, subfolder or page ranks for, with the provider's traffic total for the whole target), top_pages (target: the pages with the most estimated organic traffic), serp (keywords, up to 5: the ranking pages with their organic position beside DataForSEO's rank_absolute, which also counts AI Overviews and other blocks, plus the AI Overview's sources and the People Also Ask questions; device desktop or mobile, DataForSEO only; each with its domain's authority: DataForSEO domain_rank 0 to 100, Ahrefs domain_rating; depth sets results per keyword, default ${SERP_DEPTH}; rows run position by position across the keywords), index_check (DataForSEO only; target: one page URL; keywords: up to ${INDEX_CHECK_PHRASES} exact phrases from the page, default its H1 or title. Searches Google for site:<url> and each "<phrase>" on desktop and mobile, retries failed searches, treats Google's fallback to unrelated sites as no match, and says indexed, not found or unknown with each search's evidence; about $0.01 a page), serp_overlap (2 to 10 keywords: for each pair, how many of their top 10 pages and sites are the same, to decide one page or several; results behind a Google redirect link are compared by their breadcrumb's site and path, and counted, not compared, when it is shortened), mentions (DataForSEO only; target: a domain; brand: up to 3 brand names. Pages on other sites that name the domain or brand, one per site, from DataForSEO's content index, and whether each site already links to the target in DataForSEO's backlink index; sites with no link come first, to ask for the link. About $0.03 a term plus one backlinks call, under $0.10 a run), competitors (target: domains that share keywords), backlinks (target: referring domains), pages_by_backlinks (target: the pages with the most referring domains), link_gap (target and 2 to 5 competitors: referring domains that link to two or more competitors and not the target, highest authority first, from each site's top 1,000 referring domains; costs one backlinks call per site), ai_answers (DataForSEO only; target: the site. Without keywords it takes the site’s top ${AI_ANSWER_QUESTIONS} chat-style and long questions from Search Console’s AI-shaped queries itself. With up to ${AI_ANSWER_QUESTIONS} questions in keywords it asks those instead, and the target can be any domain, such as a competitor's. Each answer row also lists the other sites it cites, and the notes rank them. Answers come from DataForSEO's queue: answers not ready after about 40 seconds are returned as tasks, already paid for; call again with the same target and those tasks to read them at no cost. It asks ChatGPT search, Google AI Mode and Google AI Overviews each one and says whether the answer cites or mentions the site. Each ChatGPT row lists the web searches ChatGPT ran (fan-out), and the notes rank the most common; to see them for any questions, pass the questions in keywords with any target. Web search is not forced: forcing costs the same but makes ChatGPT search questions it answers from memory, so "none returned" means it answered without searching. AI Mode and AI Overviews do not report their searches. DataForSEO’s queue prices are about $0.0072 a question across the three engines, so about $0.07 a run: tell the person before running it). Rows with a domain, and the target, get a free Ahrefs domain_rating column. Numbers are provider estimates, not Search Console data.`

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
function chooseProvider(asked: string | undefined, keys: Headers): string {
  return (
    asked ??
    RESEARCH_PROVIDERS.find((name) => keys.has(KEY_HEADER[name])) ??
    'dataforseo'
  )
}

// Actions whose rows carry a search volume, and how each provider gets it.
const VOLUME_ACTIONS: ResearchAction[] = ['keyword_metrics', 'keyword_ideas']
const VOLUME_MODEL: Record<ResearchProvider, string> = {
  dataforseo:
    "DataForSEO search_volume is Google Ads' average monthly searches over the last 12 months, rounded into Google's bands.",
  ahrefs:
    "Ahrefs volume is Ahrefs' own estimate of average monthly searches, from clickstream data and its keyword database.",
}
const VOLUMES_DIFFER =
  'The two providers can differ two to eight times for the same keyword, so compare keywords within one provider. A null volume is unknown, not zero.'

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
  depth?: number
  // serp only: desktop (default) or mobile results.
  device?: ResearchDevice
  // serp from DataForSEO only: People Also Ask questions to open for more
  // questions, 0 (default) to 4.
  peopleAlsoAskDepth?: number
  // dataforseo, ahrefs, or for serp the id of an installed provider package.
  provider?: string
  scope?: ResearchScope
  action: ResearchAction
  keywords?: string[]
  target?: string
  competitors?: string[]
  // mentions only: brand names to search for beside the domain.
  brand?: string[]
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
    // Where results are kept for a day; the Workers cache when unset.
    store?: ResearchStore | null
    // serp from installed provider packages, on the surfaces that load them.
    installedSerp?: InstalledSerp
    // keyword_metrics with a site and no keywords reads the site's queries.
    searchAnalytics?: SearchAnalyticsQuery
  },
): Promise<CommandResult> {
  const country = input.country ?? 'us'
  const target = input.target ?? ''
  const offset = input.offset ?? 0
  if (input.action === 'ai_answers') {
    throw new CommandError('INVALID_INPUT', 'ai_answers runs on its own.')
  }
  if (input.action === 'mentions') {
    if (input.provider && input.provider !== 'dataforseo') {
      throw new CommandError('INVALID_INPUT', 'mentions uses dataforseo.')
    }
    return runMentions(
      {
        target,
        brand: input.brand,
        offset,
        detail: input.detail,
      },
      keys,
    )
  }
  const provider = chooseProvider(input.provider, keys)
  if (
    input.action === 'keyword_metrics' &&
    !input.keywords?.length &&
    target &&
    options.searchAnalytics
  ) {
    return zeroVolume(input, keys, provider, options.searchAnalytics, options)
  }
  const builtIn = (RESEARCH_PROVIDERS as readonly string[]).includes(provider)
    ? (provider as ResearchProvider)
    : null
  if (!builtIn && input.action !== 'serp') {
    throw new CommandError(
      'INVALID_INPUT',
      `An installed provider answers serp only; ${input.action} needs a built-in provider.`,
    )
  }
  if (input.action === 'index_check') {
    if (provider === 'ahrefs') {
      throw new CommandError(
        'INVALID_INPUT',
        'index_check uses DataForSEO: it runs live Google searches, which Ahrefs does not offer.',
      )
    }
    return runIndexCheck(
      { url: target, phrases: input.keywords, country },
      keys,
    )
  }
  if (input.device && input.action !== 'serp') {
    throw new CommandError(
      'INVALID_INPUT',
      'device works with serp only. ranked_keywords and the other database actions have one ranking per keyword, from desktop results.',
    )
  }
  if (input.device === 'mobile' && provider === 'ahrefs') {
    throw new CommandError(
      'INVALID_INPUT',
      "Ahrefs' SERP overview has no device choice, so it cannot show mobile results. Use provider dataforseo for device mobile.",
    )
  }
  const device = input.action === 'serp' ? (input.device ?? 'desktop') : null
  const language =
    provider === 'dataforseo' ? dataForSeoLanguage(country) : null
  const scoped = [
    'ranked_keywords',
    'top_pages',
    'backlinks',
    'pages_by_backlinks',
  ].includes(input.action)
  const scope = scoped && target ? researchScope(target, input.scope) : null
  const limit = Math.min(1000, Math.max(100, offset + PAGE_SIZE))
  const request = {
    action: input.action,
    keywords: input.keywords ?? [],
    target,
    ...(scope ? { scope } : {}),
    competitors: input.competitors ?? [],
    country,
    ...(input.action === 'serp' ? { depth: input.depth ?? SERP_DEPTH } : {}),
    // Desktop keeps the earlier cache key, so saved desktop results still
    // read back.
    ...(device === 'mobile' ? { device } : {}),
    // Unset keeps the earlier cache key too.
    ...(input.action === 'serp' && input.peopleAlsoAskDepth
      ? { peopleAlsoAskDepth: input.peopleAlsoAskDepth }
      : {}),
  }
  const store = options.store ?? workersResearchStore()
  // A live results page does not depend on whose package account asked, so
  // an installed provider's results are kept by provider and request.
  const credential = builtIn ? keys.get(KEY_HEADER[builtIn]) : null
  const key = await researchKey([provider, credential, request])
  const saved = await readResearch(store, key, limit)
  const result =
    saved?.result ??
    (builtIn
      ? await research(builtIn, keys, { ...request, limit })
      : await installedSerpResearch(
          provider,
          { ...request, limit },
          options.installedSerp,
        ))
  if (!saved) {
    await saveResearch(store, key, {
      limit,
      savedAt: new Date().toISOString(),
      result,
    })
  }
  const {
    rows: fetched,
    costUsd: paid,
    partial,
    missed,
    noData,
    floor,
    leftOut,
    available,
    siteTotal,
    rankFailed,
    compared,
    aiOverviews,
    peopleAlsoAsk,
    warnings,
  } = result
  // A saved result costs nothing now; its first cost is in the note.
  const costUsd = saved ? 0 : paid
  // Several SERPs read best side by side: every keyword's first result,
  // then every second result, so each page shows all the keywords.
  const order = new Map(request.keywords.map((word, index) => [word, index]))
  const found =
    input.action === 'serp' && request.keywords.length > 1
      ? [...fetched].sort(
          (a, b) =>
            // A featured snippet has no organic position and comes first.
            Number(a.position ?? 0) - Number(b.position ?? 0) ||
            (order.get(String(a.keyword)) ?? 0) -
              (order.get(String(b.keyword)) ?? 0),
        )
      : fetched
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
  // full means every row read; summary and rows go a page at a time.
  const detail = input.detail ?? 'summary'
  const size = detail === 'full' ? Math.max(rated.rows.length, 1) : PAGE_SIZE
  const shown = rated.rows.slice(offset, offset + size)
  const next =
    offset + shown.length < rated.rows.length ? offset + shown.length : null
  const perKeyword =
    input.action === 'serp'
      ? Object.fromEntries(
          request.keywords.map((word) => [
            word,
            rated.rows.filter((row) => row.keyword === word).length,
          ]),
        )
      : null
  return {
    text: rowsText({
      title: `${provider} ${input.action}${device && provider === 'dataforseo' ? ` (${device})` : ''}${target ? ` for ${target}` : ''}${scope ? ` (${SCOPE_TEXT[scope]})` : ''}${LINK_ACTIONS.includes(input.action) ? ', all countries' : `, ${country}${language ? `, language ${language}` : ''}`}.`,
      rows: rated.rows,
      offset,
      limit: size,
      detail,
      notes: [
        `${provider} estimates, in the provider’s own units.`,
        ...(compared
          ? [
              `Compared: ${compared.withPage} of ${compared.results} top results by page, so shared_pages counts only those${compared.fromBreadcrumb ? `; ${compared.fromBreadcrumb} of them came back as Google redirect links and were matched by Google's breadcrumb (site and path), which names the page but can't tell apart two pages with the same breadcrumb` : ''}. ${compared.results - compared.withPage} had no page to compare (a shortened or site-only breadcrumb). ${compared.withSite} had a known site for shared_sites. Unique pages and sites are counted per keyword. Each keyword is one live snapshot, and live results can change a lot from one pull to the next, so a low overlap is weak evidence on its own; where the site already ranks, Search Console queries that land on the same page are a steadier sign of one topic.${compared.withPage < compared.results / 2 && provider === 'dataforseo' ? ' With this few pages, shared_pages cannot settle one page or several; provider ahrefs returns real pages.' : ''}`,
            ]
          : []),
        ...(VOLUME_ACTIONS.includes(input.action) && builtIn
          ? [`Volume model: ${VOLUME_MODEL[builtIn]} ${VOLUMES_DIFFER}`]
          : []),
        ...(input.action === 'serp' || input.action === 'ranked_keywords'
          ? [positionNote(provider)]
          : []),
        ...(aiOverviews?.length
          ? [aiOverviewNote(aiOverviews, request.keywords.length)]
          : input.action === 'serp' && provider === 'dataforseo' && rows.length
            ? ['No AI Overview on these results pages.']
            : []),
        ...(peopleAlsoAsk?.length
          ? [peopleAlsoAskNote(peopleAlsoAsk, request.keywords.length)]
          : []),
        ...(perKeyword
          ? [
              `Results per keyword: ${Object.entries(perKeyword)
                .map(([word, count]) => `${word} ${count}`)
                .join(
                  ', ',
                )}. Rows run position by position across the keywords.`,
            ]
          : []),
        ...(siteTotal && builtIn
          ? [siteTotalNote(builtIn, siteTotal, rows.length)]
          : []),
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
        ...(store && rated.rows.length > PAGE_SIZE
          ? [
              'The result is kept for a day, so the next pages, and the same rows in full, cost nothing more.',
            ]
          : []),
        ...(saved
          ? [
              `Read from the result saved at ${saved.savedAt}, at no new cost${paid ? ` (it cost $${paid} then)` : ''}. Results are kept for a day.`,
            ]
          : costUsd !== null
            ? [
                builtIn
                  ? `DataForSEO cost: $${costUsd}.`
                  : `Cost the ${provider} package reports: $${costUsd}.`,
              ]
            : []),
        ...(partial
          ? [
              `Partial: ${builtIn ? 'DataForSEO' : provider} could not fetch some pages of results, so rows may be missing.`,
            ]
          : []),
        ...(warnings?.length
          ? [`${provider} warnings: ${warnings.join(' ')}`]
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
        ...(unresolved ? [unresolvedNote(unresolved, rows.length)] : []),
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
      siteTotal:
        siteTotal && builtIn
          ? { ...siteTotal, model: TRAFFIC_MODEL[builtIn] }
          : null,
      available: available ?? null,
      country,
      language,
      ...(device ? { device: provider === 'dataforseo' ? device : null } : {}),
      ...(input.action === 'serp' && provider === 'dataforseo'
        ? {
            aiOverviews: aiOverviews ?? [],
            peopleAlsoAsk: peopleAlsoAsk ?? [],
          }
        : {}),
      targetDomainRating: hasTargetDr ? targetDr : null,
      attribution: rated.added || hasTargetDr ? DR_ATTRIBUTION : null,
      leftOut: note,
      costUsd,
      savedAt: saved?.savedAt ?? null,
      partial,
      missedKeywords: missed,
      noDataKeywords: noData,
      ...(warnings?.length ? { warnings } : {}),
      ...(input.action === 'link_gap'
        ? {
            competitors: input.competitors ?? [],
            cutAt: floor ?? null,
            leftOut: leftOut ?? [],
          }
        : {}),
      ...(perKeyword ? { resultsPerKeyword: perKeyword } : {}),
      ...(compared ? { compared } : {}),
      total: rated.rows.length,
      offset,
      // The first row after these, or null when these are the last.
      next,
      rowsLeftOut: rated.rows.length - shown.length,
      rows: shown,
    },
  }
}

// What position means in serp and ranked_keywords rows.
function positionNote(provider: string): string {
  if (provider !== 'dataforseo' && provider !== 'ahrefs') {
    return `position is the organic position the ${provider} package reports (its rankGroup); rank_absolute is its rank among every block on the page, and type is featured_snippet for a featured snippet, which has no organic position.`
  }
  return provider === 'dataforseo'
    ? 'position is the organic position: the nth organic link (DataForSEO rank_group). rank_absolute counts every block on the page from the top, AI Overviews, People Also Ask, videos and images included, so it is higher. A featured snippet has type featured_snippet and no organic position.'
    : "position is the organic position: the nth row Ahrefs marks organic. ahrefs_position is Ahrefs' own position field, and type lists what each row is."
}

// Which keywords showed an AI Overview and the sites it cites first.
function peopleAlsoAskNote(asked: PeopleAlsoAsk[], keywords: number): string {
  const each = asked.map(
    (block) =>
      `${block.keyword}: ${block.questions.map((item) => item.question).join(' | ')}`,
  )
  return `People Also Ask shown for ${asked.length} of ${keywords} keyword${keywords === 1 ? '' : 's'}. ${each.join('; ')}. Google answers most of these with its own AI text, not a page; the answering page, when there is one, is in the JSON as peopleAlsoAsk.`
}

function aiOverviewNote(overviews: AiOverview[], keywords: number): string {
  const each = overviews.map((overview) => {
    const sites = [
      ...new Set(
        overview.references
          .map((ref) => ref.domain)
          .filter((domain): domain is string => Boolean(domain)),
      ),
    ]
    const unknown = overview.references.filter((ref) => !ref.domain).length
    return `${overview.keyword}: ${overview.references.length} sources${sites.length ? ` (${sites.slice(0, 6).join(', ')}${sites.length > 6 ? ', …' : ''})` : ''}${unknown ? `, ${unknown} behind Google redirect links` : ''}`
  })
  return `AI Overview shown for ${overviews.length} of ${keywords} keyword${keywords === 1 ? '' : 's'}. ${each.join('; ')}. The full list is in the JSON as aiOverviews.`
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
function emptyNote(provider: string, action: ResearchAction): string {
  const what =
    action === 'backlinks' || action === 'pages_by_backlinks'
      ? 'links'
      : 'rankings'
  return `No rows: ${provider} has no ${what} for this target in its database. That does not show the target has none; check the target and scope, or ask the other provider.`
}

// Why some keywords have no rows: the provider has no data for them, or
// Google showed no results, which is not the same as nobody ranking.
function noDataNote(
  provider: string,
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
function unresolvedNote(count: number, total: number): string {
  return `${count} of ${total} results have no exact page: DataForSEO returned Google redirect links for them. Their domain and url_hint come from Google's breadcrumb, which is shortened. For exact pages, use provider ahrefs.`
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

// keyword_metrics for a site: its top Search Console queries by impressions,
// asked of the provider in one call, and the ones it rates at zero or does
// not know.
async function zeroVolume(
  input: ResearchInput,
  keys: Headers,
  asked: string,
  searchAnalytics: SearchAnalyticsQuery,
  options: { call: (offset: number) => string; store?: ResearchStore | null },
): Promise<CommandResult> {
  if (!(RESEARCH_PROVIDERS as readonly string[]).includes(asked)) {
    throw new CommandError(
      'INVALID_INPUT',
      'keyword_metrics for a site needs dataforseo or ahrefs.',
    )
  }
  const provider = asked as ResearchProvider
  const country = input.country ?? 'us'
  const site = input.target ?? ''
  const offset = input.offset ?? 0
  const candidates = await zeroVolumeCandidates(
    site,
    searchAnalytics,
    ZERO_VOLUME_KEYWORDS[provider],
  )
  const keywords = candidates.queries.map((query) => query.keyword)
  const request = {
    action: 'keyword_metrics' as const,
    keywords,
    target: '',
    competitors: [],
    country,
  }
  const limit = keywords.length
  const store = options.store ?? workersResearchStore()
  const key = await researchKey([
    provider,
    keys.get(KEY_HEADER[provider]),
    request,
  ])
  const saved = keywords.length ? await readResearch(store, key, limit) : null
  const result = keywords.length
    ? (saved?.result ?? (await research(provider, keys, { ...request, limit })))
    : null
  if (result && !saved) {
    await saveResearch(store, key, {
      limit,
      savedAt: new Date().toISOString(),
      result,
    })
  }
  const found = result
    ? zeroVolumeRows(candidates, result.rows, provider)
    : { rows: [], zero: 0, unknown: 0, rated: 0 }
  const costUsd = saved ? 0 : (result?.costUsd ?? null)
  const detail = input.detail ?? 'summary'
  const size = detail === 'full' ? Math.max(found.rows.length, 1) : PAGE_SIZE
  const { skipped, range } = candidates
  const metric = provider === 'dataforseo' ? 'search_volume' : 'volume'
  return {
    text: rowsText({
      title: `${provider} zero-volume keywords for ${site}, ${country}: ${found.rows.length} of ${keywords.length} of the site's top queries by Search Console impressions (${range.startDate} to ${range.endDate}) have ${metric} 0 (${found.zero}) or none (${found.unknown}); ${found.rated} have a volume.`,
      rows: found.rows,
      offset,
      limit: size,
      detail,
      notes: [
        `Impressions, clicks and position are Search Console's; ${metric} is ${provider}'s estimate. ${VOLUME_MODEL[provider]} A zero or missing volume means the provider's data is below its floor or does not have the keyword, not that nobody searches it: the impressions show people do.`,
        `Asked about ${keywords.length} queries in one call (at most ${ZERO_VOLUME_KEYWORDS[provider]} for ${provider}). Not asked: ${skipped.brand} brand queries (${candidates.brandTerms.join(', ') || 'no brand terms'}), ${skipped.notAKeyword} that are not keywords (operators, pasted text, over 10 words or 80 characters), ${skipped.overLimit} with fewer impressions.`,
        ...(candidates.capped
          ? [
              'Search Console rows were capped at 25,000 query and page rows, so some queries were not read.',
            ]
          : []),
        saved
          ? `Read from the result saved at ${saved.savedAt}, at no new cost. Results are kept for a day.`
          : costUsd !== null
            ? `DataForSEO cost: $${costUsd}.`
            : provider === 'ahrefs'
              ? "Ahrefs charges API units for each keyword returned; its response doesn't say how many."
              : 'No keywords to ask about, so nothing was spent.',
      ],
      more: options.call,
    }),
    data: {
      provider,
      action: 'keyword_metrics',
      target: site,
      country,
      range,
      asked: keywords.length,
      zero: found.zero,
      unknown: found.unknown,
      rated: found.rated,
      skipped,
      brandTerms: candidates.brandTerms,
      capped: candidates.capped,
      costUsd,
      savedAt: saved?.savedAt ?? null,
      rows:
        detail === 'full'
          ? found.rows
          : found.rows.slice(offset, offset + size),
    },
  }
}
