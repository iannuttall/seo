import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { SeoError } from '../errors.js'
import {
  addStatus,
  emptyStatusBreakdown,
  parseCombinedLogLine,
  parseJsonLogLine,
} from './parse.js'
import type {
  CrawlerPathSummary,
  CrawlerSummary,
  ServerLogEvidence,
  ServerLogFormat,
  ServerLogRecord,
} from './types.js'

const DEFAULT_ROW_LIMIT = 1_000_000
const MAX_ROW_LIMIT = 10_000_000
const DEFAULT_PATH_LIMIT = 25_000
const MAX_PATH_LIMIT = 100_000
const BYTE_LIMIT = 1_000_000_000
const MAX_LINE_BYTES = 65_536

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  const result = value ?? fallback
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw new SeoError(
      'INVALID_INPUT',
      `${label} must be between 1 and ${maximum}.`,
    )
  }
  return result
}

function formatFor(path: string, explicit?: ServerLogFormat): ServerLogFormat {
  if (explicit) return explicit
  const extension = extname(path).toLowerCase()
  return ['.jsonl', '.ndjson'].includes(extension) ? 'jsonl' : 'combined'
}

type LineItem = { line?: string; tooLong?: true }

async function* lines(
  path: string,
  progress: { bytesRead: number; bytesCapped: boolean },
): AsyncGenerator<LineItem> {
  const stream = createReadStream(path, {
    encoding: 'utf8',
    highWaterMark: 64 * 1_024,
  })
  let remainder = ''
  let discarding = false
  for await (const chunk of stream) {
    const remainingBytes = BYTE_LIMIT - progress.bytesRead
    if (remainingBytes <= 0) {
      progress.bytesCapped = true
      break
    }
    const chunkBytes = Buffer.byteLength(chunk)
    const accepted =
      chunkBytes > remainingBytes
        ? Buffer.from(chunk).subarray(0, remainingBytes).toString('utf8')
        : chunk
    progress.bytesRead += Buffer.byteLength(accepted)
    if (chunkBytes > remainingBytes) progress.bytesCapped = true

    remainder += accepted
    let newline = remainder.indexOf('\n')
    while (newline >= 0) {
      const line = remainder.slice(0, newline).replace(/\r$/, '')
      remainder = remainder.slice(newline + 1)
      if (discarding || Buffer.byteLength(line) > MAX_LINE_BYTES) {
        yield { tooLong: true }
        discarding = false
      } else if (line.trim()) {
        yield { line }
      }
      newline = remainder.indexOf('\n')
    }
    if (Buffer.byteLength(remainder) > MAX_LINE_BYTES) {
      remainder = ''
      discarding = true
    }
    if (progress.bytesCapped) break
  }
  if (discarding || Buffer.byteLength(remainder) > MAX_LINE_BYTES) {
    yield { tooLong: true }
  } else if (remainder.trim()) {
    yield { line: remainder.replace(/\r$/, '') }
  }
}

function compareCrawler(a: CrawlerSummary, b: CrawlerSummary): number {
  return b.requests - a.requests || a.family.localeCompare(b.family, 'en')
}

function compareCrawlerPath(
  a: CrawlerPathSummary,
  b: CrawlerPathSummary,
): number {
  return (
    b.requests - a.requests ||
    a.family.localeCompare(b.family, 'en') ||
    a.path.localeCompare(b.path, 'en')
  )
}

function updatePeriod(
  timestamp: string,
  period: { firstSeenAt?: string; lastSeenAt?: string },
): void {
  if (!period.firstSeenAt || timestamp < period.firstSeenAt) {
    period.firstSeenAt = timestamp
  }
  if (!period.lastSeenAt || timestamp > period.lastSeenAt) {
    period.lastSeenAt = timestamp
  }
}

function newCrawler(record: ServerLogRecord): CrawlerSummary {
  const crawler = record.crawler
  if (!crawler) throw new Error('Crawler evidence is required.')
  return {
    family: crawler.family,
    category: crawler.category,
    requests: 0,
    lastSeenAt: record.timestamp,
    ...emptyStatusBreakdown(),
  }
}

function newCrawlerPath(record: ServerLogRecord): CrawlerPathSummary {
  return {
    ...newCrawler(record),
    path: record.path,
  }
}

