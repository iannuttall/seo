import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { SeoError } from '../errors.js'
import type { ImportProgress } from '../imports/records.js'
import {
  csvRecords,
  DEFAULT_IMPORT_STREAM_BYTES,
  importFile,
} from '../imports/records.js'

export const DEFAULT_SEARCH_CONSOLE_EXPORT_ROW_LIMIT = 5_000
export const MAX_SEARCH_CONSOLE_EXPORT_ROW_LIMIT = 100_000
export const MAX_SEARCH_CONSOLE_EXPORT_FILES = 20

export type SearchConsoleExportQueryRow = {
  query: string
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

export type SearchConsoleExportPageRow = {
  url: string
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

export type SearchConsoleExportFileImport = {
  path: string
  table: 'queries' | 'pages' | 'unrecognized'
  sha256: string
  fileBytes: number
  bytesRead: number
  encoding: 'utf-8' | 'utf-16be' | 'utf-16le'
  delimiter: ',' | ';' | '\t' | null
  includedFields: string[]
  fileRows: number
  suppliedRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  capped: boolean
  rowLimit: number
  reason?: string
}

export type SearchConsoleExportEvidence = {
  source: 'search-console-export'
  exportedAt: string | null
  importedAt: string
  files: SearchConsoleExportFileImport[]
  queries: {
    rows: SearchConsoleExportQueryRow[]
    totalRows: number
    capped: boolean
  }
  pages: {
    rows: SearchConsoleExportPageRow[]
    totalRows: number
    capped: boolean
  }
  warnings: string[]
  caveats: string[]
}

const IMPORT_LABEL = 'Search Console export'

const QUERY_TABLE_HEADERS = new Set(['top queries', 'query', 'queries'])
const PAGE_TABLE_HEADERS = new Set(['top pages', 'page', 'pages', 'url'])

const CLICKS_ALIASES = ['clicks', 'url clicks'] as const
const IMPRESSIONS_ALIASES = ['impressions'] as const
const CTR_ALIASES = ['ctr', 'url ctr', 'site ctr'] as const
const POSITION_ALIASES = [
  'position',
  'average position',
  'avg position',
  'avg. position',
] as const

const CAVEATS = [
  'Query and page tables are separate aggregates from a Search Console export; no query-to-page mapping exists and none was created.',
  'Search Console exports are partial: anonymised queries are withheld and export row caps apply, so missing rows are not zeros.',
] as const

type MetricRow = {
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

type TableState<Row extends MetricRow> = {
  byKey: Map<string, Row>
  suppliedRows: number
  capped: boolean
}

function exportRowLimit(value?: number): number {
  const result = value ?? DEFAULT_SEARCH_CONSOLE_EXPORT_ROW_LIMIT
  if (
    !Number.isSafeInteger(result) ||
    result < 1 ||
    result > MAX_SEARCH_CONSOLE_EXPORT_ROW_LIMIT
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `Search Console export row limit must be between 1 and ${MAX_SEARCH_CONSOLE_EXPORT_ROW_LIMIT}.`,
    )
  }
  return result
}

async function exportCsvPaths(input: string): Promise<string[]> {
  const path = resolve(input)
  const target = await stat(path).catch(() => undefined)
  if (!target) {
    throw new SeoError(
      'INVALID_INPUT',
      `Search Console export path was not found: ${path}`,
    )
  }
  if (target.isFile()) return [path]
  if (!target.isDirectory()) {
    throw new SeoError(
      'INVALID_INPUT',
      `Search Console export path must be a CSV file or a directory: ${path}`,
    )
  }
  const entries = await readdir(path, { withFileTypes: true })
  const files = entries
    .filter((entry) => {
      if (!entry.isFile()) return false
      const extension = extname(entry.name).toLowerCase()
      return extension === '.csv' || extension === '.tsv'
    })
    .map((entry) => join(path, entry.name))
    .sort(compareText)
  if (files.length === 0) {
    throw new SeoError(
      'INVALID_INPUT',
      `Search Console export directory contains no CSV files: ${path}`,
    )
  }
  if (files.length > MAX_SEARCH_CONSOLE_EXPORT_FILES) {
    throw new SeoError(
      'INVALID_INPUT',
      `Search Console export directories can contain at most ${MAX_SEARCH_CONSOLE_EXPORT_FILES} CSV files.`,
    )
  }
  return files
}

function normalizedHeader(value: string): string {
  return value
    .replace(/^\uFEFF/u, '')
    .trim()
    .toLowerCase()
}

function metricIndex(
  headers: string[],
  aliases: readonly string[],
): number | null {
  for (const alias of aliases) {
    const index = headers.indexOf(alias)
    if (index > 0) return index
  }
  return null
}

function countValue(cell: string | undefined): number | null {
  const trimmed = (cell ?? '').trim()
  if (!trimmed) return null
  if (!/^\d+(?:,\d{3})*$/u.test(trimmed)) return null
  const parsed = Number(trimmed.replaceAll(',', ''))
  return Number.isSafeInteger(parsed) ? parsed : null
}

function ctrValue(cell: string | undefined): number | null {
  const trimmed = (cell ?? '').trim()
  if (!trimmed) return null
  if (trimmed.endsWith('%')) {
    const parsed = Number(trimmed.slice(0, -1).trim())
    if (!Number.isFinite(parsed)) return null
    const fraction = parsed / 100
    return fraction >= 0 && fraction <= 1 ? fraction : null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null
}

function positionValue(cell: string | undefined): number | null {
  const trimmed = (cell ?? '').trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function absoluteHttpUrl(value: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    ? value
    : null
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function keepImportedRow(candidate: MetricRow, existing: MetricRow): boolean {
  if (candidate.impressions !== existing.impressions) {
    return candidate.impressions > existing.impressions
  }
  return candidate.clicks > existing.clicks
}

function compareQueryRows(
  left: SearchConsoleExportQueryRow,
  right: SearchConsoleExportQueryRow,
): number {
  return (
    right.clicks - left.clicks ||
    right.impressions - left.impressions ||
    compareText(left.query, right.query)
  )
}

function comparePageRows(
  left: SearchConsoleExportPageRow,
  right: SearchConsoleExportPageRow,
): number {
  return (
    right.impressions - left.impressions ||
    right.clicks - left.clicks ||
    compareText(left.url, right.url)
  )
}

function tableOutput<Row extends MetricRow>(
  state: TableState<Row>,
  compare: (left: Row, right: Row) => number,
  rowLimit: number,
): { rows: Row[]; totalRows: number; capped: boolean } {
  const sorted = [...state.byKey.values()].sort(compare)
  const capped = state.capped || sorted.length > rowLimit
  return {
    rows: sorted.slice(0, rowLimit),
    totalRows: sorted.length,
    capped,
  }
}

export async function loadSearchConsoleExport(input: {
  path: string
  rowLimit?: number
  now?: Date
  exportedAt?: Date
}): Promise<SearchConsoleExportEvidence> {
  const rowLimit = exportRowLimit(input.rowLimit)
  const paths = await exportCsvPaths(input.path)
  const files: SearchConsoleExportFileImport[] = []
  const warnings: string[] = []
  const queryState: TableState<SearchConsoleExportQueryRow> = {
    byKey: new Map(),
    suppliedRows: 0,
    capped: false,
  }
  const pageState: TableState<SearchConsoleExportPageRow> = {
    byKey: new Map(),
    suppliedRows: 0,
    capped: false,
  }

  for (const path of paths) {
    const file = await importFile({
      file: path,
      format: 'csv',
      label: IMPORT_LABEL,
    })
    const hash = createHash('sha256')
    const progress: ImportProgress = { bytesRead: 0, hash }
    const records = csvRecords({
      path: file.path,
      byteLimit: DEFAULT_IMPORT_STREAM_BYTES,
      progress,
      label: IMPORT_LABEL,
    })

    const first = await records.next()
    const rawHeaders = Array.isArray(first.value) ? first.value : []
    const headers = rawHeaders.map((value, index) =>
      (index === 0 ? value.replace(/^\uFEFF/u, '') : value).trim(),
    )
    const normalizedHeaders = headers.map(normalizedHeader)
    const firstHeader = normalizedHeaders[0] ?? ''
    const table: SearchConsoleExportFileImport['table'] =
      QUERY_TABLE_HEADERS.has(firstHeader)
        ? 'queries'
        : PAGE_TABLE_HEADERS.has(firstHeader)
          ? 'pages'
          : 'unrecognized'
    const headerReason =
      table === 'unrecognized'
        ? headers.length === 0
          ? 'The file has no header row.'
          : `The first header "${headers[0]}" is not a recognized Search Console query or page column.`
        : undefined

    const clicksIndex = metricIndex(normalizedHeaders, CLICKS_ALIASES)
    const impressionsIndex = metricIndex(normalizedHeaders, IMPRESSIONS_ALIASES)
    const ctrIndex = metricIndex(normalizedHeaders, CTR_ALIASES)
    const positionIndex = metricIndex(normalizedHeaders, POSITION_ALIASES)
    const missingRequiredFields = [
      ...(clicksIndex === null ? ['Clicks'] : []),
      ...(impressionsIndex === null ? ['Impressions'] : []),
    ]
    const reason =
      headerReason ??
      (missingRequiredFields.length
        ? `The recognized ${table} table is missing required ${missingRequiredFields.join(' and ')} columns.`
        : undefined)
    const usable = table !== 'unrecognized' && reason === undefined

    let fileRows = 0
    let suppliedRows = 0
    let validRows = 0
    let invalidRows = 0
    let duplicateRows = 0
    const tableState = table === 'queries' ? queryState : pageState

    for await (const values of records) {
      fileRows += 1
      if (!usable) continue
      if (tableState.suppliedRows >= rowLimit) continue
      suppliedRows += 1
      tableState.suppliedRows += 1
      if (values.length !== headers.length) {
        invalidRows += 1
        continue
      }
      const clicks = countValue(values[clicksIndex ?? -1])
      const impressions = countValue(values[impressionsIndex ?? -1])
      if (clicks === null || impressions === null) {
        invalidRows += 1
        continue
      }
      const ctrCell = ctrIndex === null ? '' : (values[ctrIndex] ?? '').trim()
      const positionCell =
        positionIndex === null ? '' : (values[positionIndex] ?? '').trim()
      const ctr = ctrIndex === null ? null : ctrValue(ctrCell)
      const position =
        positionIndex === null ? null : positionValue(positionCell)
      if ((ctrCell && ctr === null) || (positionCell && position === null)) {
        invalidRows += 1
        continue
      }
      const metrics: MetricRow = {
        clicks,
        impressions,
        ctr,
        position,
      }
      const key = (values[0] ?? '').trim()
      if (table === 'queries') {
        if (!key) {
          invalidRows += 1
          continue
        }
        const existing = queryState.byKey.get(key)
        if (existing) {
          duplicateRows += 1
          if (keepImportedRow(metrics, existing)) {
            queryState.byKey.set(key, { query: key, ...metrics })
          }
          continue
        }
        validRows += 1
        queryState.byKey.set(key, { query: key, ...metrics })
        continue
      }
      const url = absoluteHttpUrl(key)
      if (!url) {
        invalidRows += 1
        continue
      }
      const existing = pageState.byKey.get(url)
      if (existing) {
        duplicateRows += 1
        if (keepImportedRow(metrics, existing)) {
          pageState.byKey.set(url, { url, ...metrics })
        }
        continue
      }
      validRows += 1
      pageState.byKey.set(url, { url, ...metrics })
    }

    const capped = usable && fileRows > suppliedRows
    if (capped) {
      if (table === 'queries') queryState.capped = true
      else pageState.capped = true
      warnings.push(
        `Only ${suppliedRows} of ${fileRows} rows in ${file.path} were processed within the shared ${table} row limit of ${rowLimit}.`,
      )
    }
    if (reason) {
      warnings.push(
        `Skipped ${file.path}: ${reason ?? 'the file was not recognized.'}`,
      )
    }
    if (invalidRows > 0) {
      warnings.push(
        `${invalidRows} row${invalidRows === 1 ? '' : 's'} in ${file.path} ${invalidRows === 1 ? 'was' : 'were'} invalid and skipped.`,
      )
    }

    files.push({
      path: file.path,
      table,
      sha256: hash.digest('hex'),
      fileBytes: file.fileBytes,
      bytesRead: progress.bytesRead,
      encoding: progress.encoding ?? 'utf-8',
      delimiter: progress.delimiter ?? null,
      includedFields: [...headers].sort(compareText),
      fileRows,
      suppliedRows,
      validRows,
      invalidRows,
      duplicateRows,
      capped,
      rowLimit,
      ...(reason === undefined ? {} : { reason }),
    })
  }

  if (files.every((file) => file.table === 'unrecognized')) {
    warnings.push(
      'No file matched the Search Console query or page table headers, so no rows were imported.',
    )
  }

  return {
    source: 'search-console-export',
    exportedAt: input.exportedAt?.toISOString() ?? null,
    importedAt: (input.now ?? new Date()).toISOString(),
    files,
    queries: tableOutput(queryState, compareQueryRows, rowLimit),
    pages: tableOutput(pageState, comparePageRows, rowLimit),
    warnings,
    caveats: [
      ...CAVEATS,
      input.exportedAt
        ? 'exportedAt was supplied by the caller and is not verified from the file; importedAt records when the local files were loaded.'
        : 'The export time is unavailable unless supplied separately; importedAt records when the local files were loaded, not when Search Console produced them.',
    ],
  }
}
