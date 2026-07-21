import type { SearchMarket } from '../../providers/contracts.js'
import type {
  PseoExternalCandidate,
  PseoSerpEvidence,
  PseoSerpObservation,
} from '../pseo-opportunity-contract.js'
import { type SerpResultsReport, serpResultsReport } from '../serp-results.js'
import {
  pseoExternalAcquisition,
  pseoProviderFailure,
} from './external-common.js'
import {
  PSEO_OPPORTUNITY_LIMITS,
  type ValidatedPseoOpportunitiesInput,
} from './input.js'

function selectSerpKeywords(
  candidates: PseoExternalCandidate[],
  limit: number,
): string[] {
  const seedRefs = new Set<string>()
  const selected: string[] = []
  for (const candidate of candidates) {
    if (candidate.classification === 'existing-first-party-query') continue
    const firstNewSeed = candidate.seedRefs.find((ref) => !seedRefs.has(ref))
    if (firstNewSeed || !candidate.seedRefs.length || !selected.length) {
      selected.push(candidate.keyword)
      for (const ref of candidate.seedRefs) seedRefs.add(ref)
    }
    if (selected.length >= limit) break
  }
  if (selected.length < limit) {
    for (const candidate of candidates) {
      if (
        candidate.classification !== 'existing-first-party-query' &&
        !selected.includes(candidate.keyword)
      ) {
        selected.push(candidate.keyword)
      }
      if (selected.length >= limit) break
    }
  }
  return selected
}

export async function acquirePseoSerps(input: {
  options: ValidatedPseoOpportunitiesInput
  candidates: PseoExternalCandidate[]
  runId: string
  report?: typeof serpResultsReport
}): Promise<{
  evidence: PseoSerpEvidence
  reports: SerpResultsReport[]
}> {
  const keywords = selectSerpKeywords(input.candidates, input.options.serpLimit)
  if (!input.options.serpLimit || !keywords.length) {
    return {
      evidence: {
        requested: input.options.serpLimit > 0,
        requestedQueries: 0,
        completedQueries: 0,
        failedQueries: 0,
        observations: [],
      },
      reports: [],
    }
  }
  const observations: PseoSerpObservation[] = []
  const reports: SerpResultsReport[] = []
  for (const keyword of keywords) {
    try {
      const report = await (input.report ?? serpResultsReport)({
        keyword,
        market: input.options.market as SearchMarket,
        depth: input.options.serpDepth,
        provider: input.options.provider,
        projectId: input.options.projectId,
        context: {
          reportId: 'pseo-opportunities',
          reportRunId: input.runId,
        },
        refresh: input.options.refresh,
      })
      reports.push(report)
      const organicResults = report.evidence.data.organicResults.slice(
        0,
        PSEO_OPPORTUNITY_LIMITS.organicResultsPerSnapshot,
      )
      observations.push({
        keyword,
        status: report.dataStatus,
        acquisition: pseoExternalAcquisition(report),
        features: report.evidence.data.features,
        organicResults,
        resultCoverage: {
          available: report.evidence.data.organicResults.length,
          returned: organicResults.length,
          omitted: Math.max(
            0,
            report.evidence.data.organicResults.length - organicResults.length,
          ),
        },
      })
    } catch (error) {
      const failure = pseoProviderFailure(error)
      observations.push({
        keyword,
        status: 'unavailable',
        acquisition: null,
        features: [],
        organicResults: [],
        resultCoverage: { available: 0, returned: 0, omitted: 0 },
        reason: failure.message,
        error: failure,
      })
    }
  }
  return {
    evidence: {
      requested: true,
      requestedQueries: keywords.length,
      completedQueries: observations.filter(
        (observation) => observation.status !== 'unavailable',
      ).length,
      failedQueries: observations.filter(
        (observation) => observation.status === 'unavailable',
      ).length,
      observations,
    },
    reports,
  }
}
