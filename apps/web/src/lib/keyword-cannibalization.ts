// Reads a Search Console query and page export in the browser and runs the
// same cannibalization rules as `seo report --section cannibalization`.
// Nothing leaves the tab.
//
// Search Console's own Export button writes separate Queries and Pages
// tables, so it never says which pages showed for which query. The pairs
// come from an API export (Search Analytics for Sheets, Looker Studio). The
// normal export's Queries table, when added, is the query-level demand the
// report reads from its second Search Console call.

import {
  analyzeCannibalRows,
  type CannibalAnalysis,
  type CannibalReport,
  cannibalDataStatus,
} from '@seo/core/cannibal/browser'
import {
  EXPORT_LIMITS,
  ExportError,
  type ExportTable,
  parseCsv,
  parseNumber,
  parseTable,
  readExportFiles,
} from './search-console-export.ts'

type Row = {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type PairExport = {
  name: string
  rows: Row[]
  capped: boolean
}

export type CannibalCheck = {
  site: string
  status: CannibalReport['dataStatus']
  analysis: CannibalAnalysis
  pairs: { name: string; capped: boolean }
  queries: { name: string; capped: boolean } | null
}

const QUERY_HEADERS = new Set([
  'query',
  'queries',
  'top queries',
  'search query',
])
const PAGE_HEADERS = new Set([
  'page',
  'pages',
  'top pages',
  'landing page',
  'url',
  'address',
])

const metric = (value: string | undefined) => parseNumber(value) ?? Number.NaN

/** A query and page table, or null when the file is not one. */
export function parsePairs(name: string, text: string): PairExport | null {
  const [header, ...body] = parseCsv(text)
  if (!header) return null
  const titles = header.map((title) => title.trim().toLowerCase())
  const query = titles.findIndex((title) => QUERY_HEADERS.has(title))
  const page = titles.findIndex((title) => PAGE_HEADERS.has(title))
  const clicks = titles.findIndex((title) => title.endsWith('clicks'))
  const impressions = titles.findIndex((title) => title.endsWith('impressions'))
  const position = titles.findIndex((title) => title.includes('position'))
  if (query < 0 || page < 0) return null
  if (clicks < 0 || impressions < 0 || position < 0) {
    throw new ExportError(
      `${name} has query and page columns but not clicks, impressions and position. Export all three with the query and page.`,
    )
  }
  // Every row goes to the rules, which count the ones they cannot read.
  const rows = body.slice(0, EXPORT_LIMITS.rows).map((cells): Row => {
    const rowClicks = metric(cells[clicks])
    const rowImpressions = metric(cells[impressions])
    return {
      keys: [cells[query]?.trim() ?? '', cells[page]?.trim() ?? ''],
      clicks: rowClicks,
      impressions: rowImpressions,
      ctr: rowClicks / rowImpressions,
      position: metric(cells[position]),
    }
  })
  return { name, rows, capped: body.length > EXPORT_LIMITS.rows }
}

export type LoadedExport = {
  pairs: PairExport
  queries: ExportTable | null
  queriesName: string | null
}

export async function readCannibalExport(files: File[]): Promise<LoadedExport> {
  let pairs: PairExport | null = null
  let queries: ExportTable | null = null
  let queriesName: string | null = null
  let pagesOnly = false
  for (const entry of await readExportFiles(files)) {
    const pairTable = parsePairs(entry.name, entry.text)
    if (pairTable) {
      pairs ??= pairTable
      continue
    }
    const table = parseTable(entry.name, entry.text)
    if (table?.kind === 'queries' && !queries) {
      queries = table
      queriesName = entry.name.split('/').at(-1) ?? entry.name
    }
    if (table?.kind === 'pages') pagesOnly = true
  }
  if (!pairs) {
    throw new ExportError(
      queries || pagesOnly
        ? 'This is the export from the Search Console Export button. Its Queries and Pages tables are separate, so it cannot show which pages share a query. Add a query and page export as well (see the steps below).'
        : 'No query and page table found. The file needs a query column, a page or URL column, and clicks, impressions and position.',
    )
  }
  return { pairs, queries, queriesName }
}

/** The host most of the page URLs use, as a site URL. */
export function siteFromRows(rows: Row[]): string {
  const counts = new Map<string, number>()
  for (const row of rows) {
    try {
      const host = new URL(row.keys[1] ?? '').host
      counts.set(host, (counts.get(host) ?? 0) + 1)
    } catch {}
  }
  const [host] =
    [...counts.entries()].sort(
      (left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1),
    )[0] ?? []
  return host ? `https://${host}/` : ''
}

/** The site URL for a typed domain or URL, else the one the pages use. */
export function siteUrl(typed: string, rows: Row[]): string {
  const value = typed.trim()
  if (!value) return siteFromRows(rows)
  return /^(https?:\/\/|sc-domain:)/i.test(value) ? value : `https://${value}/`
}

export function checkCannibalization(input: {
  site: string
  pairs: PairExport
  queries: ExportTable | null
  queriesName?: string | null
}): CannibalCheck {
  const site = siteUrl(input.site, input.pairs.rows)
  const propertyRows = input.queries?.rows.map(
    (row): Row => ({
      keys: [row.label],
      clicks: row.current.clicks,
      impressions: row.current.impressions,
      ctr: row.current.ctr ?? row.current.clicks / row.current.impressions,
      position: row.current.position ?? Number.NaN,
    }),
  )
  // The same filters the report section passes: brand queries left out and
  // up to 100 candidates.
  const analysis = analyzeCannibalRows({
    site,
    rows: input.pairs.rows,
    propertyRows,
    limit: 100,
    includeBrand: false,
  })
  const capped = input.pairs.capped || Boolean(input.queries?.capped)
  return {
    site,
    status: cannibalDataStatus(analysis.selection, capped),
    analysis,
    pairs: { name: input.pairs.name, capped: input.pairs.capped },
    queries: input.queries
      ? {
          name: input.queriesName ?? 'Queries.csv',
          capped: input.queries.capped,
        }
      : null,
  }
}

const csvCell = (value: string | number) => {
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per competing page, in the order shown. */
export function cannibalCsv(check: CannibalCheck): string {
  const lines = [
    [
      'query',
      'query_impressions',
      'page',
      'page_impressions',
      'impression_share',
      'clicks',
      'position',
      'first_to_review',
    ].join(','),
  ]
  for (const item of check.analysis.items) {
    for (const page of item.pages) {
      lines.push(
        [
          item.query,
          item.propertyImpressions ?? '',
          page.url,
          page.impressions,
          page.impressionShare,
          page.clicks,
          page.position,
          page.url === item.suggestedOwnerUrl ? 'yes' : '',
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return `${lines.join('\n')}\n`
}
