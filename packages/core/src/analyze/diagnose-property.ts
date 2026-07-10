import { isSkippableReportError } from '../errors.js'
import type { FetchRateControls } from '../fetch/page-fetcher.js'
import type { ProgressReporter } from '../progress.js'
import { buildDiagnosisPriorities } from './diagnosis-priorities.js'
import {
  diagnosisDataStatus,
  diagnosisPartialReasons,
} from './diagnosis-status.js'
import type { TemplateSummary } from './page-patterns.js'
import {
  type SegmentImpactReport,
  segmentImpact,
  segmentRangeDays,
  unavailableSegmentImpactReport,
} from './segment-impact.js'
import { defaultDateRange } from './shared.js'
import {
  analyzeCannibalRows,
  analyzeDecay,
  analyzeQuickWinsFromRows,
  cannibalReport,
  decayComparisonRange,
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

export type DiagnosisDataStatus = 'complete' | 'partial' | 'unavailable'

export type PartialDiagnosisReason = {
  section: string
  reason: string
}

export type DiagnosePropertyReport = {
  site: string
  generatedAt: string
  dataStatus: DiagnosisDataStatus
  summary: {
    updateAttribution: UpdateCorrelationReport['classification'] | 'unavailable'
    updateAttributionStatus: 'available' | 'unavailable'
    /** @deprecated Use updateAttribution. */
    classification: UpdateCorrelationReport['classification']
    significantAnomalies: number
    updateMatches: number
    largestPageMovements: number
    decayItems: number
    cannibalItems: number
    strikingDistanceItems: number
    quickWinItems: number
  }
  skippedSections?: SkippedDiagnosisSection[]
  partialReasons?: PartialDiagnosisReason[]
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

function emptyUpdateCorrelation(
  input: {
    site: string
    days?: number
    recentDays?: number
  },
  unavailable?: {
    reason: string
    source: 'traffic-anomaly' | 'search-status'
  },
): UpdateCorrelationReport {
  const sparseDataReason =
    'The traffic anomaly section was skipped or returned no daily rows.'
  const reason = unavailable
    ? `Update correlation was unavailable: ${unavailable.reason}`
    : sparseDataReason
  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    anomalies: [],
    overlappingUpdates: [],
    classification: 'not-enough-evidence',
    attribution: 'weak-or-no-overlap',
    confidence: 'low',
    confounders: [],
    summary: unavailable
      ? `${input.site} update attribution was unavailable for this run.`
      : `${input.site} does not have enough daily GSC data for update correlation yet.`,
    evidence: [reason],
    caveats: [
      `GSC window: ${input.days ?? 90} days; recent comparison window: ${input.recentDays ?? 7} days.`,
      ...(unavailable
        ? ['No update-attribution conclusion was produced.']
        : [
            'New or sparse properties need more daily GSC data before update attribution is useful.',
          ]),
    ],
    actions: [
      unavailable?.source === 'search-status'
        ? 'Retry update attribution when the Search Status provider is available; use the canonical traffic anomalies and other report evidence in the meantime.'
        : unavailable?.source === 'traffic-anomaly'
          ? 'Restore traffic anomaly evidence, then retry update attribution; use other report evidence in the meantime.'
          : 'Use quick wins, second-page opportunities, page audit, and technical checks until enough daily GSC data exists.',
    ],
    source: {
      name: 'Google Search Status Dashboard incidents feed',
      url: 'https://status.search.google.com/incidents.json',
      product: 'Ranking',
    },
  }
}

function emptySegment(
  input: {
    site: string
    dimension: SegmentImpactReport['dimension']
    days?: number
    startDate?: string
    endDate?: string
  },
  reason = 'Segment evidence was unavailable.',
): SegmentImpactReport {
  const after = fallbackRange(input)
  return unavailableSegmentImpactReport({
    site: input.site,
    dimension: input.dimension,
    after,
    reason,
  })
}

function segmentWindowUnavailableReason(input: {
  days?: number
  startDate?: string
  endDate?: string
}): string | undefined {
  const days = segmentRangeDays(fallbackRange(input))
  return days > 240
    ? `The ${days}-day diagnosis window is too long for an adjacent segment comparison inside Search Console's rolling 16-month API history. Use 240 days or fewer for segment movement.`
    : undefined
}

function emptyDecay(input: {
  site: string
  days?: number
  startDate?: string
  endDate?: string
  limit?: number
  includeBrand?: boolean
}): Awaited<ReturnType<typeof decayingReport>> {
  const current = fallbackRange(input)
  const previous = decayComparisonRange(current)
  const analysis = analyzeDecay({
    site: input.site,
    currentRows: [],
    previousRows: [],
    limit: input.limit,
    includeBrand: input.includeBrand,
  })
  return {
    schemaVersion: 1,
    site: input.site,
    generatedAt: new Date().toISOString(),
    comparison: 'previous-period',
    ranges: { current, previous },
    rangeDays:
      Math.floor(
        (new Date(`${current.endDate}T00:00:00.000Z`).getTime() -
          new Date(`${current.startDate}T00:00:00.000Z`).getTime()) /
          86_400_000,
      ) + 1,
    dataStatus: 'unavailable',
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      aggregationType: 'auto',
      searchType: 'web',
      dataState: 'final',
      current: {
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      previous: {
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      completeness: 'unavailable',
    },
    methodology: {
      id: 'gsc_retained_query_page_decay_v2',
      version: 2,
      gscHistoryMonths: 16,
      missingRowsTreatedAsZero: false,
      urlShiftsExcluded: true,
      causeLanguage: 'signals-not-attribution',
    },
    filters: {
      minDropPct: 20,
      minPreviousClicks: 2,
      minClickLoss: 1,
      limit: input.limit ?? 25,
      brand: input.includeBrand ? 'included' : 'excluded',
    },
    selection: analysis.selection,
    summary: {
      eligibleRows: 0,
      returnedRows: 0,
      groups: 0,
      observedRetainedQueryClickLoss: 0,
      returnedObservedRetainedQueryClickLoss: 0,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: 'Decay analysis was skipped.',
    },
    caveats: [
      'Decay analysis was skipped because required GSC data was unavailable.',
    ],
    recommendations: [
      'Run this section again after the property has enough query/page history.',
    ],
    items: analysis.items,
    groups: analysis.groups,
    templates: analysis.templates,
    ledgerSummary: 'GSC: 0 calls, 0 rows.',
    warnings: [],
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

export type DiagnosePropertyDependencies = {
  trafficAnomaly: typeof trafficAnomaly
  updateCorrelation: typeof updateCorrelation
  segmentImpact: typeof segmentImpact
  decayingReport: typeof decayingReport
  cannibalReport: typeof cannibalReport
  strikingDistance: typeof strikingDistance
  quickWinsReport: typeof quickWinsReport
}

const defaultDependencies: DiagnosePropertyDependencies = {
  trafficAnomaly,
  updateCorrelation,
  segmentImpact,
  decayingReport,
  cannibalReport,
  strikingDistance,
  quickWinsReport,
}

export async function diagnoseProperty(
  input: {
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
  },
  dependencies: Partial<DiagnosePropertyDependencies> = {},
): Promise<DiagnosePropertyReport> {
  const providers = { ...defaultDependencies, ...dependencies }
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
  const skipped = <T>(
    label: string,
    value: T,
    reason: string,
  ): SectionResult<T> => {
    input.progress?.(`Skipped ${label}: ${reason}`)
    return {
      status: 'skipped',
      value,
      skipped: { section: label, reason },
    }
  }

  const anomalyResult = await track(
    'traffic anomaly',
    () => providers.trafficAnomaly(input),
    () => emptyAnomaly(input),
  )
  const updateTask =
    anomalyResult.status === 'skipped'
      ? Promise.resolve(
          skipped(
            'update correlation',
            emptyUpdateCorrelation(input, {
              reason: `Traffic anomaly evidence was unavailable: ${anomalyResult.skipped.reason}`,
              source: 'traffic-anomaly',
            }),
            `Traffic anomaly evidence was unavailable: ${anomalyResult.skipped.reason}`,
          ),
        )
      : track(
          'update correlation',
          () =>
            providers.updateCorrelation({
              ...input,
              trafficAnomalies: anomalyResult.value.anomalies,
            }),
          (error) =>
            emptyUpdateCorrelation(input, {
              reason: errorReason(error),
              source: 'search-status',
            }),
        )
  const segmentUnavailable = segmentWindowUnavailableReason(input)
  const segmentTask = (
    label: string,
    dimension: SegmentImpactReport['dimension'],
  ): Promise<SectionResult<SegmentImpactReport>> =>
    segmentUnavailable
      ? Promise.resolve(
          skipped(
            label,
            emptySegment({ ...input, dimension }, segmentUnavailable),
            segmentUnavailable,
          ),
        )
      : track(
          label,
          () => providers.segmentImpact({ ...input, dimension, limit }),
          (error) => emptySegment({ ...input, dimension }, errorReason(error)),
        )
  const [
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
    updateTask,
    segmentTask('page movement segments', 'page'),
    segmentTask('query movement segments', 'query'),
    segmentTask('device movement segments', 'device'),
    segmentTask('country movement segments', 'country'),
    track(
      'decay analysis',
      () =>
        providers.decayingReport({
          site: input.site,
          days: input.days,
          startDate: input.startDate,
          endDate: input.endDate,
          limit,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
          refresh: input.refresh,
        }),
      () => emptyDecay({ ...input, limit }),
    ),
    track(
      'cannibalisation analysis',
      () =>
        providers.cannibalReport({
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
      () => providers.strikingDistance({ ...input, limit }),
      () => emptyStriking(input),
    ),
    track(
      'quick-win opportunities',
      () =>
        providers.quickWinsReport({
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
  const sectionResults = [
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
  ]
  const skippedSections = sectionResults.flatMap((result) =>
    result.status === 'skipped' ? [result.skipped] : [],
  )

  const priorities = buildDiagnosisPriorities({
    anomaly,
    update,
    page,
    decay,
    cannibal,
    striking,
    quickWins,
  })

  const partialReasons = diagnosisPartialReasons({
    segments: { page, query, device, country },
    decay,
    cannibalization: cannibal,
    strikingDistance: striking,
    quickWins,
  })
  const criticalResults = [
    anomalyResult,
    updateResult,
    pageResult,
    decayResult,
    cannibalResult,
    strikingResult,
    quickWinsResult,
  ]
  const dataStatus = diagnosisDataStatus({
    criticalStatuses: criticalResults.map((result) => result.status),
    skippedSections: skippedSections.length,
    partialReasons: partialReasons.length,
  })
  const updateAttributionStatus =
    updateResult.status === 'skipped' ? 'unavailable' : 'available'

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    dataStatus,
    summary: {
      updateAttribution:
        updateAttributionStatus === 'available'
          ? update.classification
          : 'unavailable',
      updateAttributionStatus,
      classification: update.classification,
      significantAnomalies: anomaly.anomalies.filter((item) => item.significant)
        .length,
      updateMatches: update.overlappingUpdates.length,
      largestPageMovements: page.items.length,
      decayItems: decay.selection.eligibleRows,
      cannibalItems: cannibal.selection.eligibleClusters,
      strikingDistanceItems: striking.items.length,
      quickWinItems: quickWins.items.length,
    },
    skippedSections,
    partialReasons,
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
