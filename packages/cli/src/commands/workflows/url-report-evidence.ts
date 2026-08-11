import type {
  SearchConsoleExportEvidence,
  SearchConsoleExportPageRow,
  SearchConsoleExportQueryRow,
  SearchConsoleExportReconciliation,
  TopFix,
} from '@seo/core'
import { printTable } from '../../utils.js'
import { truncate } from '../output.js'

export type UrlReportAction = {
  title: string
  action: string
  confidence: 'high' | 'medium' | 'low'
}

export type TopicOverlapCandidate = {
  query: string
  impressions: number
  clicks: number
  pages: Array<{ url: string; title: string }>
}

export type TopicOverlapResult = {
  candidates: TopicOverlapCandidate[]
  consideredQueries: number
  capped: boolean
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
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
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
  reachedByCrawl: boolean
  title: string | null
  overlapQuery: string | null
  suggestedDisposition: 'keep' | 'update' | 'consolidate' | 'review'
  tier: string
}

export type ExportPageInventory = {
  rows: ExportPageInventoryRow[]
  totalPages: number
  capped: boolean
  criteria: string[]
}

// Average positions past this value sit outside the usual two result pages.
// It is an arbitrary review threshold, not a search engine rule.
const WEAK_POSITION_THRESHOLD = 20

