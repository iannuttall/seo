import { deriveBrandTerms, isBrandQuery } from '../brand.js'
import {
  type DecisionModel,
  DecisionRunner,
  type DecisionUsage,
} from '../decision-model.js'
import { SeoError } from '../errors.js'
import type { SearchAnalyticsRequest } from '../gsc/client/types.js'
import type { ProgressReporter } from '../progress.js'
import type { GscRow } from '../types.js'
import {
  crawlForLinks,
  crawlUrl,
  DEFAULT_MAX_PAGES,
  MAX_MAX_PAGES,
  type SiteCrawl,
} from './internal-links-crawl.js'
import {
  canBeSource,
  classifyRequest,
  decideWithModel,
  decideWithoutModel,
  FLOORS,
  type HeldBackReason,
  type JudgeTarget,
  judgeRequest,
  type LinkDecision,
  MAX_PER_TARGET,
  PAGES_PER_CLASSIFY,
  type PageType,
  readClassification,
  type SearchIntent,
  TARGETS_PER_JUDGE,
  THRESHOLDS,
  targetWeight,
} from './internal-links-judge.js'
import {
  type PairPlacement,
  pairPlacement,
} from './internal-links-placement.js'
import {
  internalLinksReportRange,
  internalLinksVerdict,
} from './internal-links-report.js'
import type {
  InternalLinkSuggestion,
  InternalLinksReport,
} from './internal-links-types.js'
import { normalizePageUrl } from './page-technical-signals.js'

export { DEFAULT_MAX_PAGES, MAX_MAX_PAGES } from './internal-links-crawl.js'
export {
  LINK_ROLES,
  PAGE_TYPES,
  SEARCH_INTENTS,
} from './internal-links-judge.js'
export type * from './internal-links-types.js'

// Internal links for a whole site, or for one page. It crawls the site,
// finds related pages with TF-IDF and Search Console query overlap when it
// is available, and places each link in a real sentence with a real phrase.
// With a decision model it classifies every page and judges each link;
// without one it uses the same text evidence and says so. Fixed floors in
// code can overrule the model, and each target keeps at most eight links.

export interface InternalLinksInput {
  // The site (Search Console property, URL or domain).
  site: string
  // One page to find links to. Without it the whole site is audited.
  targetUrl?: string
  // Site mode only: pages to crawl, 500 by default, up to 5,000.
  maxPages?: number
  startDate?: string
  endDate?: string
  refresh?: boolean
}

export interface InternalLinksDependencies {
  crawl: typeof crawlForLinks
  // Search Console rows for the site, or why there are none.
  searchConsole:
    | {
        property: string
        query: (
          request: SearchAnalyticsRequest,
        ) => Promise<{ rows: GscRow[]; rowsFetched: number }>
      }
    | { unavailable: string }
  // The decision model to use, or why there is none.
  decisionModel:
    | { model: DecisionModel; keySource: 'environment' | 'account' }
    | { unavailable: string }
  now: () => Date
  progress?: ProgressReporter
}

const GSC_DAYS = 90
const MAX_GSC_ROWS = 100_000
// A query shared by more pages than this says little about any two of them.
const MAX_PAGES_PER_QUERY = 25
const MAX_GSC_PAIRS = 500_000
// TF-IDF: the least raw similarity for a candidate, targets per source, and
// extra Search Console pairs per source beyond those.
const MIN_SIMILARITY = 0.08
const TARGETS_PER_SOURCE = 8
const EXTRA_GSC_TARGETS = 2
// Page mode: sources placed, and sources judged, for the one target.
const URL_SOURCES_PLACED = 60
const URL_SOURCES_JUDGED = 24
// Sources whose sentences are read and judged at one time.
const SOURCE_WINDOW = 64
const WEAK_INBOUND = 3
const EXAMPLE_LIMIT = 20
const LIST_LIMIT = 100
const OPENING_CHARS = 300

