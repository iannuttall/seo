import type { SearchMarket } from '../../providers/contracts.js'
import {
  type KeywordMetricsReport,
  keywordMetricsReport,
} from '../keyword-metrics.js'
import { normalizePseoText } from '../pseo/query-insights.js'
import {
  pseoExternalAcquisition,
  pseoProviderFailure,
} from '../pseo-opportunities/external-common.js'
import type {
  PseoObservedPatternQuery,
  PseoPatternCandidate,
  PseoPatternKeywordEvidence,
  PseoPatternSerpObservation,
} from '../pseo-pattern-contract.js'
import { type SerpResultsReport, serpResultsReport } from '../serp-results.js'
import type { ValidatedPseoPatternsInput } from './input.js'
import { PSEO_PATTERN_LIMITS } from './input.js'

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validProviderKeyword(keyword: string): boolean {
  const value = keyword.trim()
  return (
    value.length > 0 && value.length <= 80 && value.split(/\s+/u).length <= 10
  )
}

function candidateOrder(
  left: PseoPatternCandidate,
  right: PseoPatternCandidate,
): number {
  const reviewOrder: Record<PseoPatternCandidate['review']['state'], number> = {
    'search-evidenced-gap': 0,
    'strategic-gap': 1,
    'existing-topic': 2,
    'possible-overlap': 3,
    'research-only': 4,
    'inventory-unknown': 5,
  }
  return (
    reviewOrder[left.review.state] - reviewOrder[right.review.state] ||
    right.firstParty.impressions - left.firstParty.impressions ||
    compareCodepoints(left.id, right.id)
  )
}

export function selectPseoPatternKeywords(input: {
  candidates: PseoPatternCandidate[]
  observedQueries: PseoObservedPatternQuery[]
  limit: number
}): {
  available: number
  selected: string[]
} {
  const primary: string[] = []
  const secondary: string[] = []
  for (const candidate of [...input.candidates].sort(candidateOrder)) {
    const variants = [...candidate.queryVariants].sort(
      (left, right) =>
        Number(right.state === 'retained') -
          Number(left.state === 'retained') ||
        right.impressions - left.impressions ||
        compareCodepoints(left.query, right.query),
    )
    const [first, ...remaining] = variants
    if (first) primary.push(first.query)
    secondary.push(...remaining.map((variant) => variant.query))
  }
  const ordered = [
    ...primary,
    ...input.observedQueries.map((query) => query.query),
    ...secondary,
  ]
  const unique = new Map<string, string>()
  for (const keyword of ordered) {
    if (!validProviderKeyword(keyword)) continue
    const normalized = normalizePseoText(keyword)
    if (!unique.has(normalized)) unique.set(normalized, keyword)
  }
  return {
    available: unique.size,
    selected: [...unique.values()].slice(0, input.limit),
  }
}

export async function acquirePseoPatternKeywordMetrics(input: {
  options: ValidatedPseoPatternsInput
  candidates: PseoPatternCandidate[]
  observedQueries: PseoObservedPatternQuery[]
  runId: string
  report?: typeof keywordMetricsReport
}): Promise<PseoPatternKeywordEvidence> {
  if (!input.options.includeExternal) {
    return {
      requested: false,
      status: 'not-requested',
      acquisition: null,
      availableKeywords: 0,
      selectedKeywords: 0,
      omittedKeywords: 0,
      rows: [],
      reason:
        'External keyword metrics were not requested, so no paid provider call was made.',
    }
  }
  const keywords = selectPseoPatternKeywords({
    candidates: input.candidates,
    observedQueries: input.observedQueries,
    limit: input.options.keywordLimit,
  })
  if (!input.options.keywordLimit || !keywords.selected.length) {
    return {
      requested: true,
      status: 'skipped',
      acquisition: null,
      availableKeywords: keywords.available,
      selectedKeywords: 0,
      omittedKeywords: keywords.available,
      rows: [],
      reason:
        input.options.keywordLimit === 0
          ? 'keywordLimit is zero, so keyword metric acquisition was skipped.'
          : 'No bounded candidate or retained pattern query was eligible for keyword metrics.',
    }
  }
  try {
    const report = await (input.report ?? keywordMetricsReport)({
      keywords: keywords.selected,
      market: input.options.market as SearchMarket,
      provider: input.options.provider,
      projectId: input.options.projectId,
      context: {
        reportId: 'pseo-patterns',
        reportRunId: input.runId,
      },
      refresh: input.options.refresh,
    })
    return {
      requested: true,
      status: report.dataStatus,
      acquisition: pseoExternalAcquisition(report),
      availableKeywords: keywords.available,
      selectedKeywords: keywords.selected.length,
      omittedKeywords: Math.max(
        0,
        keywords.available - keywords.selected.length,
      ),
      rows: report.evidence.data.map((metric) => ({
        keyword: metric.keyword,
        monthlySearchVolume: metric.monthlySearchVolume,
        keywordDifficulty: metric.keywordDifficulty,
        intent: metric.intent,
        resultCount: metric.resultCount,
      })),
    }
  } catch (error) {
    const failure = pseoProviderFailure(error)
    return {
      requested: true,
      status: 'unavailable',
      acquisition: null,
      availableKeywords: keywords.available,
      selectedKeywords: keywords.selected.length,
      omittedKeywords: Math.max(
        0,
        keywords.available - keywords.selected.length,
      ),
      rows: [],
      reason: failure.message,
      error: failure,
    }
  }
}

