import { SeoError } from '../../errors.js'
import type { ProviderCostEvidence } from '../../providers/contracts.js'
import type { KeywordResearchReport } from '../keyword-research.js'
import type {
  PseoExternalAcquisition,
  PseoKnownCost,
} from '../pseo-opportunity-contract.js'
import type { SerpResultsReport } from '../serp-results.js'
import { comparePseoOpportunityText } from './input.js'

export function pseoExternalAcquisition(
  report: KeywordResearchReport | SerpResultsReport,
): PseoExternalAcquisition {
  const {
    provider,
    observedAt,
    market,
    coverage,
    cache,
    cost,
    request,
    warnings,
  } = report.evidence
  return {
    provider,
    observedAt,
    market,
    coverage,
    cache,
    cost,
    request,
    warnings,
  }
}

export function pseoProviderFailure(error: unknown) {
  if (
    error instanceof SeoError &&
    (error.code === 'PROVIDER_UNAVAILABLE' || error.code === 'RATE_LIMITED')
  ) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    }
  }
  throw error
}

export function aggregatePseoExternalCost(
  costs: ProviderCostEvidence[],
): PseoKnownCost {
  const estimated = costs.map((cost) => cost.estimatedMicros)
  const actual = costs.map((cost) => cost.actualMicros)
  return {
    currency: 'USD',
    knownEstimatedMicros: estimated.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    ),
    knownActualMicros: actual.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    ),
    unknownEstimatedRequests: estimated.filter((value) => value === null)
      .length,
    unknownActualRequests: actual.filter((value) => value === null).length,
    taskIds: [...new Set(costs.flatMap((cost) => cost.taskIds))].sort(
      comparePseoOpportunityText,
    ),
  }
}