// Where the crawl starts for a site: a property, URL or bare domain.
export function siteStartUrl(site: string): string {
  const value = site.trim()
  if (value.startsWith('sc-domain:')) {
    return `https://${value.slice('sc-domain:'.length)}/`
  }
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  return `${url.origin}/`
}

type Candidate = {
  source: number
  target: number
  raw: number
  similarity: number
  sharedQueries: number
}

type Judged = {
  candidate: Candidate
  placement: PairPlacement
  decision: LinkDecision
}

function round(value: number, places = 3): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

export async function internalLinksReport(
  input: InternalLinksInput,
  dependencies: Partial<InternalLinksDependencies> &
    Pick<InternalLinksDependencies, 'searchConsole' | 'decisionModel'>,
): Promise<InternalLinksReport> {
  const deps = {
    crawl: crawlForLinks,
    now: () => new Date(),
    ...dependencies,
  }
  const mode = input.targetUrl ? 'url' : 'site'
  if (mode === 'url' && input.maxPages !== undefined) {
    throw new SeoError(
      'INVALID_INPUT',
      `--max-pages is for a site audit only. A page run crawls up to ${DEFAULT_MAX_PAGES} pages.`,
    )
  }
  const maxPages = input.maxPages ?? DEFAULT_MAX_PAGES
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_MAX_PAGES) {
    throw new SeoError(
      'INVALID_INPUT',
      `--max-pages is a whole number from 1 to ${MAX_MAX_PAGES.toLocaleString('en-US')}.`,
    )
  }
  const targetUrl = input.targetUrl ? crawlUrl(input.targetUrl) : undefined
  if (input.targetUrl && !targetUrl) {
    throw new SeoError('INVALID_INPUT', 'The target is an http or https URL.')
  }
  const now = deps.now()
  const startUrl = targetUrl
    ? `${new URL(targetUrl).origin}/`
    : siteStartUrl(input.site)
  deps.progress?.(`Crawling ${startUrl} (up to ${maxPages} pages).`)
  const crawl = await deps.crawl({
    startUrl,
    maxPages,
    firstUrl: targetUrl,
    refresh: input.refresh,
    progress: deps.progress,
  })
  try {
    return await analyse(input, deps, crawl, {
      mode,
      targetUrl,
      startUrl,
      now,
    })
  } finally {
    await crawl.sentences.close()
  }
}

