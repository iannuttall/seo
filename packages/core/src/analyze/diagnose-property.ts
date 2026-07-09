import { isSkippableReportError } from '../errors.js'
import type { FetchRateControls } from '../fetch/page-fetcher.js'
import { countLabel } from '../phrasing.js'
import type { ProgressReporter } from '../progress.js'
import type { TemplateSummary } from './page-patterns.js'
import { type SegmentImpactReport, segmentImpact } from './segment-impact.js'
import { defaultDateRange } from './shared.js'
import {
  analyzeCannibalRows,
  analyzeQuickWinsFromRows,
  cannibalReport,
  decayingReport,
  quickWinsReport,
} from './site-diagnostics.js'
import {
  analyzeStrikingDistanceRows,
  strikingDistance,
} from './striking-distance.js'
import {
  trafficAnomaly,
  type UpdateCorrelationReport,
  updateCorrelation,
} from './traffic-anomaly.js'

export type DiagnosisPriority = {
  label: string
  reason: string
  action: string
  confidence: 'high' | 'medium' | 'low'
}

export type SkippedDiagnosisSection = {
  section: string
  reason: string
}

export type DiagnosePropertyReport = {
  site: string
  generatedAt: string
  summary: {
    classification: string
    significantAnomalies: number
    updateMatches: number
    largestPageMovements: number
    decayItems: number
    cannibalItems: number
    strikingDistanceItems: number
    quickWinItems: number
  }
  skippedSections?: SkippedDiagnosisSection[]
  priorities: DiagnosisPriority[]
  anomaly: Awaited<ReturnType<typeof trafficAnomaly>>
  updateCorrelation: Awaited<ReturnType<typeof updateCorrelation>>
  segments: {
    page: SegmentImpactReport
    query: SegmentImpactReport
    device: SegmentImpactReport
    country: SegmentImpactReport
  }
  decay: Awaited<ReturnType<typeof decayingReport>>
  cannibalization: Awaited<ReturnType<typeof cannibalReport>>
  strikingDistance: Awaited<ReturnType<typeof strikingDistance>>
  quickWins: Awaited<ReturnType<typeof quickWinsReport>>
}

type SectionResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'skipped'; value: T; skipped: SkippedDiagnosisSection }

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fallbackRange(input: {
  days?: number
  startDate?: string
  endDate?: string
}) {
  return input.startDate && input.endDate
    ? { startDate: input.startDate, endDate: input.endDate }
    : defaultDateRange(input.days ?? 28)
}

function emptyAnomaly(input: {
  site: string
}): Awaited<ReturnType<typeof trafficAnomaly>> {
  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    anomalies: [],
    rows: 0,
  }
}

function emptyUpdateCorrelation(input: {
  site: string
  days?: number
  recentDays?: number
}): UpdateCorrelationReport {
  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    anomalies: [],
    overlappingUpdates: [],
    classification: 'not-enough-evidence',
    attribution: 'weak-or-no-overlap',
    confidence: 'low',
    confounders: [],
    summary: `${input.site} does not have enough daily GSC data for update correlation yet.`,
    evidence: [
      'The traffic anomaly section was skipped or returned no daily rows.',
    ],
    caveats: [
      `GSC window: ${input.days ?? 90} days; recent comparison window: ${input.recentDays ?? 7} days.`,
      'New or sparse properties need more daily GSC data before update attribution is useful.',
    ],
    actions: [
      'Use quick wins, second-page opportunities, page audit, and technical checks until enough daily GSC data exists.',
    ],
    source: {
      name: 'Google Search Status Dashboard incidents feed',
      url: 'https://status.search.google.com/incidents.json',
      product: 'Ranking',
    },
  }
}

function emptySegment(input: {
  site: string
  dimension: SegmentImpactReport['dimension']
  days?: number
  startDate?: string
  endDate?: string
}): SegmentImpactReport {
  const after = fallbackRange(input)
  return {
    site: input.site,
    dimension: input.dimension,
    before: after,
    after,
    generatedAt: new Date().toISOString(),
    items: [],
  }
}

