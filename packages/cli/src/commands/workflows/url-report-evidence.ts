import {
  type CrawlReport,
  reviewObservations,
  type SearchConsoleExportPageRow,
  type SearchConsoleExportQueryRow,
  type SearchConsoleExportReconciliation,
  SeoError,
  type TopFix,
  topFixes,
} from '@seo/core'

export {
  exportSummarySentence,
  issueCountSummarySentence,
  printExportPageInventory,
  searchConsoleExportSection,
} from './url-report-output.js'

export type UrlReportAction = {
  id: string
  kind: 'fix' | 'review'
  title: string
  action: string
  confidence: 'high' | 'medium' | 'low'
  severity?: string
  affectedCount?: number
  sampleUrls?: string[]
  affectedUrlsReport?: {
    id: 'affected-urls'
    params: {
      reportId: string
      ruleId: string
    }
  }
  evidence?: Record<string, unknown>
  review?: {
    question: string
    changeOnlyIf: string
    ifConfirmed?: string
    ifNotNeeded: string
    doNot?: string[]
  }
  verification?: {
    command?: string
    expected: string
  }
}

export type TopicOverlapCandidate = {
  query: string
  impressions: number
  clicks: number
  pages: Array<{ url: string; title: string }>
}

export type TopicOverlapResult = {
  candidates: TopicOverlapCandidate[]
  eligibleQueries: number
  consideredQueries: number
  queryLimitReached: boolean
  candidateLimitReached: boolean
  capped: boolean
}

export function completeTopFixes(report: CrawlReport) {
  return topFixes(report, { limit: report.issues.length })
}

export function completeReviewObservations(report: CrawlReport) {
  return reviewObservations(report, { limit: report.issues.length })
}

export function crawlDataSourceLines(
  dataSources: CrawlReport['dataSources'],
): string[] {
  if (!dataSources) return []

  const sourceLine = (input: {
    label: string
    status: string
    joinedPages: number
    totalPages: number
    window?: { days: number }
    warning?: string
  }): string => {
    const range = input.window ? ` in the last ${input.window.days} days` : ''
    const coverage = `for ${input.joinedPages} of ${input.totalPages} crawled URLs`

    if (input.status === 'skipped') return `${input.label}: not connected.`
    if (input.status === 'unavailable') {
      return `${input.label}: unavailable. ${input.warning ?? 'No data was joined.'}`
    }
    if (input.status === 'partial') {
      return `${input.label}: partial data ${coverage}${range}. ${input.warning ?? ''}`.trim()
    }
    if (input.status === 'none') {
      return `${input.label}: no matching crawled URLs${range}.`
    }
    return `${input.label}: joined ${coverage}${range}.`
  }

  return [
    sourceLine({
      label: 'Search Console',
      status: dataSources.searchConsole.status,
      joinedPages: Math.max(
        dataSources.searchConsole.joinedMetricPages,
        dataSources.searchConsole.joinedQueryPages,
      ),
      totalPages: dataSources.searchConsole.totalPages,
      window: dataSources.searchConsole.window,
      warning: dataSources.searchConsole.warning,
    }),
    sourceLine({
      label: 'Google Analytics',
      status: dataSources.analytics.status,
      joinedPages: dataSources.analytics.joinedPages,
      totalPages: dataSources.analytics.totalPages,
      window: dataSources.analytics.window,
      warning: dataSources.analytics.warning,
    }),
  ]
}

