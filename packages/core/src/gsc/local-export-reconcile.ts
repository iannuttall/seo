import { SeoError } from '../errors.js'
import type { SearchConsoleExportPageRow } from './local-export.js'

export const DEFAULT_UNREACHED_PAGE_LIMIT = 100

export type SearchConsoleExportReconciliation = {
  joinBasis: 'path'
  crawlOrigin: string
  exportOrigins: string[]
  originMismatch: boolean
  matchedPages: number
  unreachedPages: SearchConsoleExportPageRow[]
  unreachedCount: number
  capped: boolean
}

function unreachedLimit(value?: number): number {
  const result = value ?? DEFAULT_UNREACHED_PAGE_LIMIT
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new SeoError(
      'INVALID_INPUT',
      'Unreached-page limit must be a positive integer.',
    )
  }
  return result
}

function normalizedPath(value: string): string | null {
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareUnreached(
  left: SearchConsoleExportPageRow,
  right: SearchConsoleExportPageRow,
): number {
  return (
    right.impressions - left.impressions ||
    right.clicks - left.clicks ||
    compareText(left.url, right.url)
  )
}

export function reconcileExportPagesWithCrawl(input: {
  pages: SearchConsoleExportPageRow[]
  crawledUrls: string[]
  crawlOrigin: string
  limit?: number
}): SearchConsoleExportReconciliation {
  const limit = unreachedLimit(input.limit)
  const crawledPaths = new Set<string>()
  for (const url of input.crawledUrls) {
    const path = normalizedPath(url)
    if (path !== null) crawledPaths.add(path)
  }

  const origins = new Set<string>()
  let matchedPages = 0
  const unreached: SearchConsoleExportPageRow[] = []
  for (const page of input.pages) {
    let parsed: URL
    try {
      parsed = new URL(page.url)
    } catch {
      continue
    }
    origins.add(parsed.origin)
    const path = normalizedPath(page.url)
    if (path !== null && crawledPaths.has(path)) matchedPages += 1
    else unreached.push(page)
  }
  unreached.sort(compareUnreached)

  const exportOrigins = [...origins].sort(compareText)
  return {
    joinBasis: 'path',
    crawlOrigin: input.crawlOrigin,
    exportOrigins,
    originMismatch: exportOrigins.some(
      (origin) => origin !== input.crawlOrigin,
    ),
    matchedPages,
    unreachedPages: unreached.slice(0, limit),
    unreachedCount: unreached.length,
    capped: unreached.length > limit,
  }
}
