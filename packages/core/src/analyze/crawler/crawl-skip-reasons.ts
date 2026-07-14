export const CRAWL_SKIP_REASONS = [
  'asset-url',
  'configured-exclusion',
  'duplicate-normalization',
  'invalid-url',
  'off-origin',
  'origin-backpressure',
  'queue-safety-limit',
  'robots-disallowed',
  'robots-uncertain',
  'legacy-unclassified',
] as const

export type CrawlSkipReason = (typeof CRAWL_SKIP_REASONS)[number]

export type CrawlSkipImpact = 'coverage-affecting' | 'non-impacting'

export type CrawlSkipReasonCount = {
  reason: CrawlSkipReason
  impact: CrawlSkipImpact
  count: number
}

export type CrawlSkippedUrlsByImpact = {
  coverageAffecting: number
  nonImpacting: number
}

const SKIP_IMPACT = {
  'asset-url': 'non-impacting',
  'configured-exclusion': 'non-impacting',
  'duplicate-normalization': 'non-impacting',
  'invalid-url': 'non-impacting',
  'off-origin': 'non-impacting',
  'origin-backpressure': 'coverage-affecting',
  'queue-safety-limit': 'coverage-affecting',
  'robots-disallowed': 'coverage-affecting',
  'robots-uncertain': 'coverage-affecting',
  'legacy-unclassified': 'coverage-affecting',
} as const satisfies Record<CrawlSkipReason, CrawlSkipImpact>

const REASON_ORDER = new Map(
  CRAWL_SKIP_REASONS.map((reason, index) => [reason, index]),
)

function isCrawlSkipReason(value: unknown): value is CrawlSkipReason {
  return (
    typeof value === 'string' &&
    CRAWL_SKIP_REASONS.includes(value as CrawlSkipReason)
  )
}

function validCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : 0
}

export function crawlSkipImpact(reason: CrawlSkipReason): CrawlSkipImpact {
  return SKIP_IMPACT[reason]
}

export function normalizeCrawlSkipReasonCounts(input: {
  skippedUrls?: number
  skipReasons?: unknown
}): {
  skippedUrls: number
  skipReasons: CrawlSkipReasonCount[]
  skippedUrlsByImpact: CrawlSkippedUrlsByImpact
} {
  const counts = new Map<CrawlSkipReason, number>()
  if (Array.isArray(input.skipReasons)) {
    for (const item of input.skipReasons) {
      if (!item || typeof item !== 'object') continue
      const { reason, count } = item as { reason?: unknown; count?: unknown }
      if (!isCrawlSkipReason(reason)) continue
      const normalizedCount = validCount(count)
      if (!normalizedCount) continue
      counts.set(reason, (counts.get(reason) ?? 0) + normalizedCount)
    }
  }

  const declaredTotal = validCount(input.skippedUrls)
  const classifiedTotal = [...counts.values()].reduce(
    (total, count) => total + count,
    0,
  )
  if (declaredTotal > classifiedTotal) {
    counts.set(
      'legacy-unclassified',
      (counts.get('legacy-unclassified') ?? 0) +
        declaredTotal -
        classifiedTotal,
    )
  }

  const skipReasons = [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      impact: crawlSkipImpact(reason),
      count,
    }))
    .sort(
      (left, right) =>
        (REASON_ORDER.get(left.reason) ?? Number.MAX_SAFE_INTEGER) -
        (REASON_ORDER.get(right.reason) ?? Number.MAX_SAFE_INTEGER),
    )
  const skippedUrlsByImpact = skipReasons.reduce<CrawlSkippedUrlsByImpact>(
    (totals, item) => {
      if (item.impact === 'coverage-affecting') {
        totals.coverageAffecting += item.count
      } else {
        totals.nonImpacting += item.count
      }
      return totals
    },
    { coverageAffecting: 0, nonImpacting: 0 },
  )

  return {
    skippedUrls:
      skippedUrlsByImpact.coverageAffecting + skippedUrlsByImpact.nonImpacting,
    skipReasons,
    skippedUrlsByImpact,
  }
}

export function crawlSkipReasonCountsFromRecord(
  input: Partial<Record<CrawlSkipReason, number>> = {},
): CrawlSkipReasonCount[] {
  return normalizeCrawlSkipReasonCounts({
    skipReasons: Object.entries(input).map(([reason, count]) => ({
      reason,
      count,
    })),
  }).skipReasons
}