// Strict codepoint order (not UTF-16 code-unit order) so tie-breaking is
// stable regardless of which plane a character lives in.
function codePointCompare(left: string, right: string): number {
  if (left === right) return 0
  const a = [...left]
  const b = [...right]
  const shared = Math.min(a.length, b.length)
  for (let index = 0; index < shared; index += 1) {
    const diff =
      (a[index]?.codePointAt(0) ?? 0) - (b[index]?.codePointAt(0) ?? 0)
    if (diff !== 0) return diff
  }
  return a.length - b.length
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Distinct-page identity: same origin, path (without a trailing slash), and
// query string. /guide and /guide/ are one page for overlap counting.
function pageIdentityKey(url: string): string {
  try {
    const parsed = new URL(url)
    const path =
      parsed.pathname.length > 1 && parsed.pathname.endsWith('/')
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname
    return `${parsed.origin}${path}${parsed.search}`
  } catch {
    return url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url
  }
}

/**
 * Title evidence for export joins: the main crawl's final URLs plus any
 * bounded unreached-audit fetches from the same run.
 */
export function titleEvidencePages(
  crawledPages: Array<{
    url: string
    finalUrl?: string | null
    title?: string | null
  }>,
  auditedPages: Array<{ url: string; title: string | null }> = [],
): Array<{ url: string; title: string | null | undefined }> {
  return [
    ...crawledPages.map((page) => ({
      url: page.finalUrl || page.url,
      title: page.title,
    })),
    ...auditedPages,
  ]
}

/** Display path for a page URL, used in action copy and terminal tables. */
export function pageDisplayPath(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}` || '/'
  } catch {
    return url
  }
}

// Mirrors the path normalization in @seo/core's reconcileExportPagesWithCrawl
// (strip one trailing slash except at the root, keep the query string) so the
// inventory joins agree exactly with the reconciliation's path join basis.
function normalizedJoinPath(value: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  const pathname =
    parsed.pathname !== '/' && parsed.pathname.endsWith('/')
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname
  return `${pathname}${parsed.search}`
}

export type ExportPageInventoryRow = {
  url: string
  path: string
  clicks: number
  impressions: number
  position: number | null
  reachedByCrawl: boolean | null
  title: string | null
  overlapQuery: string | null
  suggestedDisposition: 'keep' | 'update' | 'review'
  tier: string
}

export type ExportPageInventory = {
  rows: ExportPageInventoryRow[]
  totalPages: number
  capped: boolean
  sourceCapped: boolean
  page: number
  pageSize: number
  pageCount: number
  nextPage: number | null
  criteria: string[]
  note: string
}

// Average positions past this value sit outside the usual two result pages.
// It is an arbitrary review threshold, not a search engine rule.
const WEAK_POSITION_THRESHOLD = 20

// The ordered tier rules; the first matching rule wins. Kept as data so every
// inventory result carries its own methodology.
const EXPORT_PAGE_INVENTORY_CRITERIA: readonly string[] = [
  'review: shares a search phrase with another page title; confirm query-to-page evidence and intent before consolidating',
  'keep: has clicks in the export window',
  'review: has impressions but no crawl path reached it',
  `update: has impressions with a weak average position (average position above ${WEAK_POSITION_THRESHOLD} in the export)`,
  'review: low observed demand in the export window',
]

export const EXPORT_PAGE_INVENTORY_NOTE =
  'Suggested dispositions are heuristic tiers from the export numbers and crawl reach. Decide each page with the owner.'

/**
 * Per-page inventory of the exported page table with a suggested disposition
 * tier for each page. The tiers are heuristics over the export numbers and
 * crawl reach only; the export is a dated snapshot, missing rows are not
 * zeros, and the owner decides intent page by page.
 */
export function exportPageInventory(input: {
  pages: SearchConsoleExportPageRow[]
  reconciliation?: SearchConsoleExportReconciliation
  crawledPages: Array<{ url: string; title: string | null | undefined }>
  overlap?: TopicOverlapResult
  maxRows?: number
  page?: number
  sourceCapped?: boolean
}): ExportPageInventory {
  const maxRows = input.maxRows ?? 50
  const page = input.page ?? 1
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) {
    throw new SeoError('INVALID_INPUT', 'Inventory page size must be positive.')
  }
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new SeoError('INVALID_INPUT', 'Inventory page must be positive.')
  }

  // Without a reconciliation there is no unreached evidence, so the
  // unreached rule cannot fire and no reach claim is made from thin air.
  const unreachedPaths = new Set<string>()
  for (const row of input.reconciliation?.unreachedPages ?? []) {
    const path = normalizedJoinPath(row.url)
    if (path !== null) unreachedPaths.add(path)
  }

  // Titles join by the same path basis as the reconciliation. Codepoint order
  // plus first-title-wins keeps identical input yielding identical output.
  const titlesByPath = new Map<string, string>()
  const sortedCrawled = [...input.crawledPages].sort((left, right) =>
    codePointCompare(left.url, right.url),
  )
  for (const page of sortedCrawled) {
    if (typeof page.title !== 'string') continue
    const path = normalizedJoinPath(page.url)
    if (path === null) continue
    if (!titlesByPath.has(path)) titlesByPath.set(path, page.title)
  }

  // Overlap candidates arrive ranked by impressions, clicks, then query, so
  // the first candidate naming a path wins deterministically.
  const overlapQueryByPath = new Map<string, string>()
  for (const candidate of input.overlap?.candidates ?? []) {
    for (const page of candidate.pages) {
      const path = normalizedJoinPath(page.url)
      if (path === null) continue
      if (!overlapQueryByPath.has(path)) {
        overlapQueryByPath.set(path, candidate.query)
      }
    }
  }

  const sortedPages = [...input.pages].sort(
    (left, right) =>
      right.impressions - left.impressions ||
      right.clicks - left.clicks ||
      codePointCompare(left.url, right.url),
  )
  const pageCount = Math.ceil(sortedPages.length / maxRows)
  if (pageCount > 0 && page > pageCount) {
    throw new SeoError(
      'INVALID_INPUT',
      `Inventory page ${page} does not exist; choose a page from 1 to ${pageCount}.`,
    )
  }
  const pageStart = (page - 1) * maxRows
  const rows = sortedPages
    .slice(pageStart, pageStart + maxRows)
    .map((page): ExportPageInventoryRow => {
      const joinPath = normalizedJoinPath(page.url)
      const reachedByCrawl =
        joinPath === null || !input.reconciliation
          ? null
          : unreachedPaths.has(joinPath)
            ? false
            : input.reconciliation.capped
              ? null
              : true
      const title =
        joinPath !== null ? (titlesByPath.get(joinPath) ?? null) : null
      const overlapQuery =
        joinPath !== null ? (overlapQueryByPath.get(joinPath) ?? null) : null
      let suggestedDisposition: ExportPageInventoryRow['suggestedDisposition']
      let tier: string
      if (overlapQuery !== null) {
        suggestedDisposition = 'review'
        tier =
          'shares a search phrase with another page title and needs query-to-page and intent verification'
      } else if (page.clicks > 0) {
        suggestedDisposition = 'keep'
        tier = 'has clicks in the export window'
      } else if (page.impressions > 0 && reachedByCrawl === false) {
        suggestedDisposition = 'review'
        tier = 'has impressions but no crawl path reached it'
      } else if (
        page.impressions > 0 &&
        page.position !== null &&
        page.position > WEAK_POSITION_THRESHOLD
      ) {
        suggestedDisposition = 'update'
        tier = 'has impressions with a weak average position'
      } else {
        suggestedDisposition = 'review'
        tier = 'low observed demand in the export window'
      }
      return {
        url: page.url,
        path: pageDisplayPath(page.url),
        clicks: page.clicks,
        impressions: page.impressions,
        position: page.position,
        reachedByCrawl,
        title,
        overlapQuery,
        suggestedDisposition,
        tier,
      }
    })

  const paged = pageCount > 1
  const notes = [EXPORT_PAGE_INVENTORY_NOTE]
  if (paged) {
    notes.push(
      `This is inventory page ${page} of ${pageCount}. Fetch every page before treating the returned inventory as complete.`,
    )
  }
  if (input.sourceCapped === true) {
    notes.push(
      'The source import was capped, so rows missing from this inventory are unknown.',
    )
  }
  return {
    rows,
    totalPages: input.pages.length,
    capped: input.sourceCapped === true || paged,
    sourceCapped: input.sourceCapped === true,
    page,
    pageSize: maxRows,
    pageCount,
    nextPage: page < pageCount ? page + 1 : null,
    criteria: [...EXPORT_PAGE_INVENTORY_CRITERIA],
    note: notes.join(' '),
  }
}

/**
 * Title-based topic-overlap heuristic for local exports. The standard Search
 * Console UI export keeps query and page tables separate, so no query-to-page
 * mapping exists. This function only observes that an exported query phrase
 * appears in the titles of two or more distinct crawled pages. That is a
 * candidate for review, never a cannibalisation verdict.
 */
export function topicOverlapCandidates(input: {
  queries: SearchConsoleExportQueryRow[]
  pages: Array<{ url: string; title: string | null | undefined }>
  maxQueries?: number
  maxCandidates?: number
}): TopicOverlapResult {
  const maxQueries = input.maxQueries ?? 50
  const maxCandidates = input.maxCandidates ?? 10

  // Aggregate duplicate query rows deterministically before ranking.
  // Single-word queries are skipped because they over-match titles.
  const totalsByQuery = new Map<
    string,
    { impressions: number; clicks: number }
  >()
  for (const row of input.queries) {
    const query = normalizeText(row.query)
    if (query.split(' ').length < 2) continue
    const totals = totalsByQuery.get(query)
    if (totals) {
      totals.impressions += row.impressions
      totals.clicks += row.clicks
    } else {
      totalsByQuery.set(query, {
        impressions: row.impressions,
        clicks: row.clicks,
      })
    }
  }
  const eligibleQueries = totalsByQuery.size
  const considered = [...totalsByQuery.entries()]
    .map(([query, totals]) => ({ query, ...totals }))
    .sort(
      (left, right) =>
        right.impressions - left.impressions ||
        right.clicks - left.clicks ||
        codePointCompare(left.query, right.query),
    )
    .slice(0, maxQueries)

  // One entry per distinct page path; the codepoint-smallest URL represents
  // a path so identical input always yields identical output.
  const pagesByKey = new Map<
    string,
    { url: string; title: string; normalizedTitle: string }
  >()
  const sortedPages = [...input.pages].sort((left, right) =>
    codePointCompare(left.url, right.url),
  )
  for (const page of sortedPages) {
    if (typeof page.title !== 'string') continue
    const normalizedTitle = normalizeText(page.title)
    if (!normalizedTitle) continue
    const key = pageIdentityKey(page.url)
    if (!pagesByKey.has(key)) {
      pagesByKey.set(key, { url: page.url, title: page.title, normalizedTitle })
    }
  }
  const pagePool = [...pagesByKey.values()]

  const candidates: TopicOverlapCandidate[] = []
  for (const item of considered) {
    const phrase = ` ${item.query} `
    const matches = pagePool.filter((page) =>
      ` ${page.normalizedTitle} `.includes(phrase),
    )
    if (matches.length < 2) continue
    candidates.push({
      query: item.query,
      impressions: item.impressions,
      clicks: item.clicks,
      pages: matches
        .map((page) => ({ url: page.url, title: page.title }))
        .sort((left, right) => codePointCompare(left.url, right.url)),
    })
  }
  candidates.sort(
    (left, right) =>
      right.impressions - left.impressions ||
      right.clicks - left.clicks ||
      codePointCompare(left.query, right.query),
  )
  const queryLimitReached = eligibleQueries > considered.length
  const candidateLimitReached = candidates.length > maxCandidates
  return {
    candidates: candidates.slice(0, maxCandidates),
    eligibleQueries,
    consideredQueries: considered.length,
    queryLimitReached,
    candidateLimitReached,
    capped: queryLimitReached || candidateLimitReached,
  }
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const

type PrefixedFix = {
  fix: TopFix
  prefix: string
  source: 'crawl' | 'unreached'
}

// One queue, best first: a medium issue affecting twelve pages outranks a
// low issue on one page regardless of which crawl pass surfaced it.
function byPriority(left: PrefixedFix, right: PrefixedFix): number {
  const severity =
    SEVERITY_ORDER[left.fix.severity as keyof typeof SEVERITY_ORDER] -
    SEVERITY_ORDER[right.fix.severity as keyof typeof SEVERITY_ORDER]
  if (severity !== 0) return severity
  if (right.fix.count !== left.fix.count)
    return right.fix.count - left.fix.count
  if (right.fix.score !== left.fix.score)
    return right.fix.score - left.fix.score
  return left.fix.ruleId < right.fix.ruleId
    ? -1
    : left.fix.ruleId > right.fix.ruleId
      ? 1
      : 0
}

/**
 * Turn the complete crawl issue inventory into workflow actions so a
 * provider-free report never returns an empty action list while the crawl
 * holds findings. Fixes carry high confidence because the state was
 * observed; review observations stay medium because intent is unconfirmed.
 */
export function technicalCrawlActions(input: {
  topFixes: TopFix[]
  reviewObservations: TopFix[]
  crawlReportId?: string
  reconciliation?: SearchConsoleExportReconciliation
  unreachedAudit?: {
    reportId?: string
    topFixes: TopFix[]
    reviewObservations: TopFix[]
    titlePrefix: string
  }
  topicOverlap?: TopicOverlapResult
  pageInventory?: ExportPageInventory
}): UrlReportAction[] {
  const audit = input.unreachedAudit
  const fixes: PrefixedFix[] = [
    ...input.topFixes.map((fix) => ({
      fix,
      prefix: '',
      source: 'crawl' as const,
    })),
    ...(audit?.topFixes ?? []).map((fix) => ({
      fix,
      prefix: `${audit?.titlePrefix} `,
      source: 'unreached' as const,
    })),
  ].sort(byPriority)
  const reviews: PrefixedFix[] = [
    ...input.reviewObservations.map((fix) => ({
      fix,
      prefix: '',
      source: 'crawl' as const,
    })),
    ...(audit?.reviewObservations ?? []).map((fix) => ({
      fix,
      prefix: `${audit?.titlePrefix} `,
      source: 'unreached' as const,
    })),
  ].sort(byPriority)
  const actions: UrlReportAction[] = []
  for (const { fix, prefix, source } of fixes) {
    const reportId =
      source === 'crawl' ? input.crawlReportId : input.unreachedAudit?.reportId
    actions.push({
      id: `${source}:${fix.ruleId}`,
      kind: 'fix',
      title: `${prefix}${fix.ruleId}: ${fix.title} (${fix.count} URL${fix.count === 1 ? '' : 's'})`,
      action: fix.howToFix,
      confidence: 'high',
      severity: fix.severity,
      affectedCount: fix.count,
      sampleUrls: fix.sampleUrls,
      ...(reportId
        ? {
            affectedUrlsReport: {
              id: 'affected-urls' as const,
              params: { reportId, ruleId: fix.ruleId },
            },
          }
        : {}),
      evidence: {
        ruleId: fix.ruleId,
        source,
        whyThisRanks: fix.whyThisRanks,
      },
      verification: fix.verification,
    })
  }
  // Export-demand findings rank directly after the fix queue: they carry
  // observed impressions, which outrank convention observations that have
  // no demand link.
  const unreached = input.reconciliation
  if (unreached && unreached.unreachedCount > 0) {
    const impressions = unreached.unreachedPages.reduce(
      (sum, row) => sum + row.impressions,
      0,
    )
    actions.push({
      id: 'export:unreached-pages',
      kind: 'review',
      title: `${unreached.unreachedCount} exported page URL${unreached.unreachedCount === 1 ? '' : 's'} with search impressions were not reached by this crawl`,
      action: `These pages carry ${impressions} combined impressions across the ${unreached.unreachedPages.length} retained export rows, but no crawl path reached them. Add internal links or sitemap entries when they should be reachable. The join used URL paths from a local export; treat it as a discovery lead within this crawl bound, not proof of orphan status.`,
      confidence: 'medium',
      affectedCount: unreached.unreachedCount,
      evidence: {
        retainedRows: unreached.unreachedPages.length,
        impressions,
      },
      review: {
        question:
          'Should each retained exported page be reachable from the current site?',
        changeOnlyIf:
          'Add a crawl path only for a page that should remain part of the current site and has no intended exclusion.',
        ifNotNeeded:
          'Record no change for a page that is intentionally retired, excluded, or awaiting an owner decision.',
        doNot: [
          'Do not call a page orphaned from this path-only join.',
          'Do not redirect unrelated pages to one generic destination.',
        ],
      },
      verification: {
        expected:
          'Every retained exported page is reachable in the rerun or explicitly accounted for as deferred or no-change with owner intent.',
      },
    })
  }
  const overlap = input.topicOverlap
  const top = overlap?.candidates[0]
  if (overlap && top) {
    const count = overlap.candidates.length
    const paths = top.pages.map((page) => pageDisplayPath(page.url))
    actions.push({
      id: 'export:topic-overlap',
      kind: 'review',
      title: `topic overlap candidates: ${count} exported ${count === 1 ? 'query appears' : 'queries appear'} in 2+ page titles`,
      action: `Top candidate: "${top.query}" (${top.impressions} impressions, ${top.clicks} clicks) appears in the titles of ${paths.join(' and ')}. This is a title-based heuristic built from the export's separate query and page tables. The export contains no query-to-page mapping, so it cannot show which pages Google served for the query. Verify with the cannibalisation report (seo cannibal) after connecting a Search Console property.`,
      confidence: 'medium',
      affectedCount: count,
      evidence: {
        topQuery: top.query,
        topPages: top.pages,
        impressions: top.impressions,
        clicks: top.clicks,
      },
      review: {
        question:
          'Does query-to-page evidence confirm that these pages compete for the same search intent?',
        changeOnlyIf:
          'Consolidate or redirect only after query-to-page evidence and page intent confirm real overlap.',
        ifNotNeeded:
          'Keep the pages separate and record why their intents differ.',
        doNot: [
          'Do not merge or redirect pages from a title-match heuristic alone.',
        ],
      },
      verification: {
        expected:
          'Confirm intent with query-to-page evidence before consolidating or redirecting either page.',
      },
    })
  }
  const inventory = input.pageInventory
  const topRow = inventory?.rows[0]
  if (inventory && topRow) {
    const counts = { keep: 0, update: 0, review: 0 }
    for (const row of inventory.rows) counts[row.suggestedDisposition] += 1
    const scope = [
      ...(inventory.pageCount > 1
        ? [
            `page ${inventory.page} of ${inventory.pageCount}; ${inventory.rows.length} of ${inventory.totalPages} retained rows`,
          ]
        : []),
      ...(inventory.sourceCapped ? ['source import capped'] : []),
    ]
    const scopeText = scope.length ? ` (${scope.join('; ')})` : ''
    actions.push({
      id: 'export:content-inventory',
      kind: 'review',
      title: `content inventory: ${inventory.rows.length} exported page${inventory.rows.length === 1 ? '' : 's'} tiered with suggested dispositions`,
      action: `Suggested tiers: keep ${counts.keep}, update ${counts.update}, review ${counts.review}${scopeText}. Example: ${topRow.path} (${topRow.clicks} clicks, ${topRow.impressions} impressions, position ${topRow.position ?? 'not in the export'}) is tiered ${topRow.suggestedDisposition} because it ${topRow.tier}. ${inventory.note} Work the inventory page by page instead of applying one blanket policy.`,
      confidence: 'medium',
      affectedCount: inventory.rows.length,
      evidence: { dispositions: counts, capped: inventory.capped },
      review: {
        question:
          'Has every returned inventory row received an evidence-backed disposition?',
        changeOnlyIf:
          'Apply a content change, removal, or redirect only after deciding that row from its own evidence and product relevance.',
        ifConfirmed:
          'Record one disposition and reason for every returned inventory row.',
        ifNotNeeded:
          'Keep a page unchanged when its evidence and current product role support keeping it.',
        doNot: [
          'Do not use one blanket disposition for the inventory.',
          'Do not redirect unrelated URLs to a generic hub.',
        ],
      },
      verification: {
        expected:
          'Every returned inventory row has an owner-confirmed keep, update, or review decision; every inventory page has been fetched; redirected rows resolve to the intended destination.',
      },
    })
  }
  for (const { fix, prefix, source } of reviews) {
    const reportId =
      source === 'crawl' ? input.crawlReportId : input.unreachedAudit?.reportId
    actions.push({
      id: `${source}:${fix.ruleId}`,
      kind: 'review',
      title: `${prefix}${fix.ruleId}: ${fix.title} (${fix.count} URL${fix.count === 1 ? '' : 's'})`,
      action: `Observed state that needs intent confirmation before treating it as a defect. ${fix.howToFix}`,
      confidence: 'medium',
      severity: fix.severity,
      affectedCount: fix.count,
      sampleUrls: fix.sampleUrls,
      ...(reportId
        ? {
            affectedUrlsReport: {
              id: 'affected-urls' as const,
              params: { reportId, ruleId: fix.ruleId },
            },
          }
        : {}),
      evidence: {
        ruleId: fix.ruleId,
        source,
        whyThisRanks: fix.whyThisRanks,
      },
      verification: fix.verification,
    })
  }
  return actions
}

/** Map unreached export URLs onto the crawl origin by path, preserving the
 * reconciliation's join basis, so they can be fetched in this environment. */
export function unreachedUrlsOnCrawlOrigin(
  reconciliation: SearchConsoleExportReconciliation,
  limit: number,
): string[] {
  const urls: string[] = []
  for (const row of reconciliation.unreachedPages.slice(0, limit)) {
    try {
      const parsed = new URL(row.url)
      urls.push(
        `${reconciliation.crawlOrigin}${parsed.pathname}${parsed.search}`,
      )
    } catch {
      /* skip unparseable export URLs */
    }
  }
  return urls
}