// The ordered tier rules; the first matching rule wins. Kept as data so every
// inventory result carries its own methodology.
const EXPORT_PAGE_INVENTORY_CRITERIA: readonly string[] = [
  'consolidate: shares a search phrase with another page title',
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
}): ExportPageInventory {
  const maxRows = input.maxRows ?? 50

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
  const rows = sortedPages
    .slice(0, maxRows)
    .map((page): ExportPageInventoryRow => {
      const joinPath = normalizedJoinPath(page.url)
      // An unparseable export URL was never joined or fetched, so it cannot
      // count as reached.
      const reachedByCrawl = joinPath !== null && !unreachedPaths.has(joinPath)
      const title =
        joinPath !== null ? (titlesByPath.get(joinPath) ?? null) : null
      const overlapQuery =
        joinPath !== null ? (overlapQueryByPath.get(joinPath) ?? null) : null
      let suggestedDisposition: ExportPageInventoryRow['suggestedDisposition']
      let tier: string
      if (overlapQuery !== null) {
        suggestedDisposition = 'consolidate'
        tier = 'shares a search phrase with another page title'
      } else if (page.clicks > 0) {
        suggestedDisposition = 'keep'
        tier = 'has clicks in the export window'
      } else if (page.impressions > 0 && !reachedByCrawl) {
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

  return {
    rows,
    totalPages: input.pages.length,
    capped: input.pages.length > maxRows,
    criteria: [...EXPORT_PAGE_INVENTORY_CRITERIA],
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
    const matches = pagePool.filter((page) =>
      page.normalizedTitle.includes(item.query),
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
  const capped = candidates.length > maxCandidates
  return {
    candidates: candidates.slice(0, maxCandidates),
    consideredQueries: considered.length,
    capped,
  }
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const

type PrefixedFix = { fix: TopFix; prefix: string }

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
  reconciliation?: SearchConsoleExportReconciliation
  unreachedAudit?: {
    topFixes: TopFix[]
    reviewObservations: TopFix[]
    titlePrefix: string
  }
  topicOverlap?: TopicOverlapResult
  pageInventory?: ExportPageInventory
}): UrlReportAction[] {
  const audit = input.unreachedAudit
  const fixes: PrefixedFix[] = [
    ...input.topFixes.map((fix) => ({ fix, prefix: '' })),
    ...(audit?.topFixes ?? []).map((fix) => ({
      fix,
      prefix: `${audit?.titlePrefix} `,
    })),
  ].sort(byPriority)
  const reviews: PrefixedFix[] = [
    ...input.reviewObservations.map((fix) => ({ fix, prefix: '' })),
    ...(audit?.reviewObservations ?? []).map((fix) => ({
      fix,
      prefix: `${audit?.titlePrefix} `,
    })),
  ].sort(byPriority)
  const actions: UrlReportAction[] = []
  for (const { fix, prefix } of fixes) {
    actions.push({
      title: `${prefix}${fix.ruleId}: ${fix.title} (${fix.count} URL${fix.count === 1 ? '' : 's'})`,
      action: `${fix.howToFix} Verify: ${fix.howToVerify}`,
      confidence: 'high',
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
      title: `${unreached.unreachedCount} exported page URL${unreached.unreachedCount === 1 ? '' : 's'} with search impressions were not reached by this crawl`,
      action: `These pages carry ${impressions} combined impressions across the ${unreached.unreachedPages.length} retained export rows, but no crawl path reached them. Add internal links or sitemap entries when they should be reachable. The join used URL paths from a local export; treat it as a discovery lead within this crawl bound, not proof of orphan status.`,
      confidence: 'medium',
    })
  }
  const overlap = input.topicOverlap
  const top = overlap?.candidates[0]
  if (overlap && top) {
    const count = overlap.candidates.length
    const paths = top.pages.map((page) => pageDisplayPath(page.url))
    actions.push({
      title: `topic overlap candidates: ${count} exported ${count === 1 ? 'query appears' : 'queries appear'} in 2+ page titles`,
      action: `Top candidate: "${top.query}" (${top.impressions} impressions, ${top.clicks} clicks) appears in the titles of ${paths.join(' and ')}. This is a title-based heuristic built from the export's separate query and page tables. The export contains no query-to-page mapping, so it cannot show which pages Google served for the query. Verify with the cannibalisation report (seo cannibal) after connecting a Search Console property.`,
      confidence: 'medium',
    })
  }
  const inventory = input.pageInventory
  const topRow = inventory?.rows[0]
  if (inventory && topRow) {
    const counts = { keep: 0, update: 0, consolidate: 0, review: 0 }
    for (const row of inventory.rows) counts[row.suggestedDisposition] += 1
    const scope = inventory.capped
      ? ` (top ${inventory.rows.length} of ${inventory.totalPages} export page rows by impressions)`
      : ''
    actions.push({
      title: `content inventory: ${inventory.rows.length} exported page${inventory.rows.length === 1 ? '' : 's'} tiered with suggested dispositions`,
      action: `Suggested tiers: keep ${counts.keep}, update ${counts.update}, consolidate ${counts.consolidate}, review ${counts.review}${scope}. Example: ${topRow.path} (${topRow.clicks} clicks, ${topRow.impressions} impressions, position ${topRow.position ?? 'not in the export'}) is tiered ${topRow.suggestedDisposition} because it ${topRow.tier}. ${EXPORT_PAGE_INVENTORY_NOTE} Work the inventory page by page instead of applying one blanket policy.`,
      confidence: 'medium',
    })
  }
  for (const { fix, prefix } of reviews) {
    actions.push({
      title: `${prefix}${fix.ruleId}: ${fix.title} (${fix.count} URL${fix.count === 1 ? '' : 's'})`,
      action: `Observed state that needs intent confirmation before treating it as a defect. ${fix.howToFix} Verify: ${fix.howToVerify}`,
      confidence: 'medium',
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

export function searchConsoleExportSection(input: {
  evidence: SearchConsoleExportEvidence
  reconciliation?: SearchConsoleExportReconciliation
  pageInventory?: ExportPageInventory
  topRows?: number
}) {
  const topRows = input.topRows ?? 20
  const { evidence } = input
  return {
    source: evidence.source,
    importedAt: evidence.importedAt,
    files: evidence.files,
    queries: {
      totalRows: evidence.queries.totalRows,
      capped: evidence.queries.capped,
      topRowsShown: Math.min(topRows, evidence.queries.rows.length),
      rows: evidence.queries.rows.slice(0, topRows),
    },
    pages: {
      totalRows: evidence.pages.totalRows,
      capped: evidence.pages.capped,
      topRowsShown: Math.min(topRows, evidence.pages.rows.length),
      rows: evidence.pages.rows.slice(0, topRows),
    },
    ...(input.reconciliation ? { reconciliation: input.reconciliation } : {}),
    ...(input.pageInventory
      ? {
          pageInventory: {
            ...input.pageInventory,
            note: EXPORT_PAGE_INVENTORY_NOTE,
          },
        }
      : {}),
    warnings: evidence.warnings,
    caveats: evidence.caveats,
  }
}

/** Terminal table for the export page inventory, capped at 15 printed rows. */
export function printExportPageInventory(inventory: ExportPageInventory): void {
  if (!inventory.rows.length) return
  const shown = inventory.rows.slice(0, 15)
  process.stdout.write(
    `\nContent inventory (${inventory.rows.length} exported page${inventory.rows.length === 1 ? '' : 's'} with suggested dispositions)\n`,
  )
  printTable(
    ['Path', 'Clicks', 'Impressions', 'Position', 'Suggested'],
    shown.map((row) => [
      truncate(row.path, 48),
      row.clicks,
      row.impressions,
      row.position ?? '-',
      row.suggestedDisposition,
    ]),
  )
  if (inventory.rows.length > shown.length) {
    process.stdout.write(
      `Showing ${shown.length} of ${inventory.rows.length} tiered rows.\n`,
    )
  }
  if (inventory.capped) {
    process.stdout.write(
      `Tiered the top ${inventory.rows.length} of ${inventory.totalPages} export page rows by impressions.\n`,
    )
  }
  process.stdout.write(`${EXPORT_PAGE_INVENTORY_NOTE}\n`)
}

export function exportSummarySentence(input: {
  evidence: SearchConsoleExportEvidence
  reconciliation?: SearchConsoleExportReconciliation
}): string {
  const queries = input.evidence.queries.totalRows
  const pages = input.evidence.pages.totalRows
  const base = `Loaded a local Search Console export (${queries} query row${queries === 1 ? '' : 's'}, ${pages} page row${pages === 1 ? '' : 's'}).`
  if (!input.reconciliation) return base
  const unreached = input.reconciliation.unreachedCount
  if (unreached === 0) {
    return `${base} Every exported page URL was reached by the crawl.`
  }
  return `${base} ${unreached} exported page URL${unreached === 1 ? '' : 's'} with impressions were not reached by this crawl.`
}

export function issueCountSummarySentence(summary: {
  highIssues: number
  mediumIssues: number
  lowIssues: number
  crawledUrls: number
}): string {
  const pages = summary.crawledUrls
  return `Found ${summary.highIssues} high, ${summary.mediumIssues} medium, and ${summary.lowIssues} low technical issues across ${pages} crawled ${pages === 1 ? 'page' : 'pages'}.`
}
