import { SeoError } from '../errors.js'
import type { ServerLogEvidence } from './types.js'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

function outputLimit(value?: number): number {
  const limit = value ?? DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new SeoError(
      'INVALID_INPUT',
      `Server log output limit must be between 1 and ${MAX_LIMIT}.`,
    )
  }
  return limit
}

export function serverLogReport(input: {
  evidence: ServerLogEvidence
  limit?: number
}) {
  const limit = outputLimit(input.limit)
  const crawlerPaths = input.evidence.crawlerPaths.slice(0, limit)
  return {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    dataStatus: input.evidence.provenance.completeness,
    summary: input.evidence.summary,
    statusCodes: input.evidence.statusCodes,
    crawlers: input.evidence.crawlers,
    crawlerPaths,
    selection: {
      availableCrawlerPaths: input.evidence.crawlerPaths.length,
      returnedCrawlerPaths: crawlerPaths.length,
      omittedCrawlerPaths: Math.max(
        0,
        input.evidence.crawlerPaths.length - crawlerPaths.length,
      ),
      limit,
    },
    provenance: input.evidence.provenance,
    warnings: input.evidence.warnings,
    caveats: [
      'Crawler families are identified from user-agent strings, which can be missing or spoofed.',
      'This report describes only the supplied log file and cannot prove that every server or time period is represented.',
      'Crawler path rankings describe retained path aggregates when the path limit is reached.',
    ],
  }
}
