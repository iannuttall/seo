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

export const SERVER_LOG_LIMITS = Object.freeze({
  defaultRows: 1_000_000,
  maximumRows: 10_000_000,
  defaultPaths: 25_000,
  maximumPaths: 100_000,
  maximumBytes: 1_000_000_000,
  maximumLineBytes: 65_536,
  chunkBytes: 65_536,
})

export const BROWSER_SERVER_LOG_LIMITS = Object.freeze({
  rows: 1_000_000,
  paths: 25_000,
  bytes: 250_000_000,
  lineBytes: SERVER_LOG_LIMITS.maximumLineBytes,
  reportPaths: 200,
})

export type ServerLogAnalysisProgress = {
  bytesRead: number
  suppliedRows: number
}

export type ServerLogChunkAnalysisInput = {
  chunks: AsyncIterable<Uint8Array>
  file: {
    path: string
    fileBytes: number
  }
  format: ServerLogFormat
  rowLimit: number
  pathLimit: number
  byteLimit: number
  maxLineBytes: number
  observedAt?: string
  onProgress?: (progress: ServerLogAnalysisProgress) => void
}

type LineItem = { line?: string; tooLong?: true }

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function lineItems(
  value: string,
  state: { remainder: string; discarding: boolean },
  maxLineBytes: number,
): LineItem[] {
  const items: LineItem[] = []
  let text = value

  if (state.discarding) {
    const newline = text.indexOf('\n')
    if (newline < 0) return items
    items.push({ tooLong: true })
    state.discarding = false
    text = text.slice(newline + 1)
  }

  state.remainder += text
  let newline = state.remainder.indexOf('\n')
  while (newline >= 0) {
    const line = state.remainder.slice(0, newline).replace(/\r$/u, '')
    state.remainder = state.remainder.slice(newline + 1)
    if (utf8Bytes(line) > maxLineBytes) items.push({ tooLong: true })
    else if (line.trim()) items.push({ line })
    newline = state.remainder.indexOf('\n')
  }

  if (utf8Bytes(state.remainder) > maxLineBytes) {
    state.remainder = ''
    state.discarding = true
  }
  return items
}

async function* linesFromChunks(
  chunks: AsyncIterable<Uint8Array>,
  progress: { bytesRead: number; bytesCapped: boolean },
  byteLimit: number,
  maxLineBytes: number,
  onBytesRead: () => void,
): AsyncGenerator<LineItem> {
  const decoder = new TextDecoder('utf-8')
  const state = { remainder: '', discarding: false }

  for await (const chunk of chunks) {
    const remainingBytes = byteLimit - progress.bytesRead
    if (remainingBytes <= 0) {
      progress.bytesCapped = true
      break
    }
    const acceptedBytes = Math.min(chunk.byteLength, remainingBytes)
    const accepted = chunk.subarray(0, acceptedBytes)
    progress.bytesRead += accepted.byteLength
    if (acceptedBytes < chunk.byteLength) progress.bytesCapped = true

    for (
      let offset = 0;
      offset < accepted.byteLength;
      offset += SERVER_LOG_LIMITS.chunkBytes
    ) {
      const slice = accepted.subarray(
        offset,
        Math.min(offset + SERVER_LOG_LIMITS.chunkBytes, accepted.byteLength),
      )
      for (const item of lineItems(
        decoder.decode(slice, { stream: true }),
        state,
        maxLineBytes,
      )) {
        yield item
      }
      onBytesRead()
    }
    if (progress.bytesCapped) break
  }

  for (const item of lineItems(decoder.decode(), state, maxLineBytes)) {
    yield item
  }
  if (state.discarding || utf8Bytes(state.remainder) > maxLineBytes) {
    yield { tooLong: true }
  } else if (state.remainder.trim()) {
    yield { line: state.remainder.replace(/\r$/u, '') }
  }
}

function codepointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareCrawler(a: CrawlerSummary, b: CrawlerSummary): number {
  return b.requests - a.requests || codepointCompare(a.family, b.family)
}