async function analyse(
  input: InternalLinksInput,
  deps: InternalLinksDependencies,
  crawl: SiteCrawl,
  context: {
    mode: 'site' | 'url'
    targetUrl: string | undefined
    startUrl: string
    now: Date
  },
): Promise<InternalLinksReport> {
  const { pages, index } = crawl
  const count = pages.length
  const warnings = [...crawl.warnings]

  // --- Which crawled page each URL is ----------------------------------------
  const lookup = new Map<string, number>()
  crawl.urls.forEach((url, id) => {
    const page = crawl.pageOfUrl.get(id)
    if (page === undefined) return
    lookup.set(url, page)
    if (!lookup.has(normalizePageUrl(url)))
      lookup.set(normalizePageUrl(url), page)
  })
  const pageAt = (url: string): number | undefined => {
    const clean = crawlUrl(url)
    if (!clean) return undefined
    return lookup.get(clean) ?? lookup.get(normalizePageUrl(clean))
  }
  const target =
    context.targetUrl !== undefined ? pageAt(context.targetUrl) : undefined

  // --- The existing link graph -----------------------------------------------
  const contextual: Array<Set<number>> = pages.map(() => new Set())
  const anywhere: Array<Set<number>> = pages.map(() => new Set())
  const redirectedLinks: InternalLinksReport['redirectedLinks'] = []
  pages.forEach((page, source) => {
    for (const id of page.contextual) {
      const to = crawl.pageOfUrl.get(id)
      if (to === undefined || to === source) continue
      contextual[source]?.add(to)
      anywhere[source]?.add(to)
      const via = crawl.urls[id] as string
      const final = pages[to]?.url as string
      if (
        normalizePageUrl(via) !== normalizePageUrl(final) &&
        redirectedLinks.length < LIST_LIMIT
      ) {
        redirectedLinks.push({ source: page.url, via, target: final })
      }
    }
    for (const id of page.other) {
      const to = crawl.pageOfUrl.get(id)
      if (to !== undefined && to !== source) anywhere[source]?.add(to)
    }
  })
  const inbound = new Array<number>(count).fill(0)
  const inboundAnywhere = new Array<number>(count).fill(0)
  contextual.forEach((set) => {
    for (const to of set) inbound[to] = (inbound[to] ?? 0) + 1
  })
  anywhere.forEach((set) => {
    for (const to of set) inboundAnywhere[to] = (inboundAnywhere[to] ?? 0) + 1
  })
  const existingContextualLinks = contextual.reduce(
    (sum, set) => sum + set.size,
    0,
  )

  // --- Search Console: pages that appear for the same queries -----------------
  const range = internalLinksReportRange(input, GSC_DAYS, context.now)
  const sharedQueries = new Map<number, number>()
  const pairKey = (source: number, target: number) => source * count + target
  let searchConsole: InternalLinksReport['searchConsole'] = {
    status: 'not-available',
    property: null,
    range: null,
    rows: 0,
    possiblyTruncated: false,
    pairsWithSharedQueries: 0,
    note:
      'unavailable' in deps.searchConsole
        ? deps.searchConsole.unavailable
        : null,
  }
  if ('property' in deps.searchConsole && count > 1) {
    const { startDate, endDate } = range
    try {
      deps.progress?.('Reading Search Console queries.')
      const result = await deps.searchConsole.query({
        startDate,
        endDate,
        dimensions: ['query', 'page'],
        type: 'web',
        dataState: 'final',
        maxRows: MAX_GSC_ROWS,
      })
      const brandTerms = deriveBrandTerms({ siteUrl: crawl.origin })
      const byQuery = new Map<string, Set<number>>()
      for (const row of result.rows) {
        const [query, url] = row.keys
        if (!query || !url || row.impressions < 1) continue
        if (isBrandQuery(query, brandTerms)) continue
        const page = pageAt(url)
        if (page === undefined) continue
        let set = byQuery.get(query)
        if (!set) {
          set = new Set()
          byQuery.set(query, set)
        }
        set.add(page)
      }
      let capped = false
      for (const set of byQuery.values()) {
        if (set.size < 2 || set.size > MAX_PAGES_PER_QUERY) continue
        const list = [...set]
        for (const source of list) {
          for (const to of list) {
            if (source === to) continue
            if (target !== undefined && to !== target) continue
            const key = pairKey(source, to)
            if (
              !sharedQueries.has(key) &&
              sharedQueries.size >= MAX_GSC_PAIRS
            ) {
              capped = true
              continue
            }
            sharedQueries.set(key, (sharedQueries.get(key) ?? 0) + 1)
          }
        }
      }
      searchConsole = {
        status: 'used',
        property: deps.searchConsole.property,
        range: { startDate, endDate },
        rows: result.rowsFetched,
        possiblyTruncated: result.rowsFetched >= MAX_GSC_ROWS,
        pairsWithSharedQueries: sharedQueries.size,
        note: capped
          ? `Shared queries were counted for the first ${MAX_GSC_PAIRS.toLocaleString('en-US')} page pairs.`
          : null,
      }
    } catch (error) {
      searchConsole = {
        ...searchConsole,
        status: 'failed',
        property: deps.searchConsole.property,
        note: error instanceof Error ? error.message : String(error),
      }
    }
  }

  // --- The decision model ----------------------------------------------------
  const runner =
    'model' in deps.decisionModel
      ? new DecisionRunner(deps.decisionModel.model)
      : null
  const types: Array<PageType | null> = pages.map((page) =>
    new URL(page.url).pathname === '/' ? 'home' : null,
  )
  const intents: Array<SearchIntent | null> = pages.map(() => null)
  let pagesClassified = 0
  const classify = async (ids: number[]) => {
    if (!runner) return
    const batches: number[][] = []
    for (let at = 0; at < ids.length; at += PAGES_PER_CLASSIFY) {
      batches.push(ids.slice(at, at + PAGES_PER_CLASSIFY))
    }
    deps.progress?.(
      `Classifying ${ids.length} pages in ${batches.length} requests.`,
    )
    await Promise.all(
      batches.map(async (batch) => {
        const response = await runner.ask(
          classifyRequest(
            batch.map((id) => pages[id] as (typeof pages)[number]),
          ),
        )
        if (!response) return
        batch.forEach((id, at) => {
          const read = readClassification(response.answers, at)
          if (read.type) types[id] = read.type
          intents[id] = read.intent
          pagesClassified += 1
        })
      }),
    )
  }

  const linkable = (source: number, to: number): boolean => {
    const from = pages[source]
    const page = pages[to]
    if (!from || !page || source === to) return false
    if (page.noindex || targetWeight(types[to] ?? null) === 0) return false
    if (contextual[source]?.has(to)) return false
    if (from.lang && page.lang && from.lang !== page.lang) return false
    return canBeSource(types[source] ?? null)
  }
  const adjusted = (to: number, raw: number) =>
    raw *
    ((inbound[to] ?? 0) < WEAK_INBOUND ? 1.25 : 1) *
    targetWeight(types[to] ?? null)

  // --- Candidate pairs --------------------------------------------------------
  let status: InternalLinksReport['dataStatus'] = 'complete'
  const candidatesBySource = new Map<number, Candidate[]>()
  if (crawl.stats.blockedByRobots) status = 'blocked'
  else if (count === 0) status = 'empty'
  else if (context.mode === 'url' && target === undefined) {
    status = 'target-not-crawled'
  }

  if (status === 'complete' && context.mode === 'site') {
    await classify(pages.map((_, id) => id))
    const extra = new Map<number, number[]>()
    for (const key of sharedQueries.keys()) {
      const source = Math.floor(key / count)
      const list = extra.get(source) ?? []
      list.push(key % count)
      extra.set(source, list)
    }
    for (let source = 0; source < count; source += 1) {
      if (!canBeSource(types[source] ?? null)) continue
      const near = index
        .neighbours(source, MIN_SIMILARITY)
        .filter(({ page }) => linkable(source, page))
        .map(({ page, score }) => ({
          source,
          target: page,
          raw: score,
          similarity: adjusted(page, score),
          sharedQueries: sharedQueries.get(pairKey(source, page)) ?? 0,
        }))
        .sort(
          (left, right) =>
            right.similarity - left.similarity || left.target - right.target,
        )
      const chosen = near.slice(0, TARGETS_PER_SOURCE)
      const taken = new Set(chosen.map((candidate) => candidate.target))
      const fromQueries = (extra.get(source) ?? [])
        .filter((to) => !taken.has(to) && linkable(source, to))
        .map((to) => {
          const raw = index.similarity(source, to)
          return {
            source,
            target: to,
            raw,
            similarity: adjusted(to, raw),
            sharedQueries: sharedQueries.get(pairKey(source, to)) ?? 0,
          }
        })
        .sort(
          (left, right) =>
            right.sharedQueries - left.sharedQueries ||
            right.similarity - left.similarity ||
            left.target - right.target,
        )
        .slice(0, EXTRA_GSC_TARGETS)
      const all = [...chosen, ...fromQueries]
      if (all.length) candidatesBySource.set(source, all)
    }
  }

  if (status === 'complete' && context.mode === 'url' && target !== undefined) {
    const near = new Map<number, number>()
    for (const { page, score } of index.neighbours(target, MIN_SIMILARITY)) {
      near.set(page, score)
    }
    for (const key of sharedQueries.keys()) {
      const source = Math.floor(key / count)
      if (!near.has(source)) near.set(source, index.similarity(source, target))
    }
    const ranked = [...near]
      .map(([source, raw]) => ({
        source,
        target,
        raw,
        similarity: adjusted(target, raw),
        sharedQueries: sharedQueries.get(pairKey(source, target)) ?? 0,
      }))
      .sort(
        (left, right) =>
          Number(right.sharedQueries > 0) - Number(left.sharedQueries > 0) ||
          right.similarity - left.similarity ||
          left.source - right.source,
      )
    // Classify only the target and the sources that may be judged.
    await classify([
      target,
      ...ranked.slice(0, URL_SOURCES_PLACED).map((c) => c.source),
    ])
    if (targetWeight(types[target] ?? null) === 0 || pages[target]?.noindex) {
      status = 'target-not-linkable'
    } else {
      for (const candidate of ranked) {
        if (candidatesBySource.size >= URL_SOURCES_PLACED) break
        if (!linkable(candidate.source, target)) continue
        candidatesBySource.set(candidate.source, [
          { ...candidate, similarity: adjusted(target, candidate.raw) },
        ])
      }
    }
  }

  // --- Place and judge, a window of sources at a time --------------------------
  const judged: Judged[] = []
  let pairsConsidered = 0
  let pairsJudged = 0
  let fellBack = 0
  const sources = [...candidatesBySource.keys()].sort(
    (left, right) => left - right,
  )
  let sourcesWithPlacement = 0
  for (let at = 0; at < sources.length; at += SOURCE_WINDOW) {
    if (context.mode === 'url' && sourcesWithPlacement >= URL_SOURCES_JUDGED) {
      break
    }
    const window = sources.slice(at, at + SOURCE_WINDOW)
    deps.progress?.(
      `Placing and judging links from pages ${at + 1} to ${at + window.length} of ${sources.length}.`,
    )
    const work = await Promise.all(
      window.map(async (source) => {
        const page = pages[source]
        if (!page) return []
        const sentences = await crawl.sentences.read(page.text)
        const placed: Array<{
          candidate: Candidate
          placement: PairPlacement
        }> = []
        for (const candidate of candidatesBySource.get(source) ?? []) {
          pairsConsidered += 1
          const to = pages[candidate.target]
          if (!to) continue
          const placement = pairPlacement(sentences, to, index)
          // A pair with no sentence that names the target has no place for a
          // link without new text, so it is not judged.
          if (!placement.sentences.length) continue
          placed.push({ candidate, placement })
        }
        return placed
      }),
    )
    let pairs = work.flat()
    if (context.mode === 'url') {
      pairs = pairs
        .sort(
          (left, right) =>
            Number(right.candidate.sharedQueries > 0) -
              Number(left.candidate.sharedQueries > 0) ||
            right.candidate.similarity - left.candidate.similarity ||
            left.candidate.source - right.candidate.source,
        )
        .slice(0, URL_SOURCES_JUDGED - sourcesWithPlacement)
      sourcesWithPlacement += pairs.length
    }
    const bySource = new Map<number, typeof pairs>()
    for (const pair of pairs) {
      const list = bySource.get(pair.candidate.source) ?? []
      list.push(pair)
      bySource.set(pair.candidate.source, list)
    }
    const groups: Array<typeof pairs> = []
    for (const list of bySource.values()) {
      for (let start = 0; start < list.length; start += TARGETS_PER_JUDGE) {
        groups.push(list.slice(start, start + TARGETS_PER_JUDGE))
      }
    }
    await Promise.all(
      groups.map(async (group) => {
        const first = group[0]
        if (!first) return
        const source = pages[first.candidate.source]
        if (!source) return
        const response = runner
          ? await runner.ask(
              judgeRequest(
                {
                  url: source.url,
                  title: source.title,
                  type: types[first.candidate.source] ?? null,
                },
                group.map(({ candidate, placement }): JudgeTarget => {
                  const to = pages[candidate.target] as (typeof pages)[number]
                  return {
                    url: to.url,
                    title: to.title,
                    description: to.description,
                    h1: to.h1,
                    type: types[candidate.target] ?? null,
                    intent: intents[candidate.target] ?? null,
                    opening: to.excerpt.slice(0, OPENING_CHARS),
                    placement,
                  }
                }),
              ),
            )
          : null
        group.forEach(({ candidate, placement }, position) => {
          let decision: LinkDecision
          if (response) {
            pairsJudged += 1
            decision = decideWithModel(
              placement,
              candidate.similarity,
              response.answers,
              position,
            )
          } else {
            if (runner) fellBack += 1
            decision = decideWithoutModel(placement, candidate.similarity)
          }
          judged.push({ candidate, placement, decision })
        })
      }),
    )
  }

  // --- Suggestions ------------------------------------------------------------
  const heuristicScore = (item: Judged) =>
    item.candidate.similarity *
    (0.5 +
      (item.decision.state === 'suggest'
        ? (item.decision.sentence?.match ?? 0)
        : 0))
  const suggested = judged
    .filter(
      (
        item,
      ): item is Judged & {
        decision: Extract<LinkDecision, { state: 'suggest' }>
      } => item.decision.state === 'suggest',
    )
    .sort(
      (left, right) =>
        (right.decision.probability ?? -1) -
          (left.decision.probability ?? -1) ||
        heuristicScore(right) - heuristicScore(left) ||
        (pages[left.candidate.source]?.url ?? '').localeCompare(
          pages[right.candidate.source]?.url ?? '',
        ) ||
        (pages[left.candidate.target]?.url ?? '').localeCompare(
          pages[right.candidate.target]?.url ?? '',
        ),
    )
  const perTarget = new Map<number, number>()
  // Without a model, one sentence carries one new link at most: the best.
  const usedSentences = new Set<string>()
  const kept = suggested.filter((item) => {
    if (item.decision.tier === 'heuristic' && item.decision.sentence) {
      const key = `${item.candidate.source}\u0000${item.decision.sentence.text}`
      if (usedSentences.has(key)) return false
      usedSentences.add(key)
    }
    const seen = (perTarget.get(item.candidate.target) ?? 0) + 1
    perTarget.set(item.candidate.target, seen)
    return seen <= MAX_PER_TARGET
  })
  const items: InternalLinkSuggestion[] = kept.map(
    ({ candidate, decision }) => ({
      source: pages[candidate.source]?.url ?? '',
      target: pages[candidate.target]?.url ?? '',
      tier: decision.tier,
      probability: decision.probability,
      role: decision.role,
      anchor: decision.anchor,
      sentence: decision.sentence?.text ?? null,
      section: decision.sentence?.section || null,
      sentenceMatch: decision.sentence?.match ?? null,
      similarity: round(candidate.similarity),
      sharedQueries: candidate.sharedQueries,
      targetInboundLinks: inbound[candidate.target] ?? 0,
      sourceType: types[candidate.source] ?? null,
      targetType: types[candidate.target] ?? null,
    }),
  )
  const suggestedInbound = new Array<number>(count).fill(0)
  const suggestedOutbound = new Array<number>(count).fill(0)
  for (const { candidate } of kept) {
    suggestedInbound[candidate.target] =
      (suggestedInbound[candidate.target] ?? 0) + 1
    suggestedOutbound[candidate.source] =
      (suggestedOutbound[candidate.source] ?? 0) + 1
  }
  const held = judged.filter(
    (
      item,
    ): item is Judged & {
      decision: Extract<LinkDecision, { state: 'held-back' }>
    } => item.decision.state === 'held-back',
  )
  const reasons: Partial<Record<HeldBackReason, number>> = {}
  for (const item of held) {
    reasons[item.decision.reason] = (reasons[item.decision.reason] ?? 0) + 1
  }
  const declined = judged.filter(
    (item) => item.decision.state === 'declined',
  ).length

  // --- The judge's part -------------------------------------------------------
  const usage: DecisionUsage | null = runner ? runner.usage() : null
  const judgeStatus: InternalLinksReport['judge']['status'] = !runner
    ? 'not-used'
    : runner.authError ||
        (usage && usage.requests === 0 && usage.failedRequests > 0)
      ? 'failed'
      : (usage?.failedRequests ?? 0) > 0
        ? 'partial'
        : 'used'
  const modelLabel = usage ? `${usage.model}` : null
  const judgeNote = !runner
    ? `Jev was not used: ${'unavailable' in deps.decisionModel ? deps.decisionModel.unavailable : 'no TypeSafe key'}. Links come from TF-IDF similarity and sentence matching (heuristics). Add a TypeSafe API key at https://seoskill.dev/account#keys and run seo login, or set TYPESAFE_API_KEY on this machine, to have Jev classify pages and judge each link.`
    : runner.authError
      ? `${runner.authError.message} ${fellBack} link${fellBack === 1 ? '' : 's'} fell back to heuristics.`
      : judgeStatus === 'partial'
        ? `${usage?.failedRequests} request${usage?.failedRequests === 1 ? '' : 's'} to ${modelLabel} failed after retries; ${fellBack} link${fellBack === 1 ? '' : 's'} fell back to heuristics.`
        : `${modelLabel} classified ${pagesClassified} page${pagesClassified === 1 ? '' : 's'} and judged ${pairsJudged} link${pairsJudged === 1 ? '' : 's'} in ${usage?.requests ?? 0} requests, for $${(usage?.costUsd ?? 0).toFixed(4)}.`
  if (
    status === 'complete' &&
    (crawl.stats.capReached ||
      judgeStatus === 'partial' ||
      judgeStatus === 'failed')
  ) {
    status = 'partial'
  }

  const counts: InternalLinksReport['summary'] = {
    verdict: '',
    pagesCrawled: count,
    existingContextualLinks,
    orphanPages: inboundAnywhere.filter(
      (value, id) => value === 0 && types[id] !== 'home',
    ).length,
    weaklyLinkedPages: inbound.filter(
      (value, id) => value < WEAK_INBOUND && types[id] !== 'home',
    ).length,
    pairsConsidered,
    suggestions: items.length,
    strong: items.filter((item) => item.tier === 'strong').length,
    possible: items.filter((item) => item.tier === 'possible').length,
    heuristic: items.filter((item) => item.tier === 'heuristic').length,
    heldBack: held.length,
    declined,
  }
  const targetPage = target !== undefined ? pages[target] : undefined
  const report: InternalLinksReport = {
    site: input.site,
    mode: context.mode,
    targetUrl: context.targetUrl ?? null,
    generatedAt: context.now.toISOString(),
    dataStatus: status,
    crawl: {
      startUrl: context.startUrl,
      method: crawl.method,
      maxPages: crawl.stats.maxPages,
      pageLimit: crawl.stats.pageLimit,
      urlsFound: crawl.stats.urlsFound,
      pagesCrawled: count,
      capReached: crawl.stats.capReached,
      crawlDelaySeconds: crawl.stats.crawlDelaySeconds,
      skipped: crawl.stats.skipped as Record<string, number>,
      redirectsChecked: crawl.stats.redirectsChecked,
    },
    searchConsole,
    judge: {
      status: judgeStatus,
      note: judgeNote,
      keySource:
        'model' in deps.decisionModel ? deps.decisionModel.keySource : null,
      provider: usage?.provider ?? null,
      model: usage?.model ?? null,
      requests: usage?.requests ?? 0,
      failedRequests: usage?.failedRequests ?? 0,
      inputTokens: usage?.inputTokens ?? 0,
      costUsd: usage?.costUsd ?? 0,
      pagesClassified,
      pairsJudged,
      thresholds: { ...THRESHOLDS },
      floors: { ...FLOORS },
    },
    target:
      target !== undefined && targetPage
        ? {
            url: targetPage.url,
            title: targetPage.title,
            type: types[target] ?? null,
            intent: intents[target] ?? null,
            inboundLinks: inbound[target] ?? 0,
            inboundLinksAnywhere: inboundAnywhere[target] ?? 0,
            noindex: targetPage.noindex,
          }
        : null,
    summary: counts,
    items,
    heldBack: {
      count: held.length,
      reasons,
      examples: held.slice(0, EXAMPLE_LIMIT).map((item) => ({
        source: pages[item.candidate.source]?.url ?? '',
        target: pages[item.candidate.target]?.url ?? '',
        reason: item.decision.reason,
        detail: item.decision.detail,
      })),
    },
    pageInventory:
      context.mode === 'site'
        ? pages
            .map((page, id) => ({
              url: page.url,
              title: page.title,
              type: types[id] ?? null,
              intent: intents[id] ?? null,
              words: page.words,
              inboundLinks: inbound[id] ?? 0,
              inboundLinksAnywhere: inboundAnywhere[id] ?? 0,
              outboundLinks: contextual[id]?.size ?? 0,
              suggestedInbound: suggestedInbound[id] ?? 0,
              suggestedOutbound: suggestedOutbound[id] ?? 0,
              noindex: page.noindex,
            }))
            .sort(
              (left, right) =>
                left.inboundLinks - right.inboundLinks ||
                left.url.localeCompare(right.url),
            )
        : [],
    redirectedLinks,
    genericAnchors: crawl.genericAnchors.map((anchor) => ({
      source: pages[anchor.source]?.url ?? '',
      href: anchor.href,
      text: anchor.text,
    })),
    warnings,
    caveats: [],
    next: null,
  }
  report.summary.verdict = internalLinksVerdict({ ...report, counts })
  report.caveats = caveats(report)
  const top = items[0]
  report.next =
    context.mode === 'site'
      ? top
        ? `seo internal-links --url ${top.target}`
        : null
      : `seo page --url ${report.target?.url ?? context.targetUrl}`
  return report
}

