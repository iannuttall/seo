import type { CrawlerPathSummary, ServerLogEvidence } from './types.js'

export const SERVER_LOG_CSV_NAMES = [
  'crawler-summary',
  'crawler-paths',
  'crawler-errors',
  'status-codes',
] as const

export type ServerLogCsvName = (typeof SERVER_LOG_CSV_NAMES)[number]

export const SERVER_LOG_CSV_LIMITS = Object.freeze({
  maximumRows: 25_000,
  maximumBytes: 5_000_000,
})

export type ServerLogCsvFile = {
  name: ServerLogCsvName
  filename: `${ServerLogCsvName}.csv`
  content: string
  bytes: number
  rowsAvailable: number
  rowsReturned: number
  omittedRows: number
  capped: boolean
}

type CsvValue = string | number

function csvCell(value: CsvValue): string {
  const text = String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csvLine(values: readonly CsvValue[]): string {
  return `${values.map(csvCell).join(',')}\n`
}

function codepointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareErrorPath(
  a: CrawlerPathSummary,
  b: CrawlerPathSummary,
): number {
  const aErrors = a.clientError + a.serverError
  const bErrors = b.clientError + b.serverError
  return (
    bErrors - aErrors ||
    b.requests - a.requests ||
    codepointCompare(a.family, b.family) ||
    codepointCompare(a.path, b.path)
  )
}

export function serverLogErrorPaths(
  evidence: ServerLogEvidence,
): CrawlerPathSummary[] {
  return evidence.crawlerPaths
    .filter((row) => row.clientError > 0 || row.serverError > 0)
    .sort(compareErrorPath)
}

function tableFor(
  evidence: ServerLogEvidence,
  name: ServerLogCsvName,
): { headers: string[]; rows: CsvValue[][] } {
  if (name === 'crawler-summary') {
    return {
      headers: [
        'crawler',
        'category',
        'requests',
        'success_2xx',
        'redirect_3xx',
        'client_error_4xx',
        'server_error_5xx',
        'other_status',
        'last_seen_at',
      ],
      rows: evidence.crawlers.map((row) => [
        row.family,
        row.category,
        row.requests,
        row.success,
        row.redirect,
        row.clientError,
        row.serverError,
        row.other,
        row.lastSeenAt,
      ]),
    }
  }
  if (name === 'crawler-paths') {
    return {
      headers: [
        'crawler',
        'category',
        'path',
        'requests',
        'success_2xx',
        'redirect_3xx',
        'client_error_4xx',
        'server_error_5xx',
        'other_status',
        'last_seen_at',
      ],
      rows: evidence.crawlerPaths.map((row) => [
        row.family,
        row.category,
        row.path,
        row.requests,
        row.success,
        row.redirect,
        row.clientError,
        row.serverError,
        row.other,
        row.lastSeenAt,
      ]),
    }
  }
  if (name === 'crawler-errors') {
    return {
      headers: [
        'crawler',
        'category',
        'path',
        'requests',
        'client_error_4xx',
        'server_error_5xx',
        'last_seen_at',
      ],
      rows: serverLogErrorPaths(evidence).map((row) => [
        row.family,
        row.category,
        row.path,
        row.requests,
        row.clientError,
        row.serverError,
        row.lastSeenAt,
      ]),
    }
  }
  return {
    headers: ['status', 'requests'],
    rows: evidence.statusCodes.map((row) => [row.status, row.requests]),
  }
}

export function renderServerLogCsv(
  evidence: ServerLogEvidence,
  name: ServerLogCsvName,
  options: { maximumRows?: number; maximumBytes?: number } = {},
): ServerLogCsvFile {
  const maximumRows = options.maximumRows ?? SERVER_LOG_CSV_LIMITS.maximumRows
  const maximumBytes =
    options.maximumBytes ?? SERVER_LOG_CSV_LIMITS.maximumBytes
  if (!Number.isInteger(maximumRows) || maximumRows < 1) {
    throw new Error('Server log CSV row limit must be a positive integer.')
  }
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('Server log CSV byte limit must be a positive integer.')
  }

  const encoder = new TextEncoder()
  const table = tableFor(evidence, name)
  const header = csvLine(table.headers)
  const headerBytes = encoder.encode(header).byteLength
  if (headerBytes > maximumBytes) {
    throw new Error('Server log CSV byte limit is too small for the header.')
  }

  const parts = [header]
  let bytes = headerBytes
  let rowsReturned = 0
  for (const row of table.rows) {
    if (rowsReturned >= maximumRows) break
    const line = csvLine(row)
    const lineBytes = encoder.encode(line).byteLength
    if (bytes + lineBytes > maximumBytes) break
    parts.push(line)
    bytes += lineBytes
    rowsReturned += 1
  }

  return {
    name,
    filename: `${name}.csv`,
    content: parts.join(''),
    bytes,
    rowsAvailable: table.rows.length,
    rowsReturned,
    omittedRows: table.rows.length - rowsReturned,
    capped: rowsReturned < table.rows.length,
  }
}
