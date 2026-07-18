import type {
  CrawlerCategory,
  ServerLogRecord,
  StatusBreakdown,
} from './types.js'

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
}

const CRAWLERS: ReadonlyArray<{
  family: string
  category: CrawlerCategory
  patterns: readonly string[]
}> = [
  {
    family: 'Googlebot',
    category: 'search',
    patterns: ['googlebot', 'google-inspectiontool'],
  },
  {
    family: 'Bingbot',
    category: 'search',
    patterns: ['bingbot', 'bingpreview'],
  },
  { family: 'Applebot', category: 'search', patterns: ['applebot'] },
  { family: 'DuckDuckBot', category: 'search', patterns: ['duckduckbot'] },
  { family: 'YandexBot', category: 'search', patterns: ['yandexbot'] },
  { family: 'Baiduspider', category: 'search', patterns: ['baiduspider'] },
  { family: 'PetalBot', category: 'search', patterns: ['petalbot'] },
  {
    family: 'OpenAI',
    category: 'ai',
    patterns: ['gptbot', 'chatgpt-user', 'oai-searchbot'],
  },
  {
    family: 'Anthropic',
    category: 'ai',
    patterns: ['claudebot', 'claude-searchbot', 'claude-user'],
  },
  {
    family: 'Perplexity',
    category: 'ai',
    patterns: ['perplexitybot', 'perplexity-user'],
  },
  { family: 'Amazonbot', category: 'ai', patterns: ['amazonbot'] },
  { family: 'Bytespider', category: 'ai', patterns: ['bytespider'] },
  { family: 'CCBot', category: 'ai', patterns: ['ccbot'] },
  { family: 'Cohere', category: 'ai', patterns: ['cohere-ai'] },
]

const COMBINED_LOG =
  /^\S+\s+\S+\s+\S+\s+\[([^\]]+)]\s+"([^"\s]+)\s+([^"\s]+)(?:\s+[^"\s]+)?"\s+(\d{3})\s+(\d+|-)\s*(?:"[^"]*"\s+"([^"]*)")?\s*$/

export function classifyCrawler(userAgent?: string) {
  if (!userAgent) return undefined
  const value = userAgent.toLowerCase()
  const match = CRAWLERS.find((crawler) =>
    crawler.patterns.some((pattern) => value.includes(pattern)),
  )
  return match ? { family: match.family, category: match.category } : undefined
}

function logTimestamp(value: string): string | undefined {
  const match =
    /^(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(
      value,
    )
  if (!match) return undefined
  const month = MONTHS[match[2] ?? '']
  if (month === undefined) return undefined
  const utc = Date.UTC(
    Number(match[3]),
    month,
    Number(match[1]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
  const offsetMinutes = Number(match[8]) * 60 + Number(match[9])
  const adjusted = utc + (match[7] === '+' ? -1 : 1) * offsetMinutes * 60_000
  const date = new Date(adjusted)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function normalizedPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_000) {
    return undefined
  }
  try {
    if (value.startsWith('/')) {
      return new URL(value, 'https://server-log.invalid').pathname
    }
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.pathname : undefined
  } catch {
    return undefined
  }
}

function normalizedMethod(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[A-Za-z]{1,16}$/.test(value)) {
    return undefined
  }
  return value.toUpperCase()
}

function normalizedStatus(value: unknown): number | undefined {
  const status = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined
}

function normalizedBytes(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '' || value === '-') {
    return undefined
  }
  const bytes = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : undefined
}

function record(input: {
  timestamp: unknown
  method: unknown
  path: unknown
  status: unknown
  bytes?: unknown
  userAgent?: unknown
}): ServerLogRecord | undefined {
  let timestamp: string | undefined
  if (typeof input.timestamp === 'string') {
    const date = new Date(input.timestamp)
    if (!Number.isNaN(date.getTime())) timestamp = date.toISOString()
  }
  const method = normalizedMethod(input.method)
  const path = normalizedPath(input.path)
  const status = normalizedStatus(input.status)
  if (!timestamp || !method || !path || status === undefined) return undefined
  const userAgent =
    typeof input.userAgent === 'string' && input.userAgent.length <= 2_000
      ? input.userAgent
      : undefined
  return {
    timestamp,
    method,
    path,
    status,
    bytes: normalizedBytes(input.bytes),
    userAgent,
    crawler: classifyCrawler(userAgent),
  }
}

export function parseCombinedLogLine(
  line: string,
): ServerLogRecord | undefined {
  const match = COMBINED_LOG.exec(line)
  if (!match) return undefined
  const timestamp = logTimestamp(match[1] ?? '')
  if (!timestamp) return undefined
  return record({
    timestamp,
    method: match[2],
    path: match[3],
    status: match[4],
    bytes: match[5],
    userAgent: match[6],
  })
}

function firstValue(
  value: Record<string, unknown>,
  names: readonly string[],
): unknown {
  for (const name of names) {
    if (value[name] !== undefined) return value[name]
  }
  return undefined
}

export function parseJsonLogLine(line: string): ServerLogRecord | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const row = value as Record<string, unknown>
  return record({
    timestamp: firstValue(row, ['timestamp', 'time', 'datetime', '@timestamp']),
    method: firstValue(row, ['method', 'requestMethod', 'http_method']),
    path: firstValue(row, ['path', 'url', 'requestUri', 'request_uri']),
    status: firstValue(row, ['status', 'statusCode', 'status_code']),
    bytes: firstValue(row, ['bytes', 'bodyBytesSent', 'body_bytes_sent']),
    userAgent: firstValue(row, [
      'userAgent',
      'user_agent',
      'httpUserAgent',
      'http_user_agent',
    ]),
  })
}

export function emptyStatusBreakdown(): StatusBreakdown {
  return { success: 0, redirect: 0, clientError: 0, serverError: 0, other: 0 }
}

export function addStatus(breakdown: StatusBreakdown, status: number): void {
  if (status >= 200 && status < 300) breakdown.success += 1
  else if (status >= 300 && status < 400) breakdown.redirect += 1
  else if (status >= 400 && status < 500) breakdown.clientError += 1
  else if (status >= 500) breakdown.serverError += 1
  else breakdown.other += 1
}
