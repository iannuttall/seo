import type {
  SearchConsoleExportEvidence,
  SearchConsoleExportReconciliation,
} from '@seo/core'
import { printTable } from '../../utils.js'
import { truncate } from '../output.js'
import type { ExportPageInventory } from './url-report-evidence.js'

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
    exportedAt: evidence.exportedAt,
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
    ...(input.pageInventory ? { pageInventory: input.pageInventory } : {}),
    warnings: evidence.warnings,
    caveats: evidence.caveats,
  }
}

/** Terminal table for the export page inventory, capped at 15 printed rows. */
export function printExportPageInventory(inventory: ExportPageInventory): void {
  if (!inventory.rows.length) return
  const shown = inventory.rows.slice(0, 15)
  process.stdout.write(
    `\nContent inventory${inventory.pageCount > 1 ? ` page ${inventory.page} of ${inventory.pageCount}` : ''} (${inventory.rows.length} exported page${inventory.rows.length === 1 ? '' : 's'} with suggested dispositions)\n`,
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
  if (inventory.pageCount > 1) {
    process.stdout.write(
      `Showing inventory page ${inventory.page} of ${inventory.pageCount}; ${inventory.totalPages} retained rows are available.\n`,
    )
  }
  process.stdout.write(`${inventory.note}\n`)
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
