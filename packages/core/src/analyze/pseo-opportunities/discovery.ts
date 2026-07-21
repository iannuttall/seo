import { SeoError } from '../../errors.js'
import type { SearchMarket } from '../../providers/contracts.js'
import {
  type KeywordResearchReport,
  keywordResearchReport,
} from '../keyword-research.js'
import { normalizePseoText } from '../pseo/query-insights.js'
import type {
  PseoDiscoveryEvidence,
  PseoExternalCandidate,
  PseoResearchSeed,
} from '../pseo-opportunity-contract.js'
import {
  pseoExternalAcquisition,
  pseoProviderFailure,
} from './external-common.js'
import {
  comparePseoOpportunityText,
  type ValidatedPseoOpportunitiesInput,
} from './input.js'

function projectCandidates(input: {
  report: KeywordResearchReport
  seeds: PseoResearchSeed[]
  knownQueries: Set<string>
  limit: number
}): { candidates: PseoExternalCandidate[]; available: number } {
  const seedsByKeyword = new Map(
    input.seeds.map((seed) => [normalizePseoText(seed.keyword), seed]),
  )
  const candidates = input.report.evidence.data.map((idea) => {
    const mappedSeeds = idea.sources
      .map((source) => seedsByKeyword.get(normalizePseoText(source.seed)))
      .filter((seed): seed is PseoResearchSeed => Boolean(seed))
    const templateRefs = [
      ...new Set(
        mappedSeeds
          .map((seed) => seed.templateRef)
          .filter((ref): ref is string => Boolean(ref)),
      ),
    ].sort(comparePseoOpportunityText)
    const seedRefs = [
      ...new Set(mappedSeeds.map((seed) => seed.evidenceRef)),
    ].sort(comparePseoOpportunityText)
    const classification = input.knownQueries.has(
      normalizePseoText(idea.keyword),
    )
      ? 'existing-first-party-query'
      : templateRefs.length
        ? 'search-evidenced-template-expansion'
        : 'new-template-research'
    return {
      keyword: idea.keyword,
      classification,
      seedRefs,
      templateRefs,
      sources: idea.sources,
      monthlySearchVolume: idea.monthlySearchVolume,
      keywordDifficulty: idea.keywordDifficulty,
      intent: idea.intent,
      resultCount: idea.resultCount,
      evidenceRef: '',
    } satisfies PseoExternalCandidate
  })
  candidates.sort((left, right) => {
    const classOrder = {
      'search-evidenced-template-expansion': 0,
      'new-template-research': 1,
      'existing-first-party-query': 2,
    }
    const classification =
      classOrder[left.classification] - classOrder[right.classification]
    if (classification) return classification
    const sourceCount = right.sources.length - left.sources.length
    if (sourceCount) return sourceCount
    const leftVolume =
      left.monthlySearchVolume.state === 'observed'
        ? left.monthlySearchVolume.value
        : -1
    const rightVolume =
      right.monthlySearchVolume.state === 'observed'
        ? right.monthlySearchVolume.value
        : -1
    return (
      rightVolume - leftVolume ||
      comparePseoOpportunityText(left.keyword, right.keyword)
    )
  })
  return {
    candidates: candidates.slice(0, input.limit).map((candidate, index) => ({
      ...candidate,
      evidenceRef: `source.external.discovery.candidates[${index}]`,
    })),
    available: candidates.length,
  }
}

export async function acquirePseoDiscovery(input: {
  options: ValidatedPseoOpportunitiesInput
  seeds: PseoResearchSeed[]
  knownQueries: Set<string>
  runId: string
  report?: typeof keywordResearchReport
}): Promise<PseoDiscoveryEvidence> {
  if (!input.options.includeExternal) {
    return {
      requested: false,
      status: 'not-requested',
      seeds: input.seeds,
      acquisition: null,
      availableCandidates: 0,
      returnedCandidates: 0,
      omittedCandidates: 0,
      candidates: [],
      reason:
        'External discovery was not requested, so no paid provider call was made.',
    }
  }
  if (!input.seeds.length) {
    return {
      requested: true,
      status: 'skipped',
      seeds: [],
      acquisition: null,
      availableCandidates: 0,
      returnedCandidates: 0,
      omittedCandidates: 0,
      candidates: [],
      reason:
        'No retained first-party template or query cluster supplied an eligible discovery seed.',
    }
  }
  const providerRequests = input.options.discoverySources.reduce(
    (total, source) => total + (source === 'ideas' ? 1 : input.seeds.length),
    0,
  )
  if (input.options.discoveryLimit < providerRequests) {
    throw new SeoError(
      'INVALID_INPUT',
      `discoveryLimit must be at least ${providerRequests} to sample every selected seed and source.`,
    )
  }
  try {
    const report = await (input.report ?? keywordResearchReport)({
      seeds: input.seeds.map((seed) => seed.keyword),
      sources: input.options.discoverySources,
      market: input.options.market as SearchMarket,
      limit: input.options.discoveryLimit,
      provider: input.options.provider,
      projectId: input.options.projectId,
      context: {
        reportId: 'pseo-opportunities',
        reportRunId: input.runId,
      },
      refresh: input.options.refresh,
    })
    const projected = projectCandidates({
      report,
      seeds: input.seeds,
      knownQueries: input.knownQueries,
      limit: input.options.candidateLimit,
    })
    return {
      requested: true,
      status: report.dataStatus,
      seeds: input.seeds,
      acquisition: pseoExternalAcquisition(report),
      availableCandidates: projected.available,
      returnedCandidates: projected.candidates.length,
      omittedCandidates: Math.max(
        0,
        projected.available - projected.candidates.length,
      ),
      candidates: projected.candidates,
    }
  } catch (error) {
    const failure = pseoProviderFailure(error)
    return {
      requested: true,
      status: 'unavailable',
      seeds: input.seeds,
      acquisition: null,
      availableCandidates: 0,
      returnedCandidates: 0,
      omittedCandidates: 0,
      candidates: [],
      reason: failure.message,
      error: failure,
    }
  }
}