function emptyDecay(input: {
  site: string
}): Awaited<ReturnType<typeof decayingReport>> {
  const current = defaultDateRange(28)
  const previousEnd = new Date(`${current.startDate}T00:00:00.000Z`)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousStart.getUTCDate() - 27)
  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    ranges: {
      current,
      previous: {
        startDate: previousStart.toISOString().slice(0, 10),
        endDate: previousEnd.toISOString().slice(0, 10),
      },
    },
    filters: {
      minDropPct: 20,
      minPreviousClicks: 2,
      minClickLoss: 1,
      brand: 'excluded',
    },
    summary: {
      rows: 0,
      groups: 0,
      totalClickLoss: 0,
      brandFiltering: 'excluded',
      verdict: 'Decay analysis was skipped.',
    },
    caveats: [
      'Decay analysis was skipped because required GSC data was unavailable.',
    ],
    recommendations: [
      'Run this section again after the property has enough query/page history.',
    ],
    items: [],
    groups: [],
    templates: [],
  }
}

function emptyCannibal(input: {
  site: string
  days?: number
  startDate?: string
  endDate?: string
}): Awaited<ReturnType<typeof cannibalReport>> {
  const range = fallbackRange(input)
  const rangeDays =
    Math.floor(
      (new Date(`${range.endDate}T00:00:00.000Z`).getTime() -
        new Date(`${range.startDate}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1
  const analysis = analyzeCannibalRows({ site: input.site, rows: [] })
  return {
    schemaVersion: 1,
    site: input.site,
    generatedAt: new Date().toISOString(),
    range,
    rangeDays,
    dataStatus: 'unavailable',
    source: {
      provider: 'google-search-console',
      searchType: 'web',
      dataState: 'final',
      pageExposure: {
        dimensions: ['query', 'page'],
        aggregationType: 'auto',
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      propertyDemand: {
        dimensions: ['query'],
        aggregationType: 'byProperty',
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      completeness: 'unavailable',
    },
    methodology: {
      id: 'gsc_url_overlap_v2',
      version: 2,
      minimumPageImpressions: 10,
      minimumPageImpressionShare: 0.1,
      maximumDominantPageShare: 0.8,
      matching: 'normalized_exact_query',
      finding: 'url-overlap-candidate',
      requiresIntentReview: true,
    },
    verification: {
      status: 'not-requested',
      technicalStateChecked: false,
      searchIntentChecked: false,
    },
    filters: analysis.filters,
    selection: analysis.selection,
    summary: {
      eligibleClusters: 0,
      returnedClusters: 0,
      suppressedQueries: 0,
      brandFiltering: 'excluded',
      verdict: 'Multi-URL query analysis was unavailable.',
    },
    templates: [],
    suppressed: [],
    suppressionSummary: {},
    items: [],
    caveats: [
      'Multi-URL query analysis was skipped because required GSC data was unavailable.',
    ],
    recommendations: [
      'Run this section again after Search Console query/page data is available.',
    ],
    ledgerSummary: 'GSC: 0 calls, 0 rows.',
  }
}

function emptyStriking(input: {
  site: string
  days?: number
}): Awaited<ReturnType<typeof strikingDistance>> {
  const analysis = analyzeStrikingDistanceRows({ rows: [], site: input.site })
  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    range: defaultDateRange(input.days ?? 28),
    rangeDays: input.days ?? 28,
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      searchType: 'web',
      dataState: 'final',
      rowsFetched: 0,
      calls: 0,
      maxRows: 100_000,
      possiblyTruncated: false,
      completeness: 'retained-query-rows-only',
    },
    dataStatus: analysis.dataStatus,
    selection: analysis.selection,
    methodology: analysis.methodology,
    verification: {
      requested: false,
      attempted: 0,
      verified: 0,
      technical: 0,
      failed: 0,
    },
    items: [],
    templates: [] as TemplateSummary[],
    groups: [],
    summary: {
      ...analysis.summary,
      brandFiltering: 'excluded',
      verdict: 'Striking-distance analysis was skipped.',
    },
    caveats: [
      'Striking-distance analysis was skipped because required GSC data was unavailable.',
    ],
    recommendations: [
      'Run this section again after the property has enough query/page history.',
    ],
  }
}

function emptyQuickWins(input: {
  site: string
  days?: number
}): Awaited<ReturnType<typeof quickWinsReport>> {
  const analysis = analyzeQuickWinsFromRows({ rows: [], site: input.site })
  const range = fallbackRange(input)
  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    range,
    rangeDays: input.days ?? 28,
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      searchType: 'web',
      dataState: 'final',
      rowsFetched: 0,
      calls: 0,
      maxRows: 100_000,
      possiblyTruncated: false,
      completeness: 'retained-query-rows-only',
    },
    dataStatus: analysis.dataStatus,
    selection: analysis.selection,
    methodology: analysis.methodology,
    provenance: {
      ...analysis.provenance,
      verification: {
        optional: true,
        population: 'returned_rows_in_priority_order',
        fetchDeduplication: 'exact_url',
      },
    },
    benchmark: {
      method: analysis.methodology.benchmark.method,
      peerRows: 0,
      byPosition: analysis.benchmarkByPosition,
    },
    verification: {
      requested: false,
      attemptedRows: 0,
      attemptedUrls: 0,
      verified: 0,
      technical: 0,
      failed: 0,
    },
    summary: {
      ...analysis.summary,
      repeatedQueryGroups: 0,
      templatePatterns: 0,
      brandFiltering: 'excluded',
      verdict: 'Quick-win analysis was skipped.',
    },
    caveats: [
      'Quick-win analysis was skipped because required GSC data was unavailable.',
    ],
    recommendations: [
      'Run this section again after the property has enough query/page history.',
    ],
    templates: [],
    templateRecommendations: [],
    groups: [],
    items: [],
    ledgerSummary: 'No provider calls recorded.',
    warnings: [],
  }
}

function topDelta(report: SegmentImpactReport): string {
  const top = report.items[0]
  if (!top) return 'No segment movement found.'
  const direction = top.clickDelta < 0 ? 'lost' : 'gained'
  return `${top.key} ${direction} ${Math.abs(top.clickDelta)} clicks.`
}

function buildPriorities(input: {
  update: Awaited<ReturnType<typeof updateCorrelation>>
  page: SegmentImpactReport
  decay: Awaited<ReturnType<typeof decayingReport>>
  cannibal: Awaited<ReturnType<typeof cannibalReport>>
  striking: Awaited<ReturnType<typeof strikingDistance>>
}): DiagnosisPriority[] {
  const priorities: DiagnosisPriority[] = []

  if (input.update.classification !== 'not-enough-evidence') {
    priorities.push({
      label: 'Review update exposure',
      reason: `${countLabel(input.update.overlappingUpdates.length, 'official update window')} ${input.update.overlappingUpdates.length === 1 ? 'overlaps' : 'overlap'} recent movement.`,
      action:
        'Do not edit individual pages yet. First compare winning and losing templates so you know which page type was affected by the update.',
      confidence:
        input.update.classification === 'likely-update-related'
          ? 'medium'
          : 'low',
    })
  }

  const largestPage = input.page.items[0]
  if (largestPage) {
    priorities.push({
      label: 'Investigate largest page movement',
      reason: topDelta(input.page),
      action:
        'Open the page and check the queries that moved, whether the URL is still canonical/indexable, and whether the title, H1, or body changed recently.',
      confidence: Math.abs(largestPage.clickDelta) > 50 ? 'high' : 'medium',
    })
  }

  if (input.decay.items.length) {
    const topGroup = input.decay.groups[0]
    priorities.push({
      label: 'Refresh decaying content',
      reason: topGroup
        ? `${input.decay.items.length} decaying query/page rows found; ${topGroup.label} lost ${topGroup.totalClickLoss.toFixed(0)} clicks.`
        : `${input.decay.items.length} decaying query/page rows found.`,
      action: topGroup
        ? topGroup.recommendation
        : 'Start with declines that continued outside the update window. Check indexability first, then ranking and CTR causes.',
      confidence: 'medium',
    })
  }

  if (input.cannibal.items.length) {
    priorities.push({
      label: 'Review multi-URL query candidates',
      reason: `${input.cannibal.selection.eligibleClusters} multi-URL query candidates found.`,
      action:
        'Confirm whether each URL set satisfies the same intent and inspect technical state. Consolidate only verified duplicate or same-intent pages; otherwise clarify the distinction.',
      confidence: 'low',
    })
  }

  if (input.striking.items.length) {
    const top = input.striking.items[0]
    priorities.push({
      label: 'Investigate striking-distance candidates',
      reason: `${input.striking.items.length} query/page rows have an average GSC position above 10 and at most 20.`,
      action:
        top?.recommendation.action ??
        'Check technical state, query coverage, competing URLs, and relevant internal links before choosing a change.',
      confidence: top?.recommendation.confidence ?? 'low',
    })
  }

  return priorities.slice(0, 6)
}

export async function diagnoseProperty(input: {
  site: string
  days?: number
  recentDays?: number
  startDate?: string
  endDate?: string
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  rate?: FetchRateControls
  refresh?: boolean
  progress?: ProgressReporter
}): Promise<DiagnosePropertyReport> {
  const limit = input.limit ?? 10
  const track = async <T>(
    label: string,
    run: () => Promise<T>,
    fallback: (error: unknown) => T,
  ): Promise<SectionResult<T>> => {
    input.progress?.(`Running ${label}`)
    try {
      const result = await run()
      input.progress?.(`Finished ${label}`)
      return { status: 'completed', value: result }
    } catch (error) {
      if (!isSkippableReportError(error)) {
        throw error
      }
      const reason = errorReason(error)
      input.progress?.(`Skipped ${label}: ${reason}`)
      return {
        status: 'skipped',
        value: fallback(error),
        skipped: { section: label, reason },
      }
    }
  }
  const [
    anomalyResult,
    updateResult,
    pageResult,
    queryResult,
    deviceResult,
    countryResult,
    decayResult,
    cannibalResult,
    strikingResult,
    quickWinsResult,
  ] = await Promise.all([
    track(
      'traffic anomaly',
      () => trafficAnomaly(input),
      () => emptyAnomaly(input),
    ),
    track(
      'update correlation',
      () => updateCorrelation(input),
      () => emptyUpdateCorrelation(input),
    ),
    track(
      'page movement segments',
      () => segmentImpact({ ...input, dimension: 'page', limit }),
      () => emptySegment({ ...input, dimension: 'page' }),
    ),
    track(
      'query movement segments',
      () => segmentImpact({ ...input, dimension: 'query', limit }),
      () => emptySegment({ ...input, dimension: 'query' }),
    ),
    track(
      'device movement segments',
      () => segmentImpact({ ...input, dimension: 'device', limit }),
      () => emptySegment({ ...input, dimension: 'device' }),
    ),
    track(
      'country movement segments',
      () => segmentImpact({ ...input, dimension: 'country', limit }),
      () => emptySegment({ ...input, dimension: 'country' }),
    ),
    track(
      'decay analysis',
      () =>
        decayingReport({
          site: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
          refresh: input.refresh,
        }),
      () => emptyDecay(input),
    ),
    track(
      'cannibalisation analysis',
      () =>
        cannibalReport({
          site: input.site,
          days: input.days,
          startDate: input.startDate,
          endDate: input.endDate,
          limit,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
          refresh: input.refresh,
        }),
      () => emptyCannibal(input),
    ),
    track(
      'striking-distance opportunities',
      () => strikingDistance({ ...input, limit }),
      () => emptyStriking(input),
    ),
    track(
      'quick-win opportunities',
      () =>
        quickWinsReport({
          site: input.site,
          days: input.days,
          startDate: input.startDate,
          endDate: input.endDate,
          limit,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
          verifyContent: input.verifyContent,
          verifyLimit: input.verifyLimit,
          js: input.js,
          rate: input.rate,
          refresh: input.refresh,
        }),
      () => emptyQuickWins(input),
    ),
  ])
  input.progress?.('Building priority list')

  const anomaly = anomalyResult.value
  const update = updateResult.value
  const page = pageResult.value
  const query = queryResult.value
  const device = deviceResult.value
  const country = countryResult.value
  const decay = decayResult.value
  const cannibal = cannibalResult.value
  const striking = strikingResult.value
  const quickWins = quickWinsResult.value
  const skippedSections = [
    anomalyResult,
    updateResult,
    pageResult,
    queryResult,
    deviceResult,
    countryResult,
    decayResult,
    cannibalResult,
    strikingResult,
    quickWinsResult,
  ].flatMap((result) => (result.status === 'skipped' ? [result.skipped] : []))

  const priorities = buildPriorities({
    update,
    page,
    decay,
    cannibal,
    striking,
  })

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    summary: {
      classification: update.classification,
      significantAnomalies: anomaly.anomalies.filter((item) => item.significant)
        .length,
      updateMatches: update.overlappingUpdates.length,
      largestPageMovements: page.items.length,
      decayItems: decay.items.length,
      cannibalItems: cannibal.selection.eligibleClusters,
      strikingDistanceItems: striking.items.length,
      quickWinItems: quickWins.items.length,
    },
    skippedSections,
    priorities,
    anomaly,
    updateCorrelation: update,
    segments: { page, query, device, country },
    decay,
    cannibalization: cannibal,
    strikingDistance: striking,
    quickWins,
  }
}