function caveats(report: InternalLinksReport): string[] {
  const crawl = report.crawl
  return [
    `Crawl: ${crawl.pagesCrawled} page${crawl.pagesCrawled === 1 ? '' : 's'} from ${crawl.method === 'sitemap' ? 'the sitemap' : 'links from the start page'}, limit ${crawl.pageLimit}${crawl.capReached ? ' (reached, so pages beyond it were not checked and orphan and weak-link counts cover crawled pages only)' : ' (not reached)'}.${crawl.crawlDelaySeconds ? ` robots.txt crawl-delay of ${crawl.crawlDelaySeconds}s was honoured.` : ''}`,
    report.judge.note,
    report.searchConsole.status === 'used'
      ? `Search Console: ${report.searchConsole.rows.toLocaleString('en-US')} query rows from ${report.searchConsole.range?.startDate} to ${report.searchConsole.range?.endDate}, brand queries left out; ${report.searchConsole.pairsWithSharedQueries} page pairs share a query.${report.searchConsole.possiblyTruncated ? ' The 100,000-row cap was reached.' : ''}`
      : `Search Console was not used${report.searchConsole.note ? `: ${report.searchConsole.note}` : ''}. Candidates come from page text only.`,
    `Rules in code: a link needs a model probability of ${THRESHOLDS.possible} (${THRESHOLDS.strong} is strong), a sentence with at least ${FLOORS.minSentenceMatch * 100}% of the words that name the target or pages at least ${FLOORS.minSimilarityAlone} similar, and an anchor from the chosen sentence. At most ${MAX_PER_TARGET} links per target.`,
    'Similarity, sentence match and anchors are text heuristics, and a model probability is a judgement of reader value. None of them predicts rankings or traffic.',
  ]
}