function selectSerpKeywords(input: {
  candidates: PseoPatternCandidate[]
  observedQueries: PseoObservedPatternQuery[]
  limit: number
}): string[] {
  return selectPseoPatternKeywords(input).selected
}

function unavailableSerpObservation(
  keyword: string,
  failure: ReturnType<typeof pseoProviderFailure>,
  reason = failure.message,
  status: PseoPatternSerpObservation['status'] = 'unavailable',
): PseoPatternSerpObservation {
  return {
    keyword,
    status,
    acquisition: null,
    features: [],
    organicResults: [],
    reason,
    error: failure,
  }
}

export async function acquirePseoPatternSerps(input: {
  options: ValidatedPseoPatternsInput
  candidates: PseoPatternCandidate[]
  observedQueries: PseoObservedPatternQuery[]
  runId: string
  report?: typeof serpResultsReport
}): Promise<{
  requested: boolean
  requestedQueries: number
  completedQueries: number
  failedQueries: number
  notAttemptedQueries: number
  observations: PseoPatternSerpObservation[]
}> {
  if (!input.options.includeExternal || input.options.serpLimit === 0) {
    return {
      requested: false,
      requestedQueries: 0,
      completedQueries: 0,
      failedQueries: 0,
      notAttemptedQueries: 0,
      observations: [],
    }
  }
  const keywords = selectSerpKeywords({
    candidates: input.candidates,
    observedQueries: input.observedQueries,
    limit: input.options.serpLimit,
  })
  const observations: PseoPatternSerpObservation[] = []
  for (const [index, keyword] of keywords.entries()) {
    try {
      const report = await (input.report ?? serpResultsReport)({
        keyword,
        market: input.options.market as SearchMarket,
        depth: input.options.serpDepth,
        provider: input.options.provider,
        projectId: input.options.projectId,
        context: {
          reportId: 'pseo-patterns',
          reportRunId: input.runId,
        },
        refresh: input.options.refresh,
      })
      observations.push({
        keyword,
        status: report.dataStatus,
        acquisition: pseoExternalAcquisition(report),
        features: report.evidence.data.features,
        organicResults: report.evidence.data.organicResults
          .slice(0, PSEO_PATTERN_LIMITS.organicResultsPerSnapshot)
          .map((result) => ({
            rankGroup: result.rankGroup,
            rankAbsolute: result.rankAbsolute,
            domain: result.domain,
            url: result.url,
            title: result.title,
          })),
      })
    } catch (error) {
      const failure = pseoProviderFailure(error)
      observations.push(unavailableSerpObservation(keyword, failure))
      for (const remaining of keywords.slice(index + 1)) {
        observations.push(
          unavailableSerpObservation(
            remaining,
            failure,
            `Not attempted after ${keyword} failed: ${failure.message}`,
            'not-attempted',
          ),
        )
      }
      break
    }
  }
  return {
    requested: true,
    requestedQueries: keywords.length,
    completedQueries: observations.filter(
      (observation) =>
        observation.status === 'complete' || observation.status === 'partial',
    ).length,
    failedQueries: observations.filter(
      (observation) => observation.status === 'unavailable',
    ).length,
    notAttemptedQueries: observations.filter(
      (observation) => observation.status === 'not-attempted',
    ).length,
    observations,
  }
}

export type PseoPatternExternalDependencies = {
  keywordMetricsReport?: (
    ...args: Parameters<typeof keywordMetricsReport>
  ) => Promise<KeywordMetricsReport>
  serpResultsReport?: (
    ...args: Parameters<typeof serpResultsReport>
  ) => Promise<SerpResultsReport>
}