export async function importServerLog(input: {
  file: string
  format?: ServerLogFormat
  rowLimit?: number
  pathLimit?: number
}): Promise<ServerLogEvidence> {
  const path = resolve(input.file)
  const file = await stat(path).catch(() => undefined)
  if (!file?.isFile()) {
    throw new SeoError('INVALID_INPUT', `Server log was not found: ${path}`)
  }
  const format = formatFor(path, input.format)
  const rowLimit = boundedInteger(
    input.rowLimit,
    DEFAULT_ROW_LIMIT,
    MAX_ROW_LIMIT,
    'Server log row limit',
  )
  const pathLimit = boundedInteger(
    input.pathLimit,
    DEFAULT_PATH_LIMIT,
    MAX_PATH_LIMIT,
    'Server log path limit',
  )
  const parse = format === 'jsonl' ? parseJsonLogLine : parseCombinedLogLine
  const progress = { bytesRead: 0, bytesCapped: false }
  const period: { firstSeenAt?: string; lastSeenAt?: string } = {}
  const statusCodes = new Map<number, number>()
  const crawlers = new Map<string, CrawlerSummary>()
  const crawlerPaths = new Map<string, CrawlerPathSummary>()
  let suppliedRows = 0
  let parsedRows = 0
  let invalidRows = 0
  let crawlerRows = 0
  let responseBytes = 0
  let rowsCapped = false
  let pathsCapped = false
  let untrackedCrawlerPathRows = 0

  for await (const item of lines(path, progress)) {
    if (suppliedRows >= rowLimit) {
      rowsCapped = true
      break
    }
    suppliedRows += 1
    const parsed = item.line ? parse(item.line) : undefined
    if (!parsed) {
      invalidRows += 1
      continue
    }
    parsedRows += 1
    responseBytes += parsed.bytes ?? 0
    updatePeriod(parsed.timestamp, period)
    statusCodes.set(parsed.status, (statusCodes.get(parsed.status) ?? 0) + 1)
    if (!parsed.crawler) continue

    crawlerRows += 1
    const crawler = crawlers.get(parsed.crawler.family) ?? newCrawler(parsed)
    crawler.requests += 1
    if (parsed.timestamp > crawler.lastSeenAt)
      crawler.lastSeenAt = parsed.timestamp
    addStatus(crawler, parsed.status)
    crawlers.set(parsed.crawler.family, crawler)

    const key = `${parsed.crawler.family}\u0000${parsed.path}`
    let crawlerPath = crawlerPaths.get(key)
    if (!crawlerPath && crawlerPaths.size >= pathLimit) {
      pathsCapped = true
      untrackedCrawlerPathRows += 1
      continue
    }
    crawlerPath ??= newCrawlerPath(parsed)
    crawlerPath.requests += 1
    if (parsed.timestamp > crawlerPath.lastSeenAt) {
      crawlerPath.lastSeenAt = parsed.timestamp
    }
    addStatus(crawlerPath, parsed.status)
    crawlerPaths.set(key, crawlerPath)
  }

  const fileReadCompletely =
    !rowsCapped && !progress.bytesCapped && progress.bytesRead >= file.size
  const completeness =
    fileReadCompletely && invalidRows === 0 && !pathsCapped
      ? ('complete' as const)
      : ('partial' as const)
  const warnings: string[] = []
  if (rowsCapped) warnings.push(`Analysis stopped after ${rowLimit} rows.`)
  if (progress.bytesCapped) {
    warnings.push(`Analysis stopped after ${BYTE_LIMIT} input bytes.`)
  }
  if (invalidRows) {
    warnings.push(`${invalidRows} malformed or unsupported rows were skipped.`)
  }
  if (pathsCapped) {
    warnings.push(
      `Crawler path tracking stopped at ${pathLimit} unique crawler and path pairs. Overall crawler and status totals still include later valid rows.`,
    )
  }

  return {
    summary: {
      suppliedRows,
      parsedRows,
      invalidRows,
      crawlerRows,
      nonCrawlerRows: parsedRows - crawlerRows,
      responseBytes,
      ...period,
    },
    statusCodes: [...statusCodes]
      .map(([status, requests]) => ({ status, requests }))
      .sort((a, b) => a.status - b.status),
    crawlers: [...crawlers.values()].sort(compareCrawler),
    crawlerPaths: [...crawlerPaths.values()].sort(compareCrawlerPath),
    provenance: {
      source: 'local-server-log',
      observedAt: new Date().toISOString(),
      cached: false,
      file: {
        path,
        format,
        bytesRead: progress.bytesRead,
        fileBytes: file.size,
      },
      limits: {
        rowLimit,
        pathLimit,
        byteLimit: BYTE_LIMIT,
        maxLineBytes: MAX_LINE_BYTES,
      },
      coverage: {
        fileReadCompletely,
        rowsCapped,
        bytesCapped: progress.bytesCapped,
        pathsCapped,
        untrackedCrawlerPathRows,
      },
      completeness,
    },
    warnings,
  }
}