function compareCrawlerPath(
  a: CrawlerPathSummary,
  b: CrawlerPathSummary,
): number {
  return (
    b.requests - a.requests ||
    codepointCompare(a.family, b.family) ||
    codepointCompare(a.path, b.path)
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

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return value
}

export function serverLogFormatForFilename(
  filename: string,
  explicit?: ServerLogFormat,
): ServerLogFormat {
  if (explicit) return explicit
  const extension = filename.toLowerCase().split('.').pop()
  return extension === 'jsonl' || extension === 'ndjson' ? 'jsonl' : 'combined'
}

export async function analyzeServerLogChunks(
  input: ServerLogChunkAnalysisInput,
): Promise<ServerLogEvidence> {
  const rowLimit = positiveInteger(input.rowLimit, 'Server log row limit')
  const pathLimit = positiveInteger(input.pathLimit, 'Server log path limit')
  const byteLimit = positiveInteger(input.byteLimit, 'Server log byte limit')
  const maxLineBytes = positiveInteger(
    input.maxLineBytes,
    'Server log line limit',
  )
  const parse =
    input.format === 'jsonl' ? parseJsonLogLine : parseCombinedLogLine
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
  let lastProgressBytes = 0
  let lastProgressRows = 0

  const notifyProgress = (force = false) => {
    if (
      !force &&
      progress.bytesRead - lastProgressBytes < 1_000_000 &&
      suppliedRows - lastProgressRows < 10_000
    ) {
      return
    }
    lastProgressBytes = progress.bytesRead
    lastProgressRows = suppliedRows
    input.onProgress?.({ bytesRead: progress.bytesRead, suppliedRows })
  }

  const items = linesFromChunks(
    input.chunks,
    progress,
    byteLimit,
    maxLineBytes,
    notifyProgress,
  )
  for await (const item of items) {
    if (suppliedRows >= rowLimit) {
      rowsCapped = true
      break
    }
    suppliedRows += 1
    const parsed = item.line ? parse(item.line) : undefined
    if (!parsed) {
      invalidRows += 1
      notifyProgress()
      continue
    }
    parsedRows += 1
    responseBytes += parsed.bytes ?? 0
    updatePeriod(parsed.timestamp, period)
    statusCodes.set(parsed.status, (statusCodes.get(parsed.status) ?? 0) + 1)
    if (!parsed.crawler) {
      notifyProgress()
      continue
    }

    crawlerRows += 1
    const crawler = crawlers.get(parsed.crawler.family) ?? newCrawler(parsed)
    crawler.requests += 1
    if (parsed.timestamp > crawler.lastSeenAt) {
      crawler.lastSeenAt = parsed.timestamp
    }
    addStatus(crawler, parsed.status)
    crawlers.set(parsed.crawler.family, crawler)

    const key = `${parsed.crawler.family}\u0000${parsed.path}`
    let crawlerPath = crawlerPaths.get(key)
    if (!crawlerPath && crawlerPaths.size >= pathLimit) {
      pathsCapped = true
      untrackedCrawlerPathRows += 1
      notifyProgress()
      continue
    }
    crawlerPath ??= newCrawlerPath(parsed)
    crawlerPath.requests += 1
    if (parsed.timestamp > crawlerPath.lastSeenAt) {
      crawlerPath.lastSeenAt = parsed.timestamp
    }
    addStatus(crawlerPath, parsed.status)
    crawlerPaths.set(key, crawlerPath)
    notifyProgress()
  }
  notifyProgress(true)

  const fileReadCompletely =
    !rowsCapped &&
    !progress.bytesCapped &&
    progress.bytesRead >= input.file.fileBytes
  const completeness =
    fileReadCompletely && invalidRows === 0 && !pathsCapped
      ? ('complete' as const)
      : ('partial' as const)
  const warnings: string[] = []
  if (rowsCapped) warnings.push(`Analysis stopped after ${rowLimit} rows.`)
  if (progress.bytesCapped) {
    warnings.push(`Analysis stopped after ${byteLimit} input bytes.`)
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
      observedAt: input.observedAt ?? new Date().toISOString(),
      cached: false,
      file: {
        path: input.file.path,
        format: input.format,
        bytesRead: progress.bytesRead,
        fileBytes: input.file.fileBytes,
      },
      limits: { rowLimit, pathLimit, byteLimit, maxLineBytes },
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
