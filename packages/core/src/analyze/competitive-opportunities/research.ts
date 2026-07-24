import { SeoError } from '../../errors.js'
import type { KeywordIdea } from '../../providers/contracts.js'
import type {
  CompetitiveKeywordCandidate,
  CompetitiveSerpObservation,
} from '../competitive-opportunity-contract.js'
import type { KeywordResearchReport } from '../keyword-research.js'
import { type SerpResultsReport, serpResultsReport } from '../serp-results.js'
import type { ValidatedCompetitiveOpportunitiesInput } from './input.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedKeyword(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase()
}

function observedVolume(idea: KeywordIdea): number {
  return idea.monthlySearchVolume.state === 'observed'
    ? idea.monthlySearchVolume.value
    : -1
}

function candidate(
  keyword: string,
  idea: KeywordIdea | undefined,
  seed: boolean,
): CompetitiveKeywordCandidate {
  const sourceCount = idea
    ? new Set(idea.sources.map((source) => source.source)).size
    : 0
  const seedCount = idea
    ? new Set(idea.sources.map((source) => normalizedKeyword(source.seed))).size
    : 0
  return {
    keyword,
    origin: seed ? (idea ? 'seed-and-discovered' : 'seed') : 'discovered',
    discoverySources: idea?.sources ?? [],
    metrics: idea
      ? {
          monthlySearchVolume: idea.monthlySearchVolume,
          monthlySearches: idea.monthlySearches,
          searchVolumeUpdatedAt: idea.searchVolumeUpdatedAt,
          cpcUsd: idea.cpcUsd,
          paidCompetition: idea.paidCompetition,
          keywordDifficulty: idea.keywordDifficulty,
          intent: idea.intent,
          resultCount: idea.resultCount,
        }
      : null,
    sourceCount,
    seedCount,
  }
}

export function selectCompetitiveCandidates(input: {
  report: KeywordResearchReport
  seeds: string[]
  limit: number
}): CompetitiveKeywordCandidate[] {
  const ideasByKeyword = new Map(
    input.report.evidence.data.map((idea) => [
      normalizedKeyword(idea.keyword),
      idea,
    ]),
  )
  const selected: CompetitiveKeywordCandidate[] = []
  const seen = new Set<string>()

  for (const seed of input.seeds) {
    const key = normalizedKeyword(seed)
    if (seen.has(key)) continue
    seen.add(key)
    selected.push(candidate(seed, ideasByKeyword.get(key), true))
    if (selected.length >= input.limit) return selected
  }

  const ideas = [...input.report.evidence.data].sort((left, right) => {
    const leftSources = new Set(left.sources.map((source) => source.source))
      .size
    const rightSources = new Set(right.sources.map((source) => source.source))
      .size
    return (
      rightSources - leftSources ||
      observedVolume(right) - observedVolume(left) ||
      compareText(
        normalizedKeyword(left.keyword),
        normalizedKeyword(right.keyword),
      )
    )
  })
  for (const idea of ideas) {
    const key = normalizedKeyword(idea.keyword)
    if (seen.has(key)) continue
    seen.add(key)
    selected.push(candidate(idea.keyword, idea, false))
    if (selected.length >= input.limit) break
  }
  return selected
}

function failureReason(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The current result request failed.'
}

function shouldStopSerpAcquisition(
  error: unknown,
  observations: CompetitiveSerpObservation[],
): boolean {
  return (
    error instanceof SeoError &&
    (['INVALID_INPUT', 'RATE_LIMITED'].includes(error.code) ||
      (error.code === 'PROVIDER_UNAVAILABLE' &&
        !observations.some((observation) => observation.report)))
  )
}

export async function acquireCompetitiveSerps(input: {
  options: ValidatedCompetitiveOpportunitiesInput
  candidates: CompetitiveKeywordCandidate[]
  reportRunId: string
  report?: typeof serpResultsReport
}): Promise<CompetitiveSerpObservation[]> {
  const observations: CompetitiveSerpObservation[] = []
  for (const [candidateIndex, item] of input.candidates.entries()) {
    try {
      const report: SerpResultsReport = await (
        input.report ?? serpResultsReport
      )({
        keyword: item.keyword,
        market: input.options.market,
        depth: input.options.serpDepth,
        provider: input.options.serpProvider,
        projectId: input.options.projectId,
        context: {
          reportId: 'competitive-opportunities',
          reportRunId: input.reportRunId,
        },
        refresh: input.options.refresh,
      })
      observations.push({
        keyword: item.keyword,
        status: report.dataStatus,
        report,
        reason: null,
      })
    } catch (error) {
      if (shouldStopSerpAcquisition(error, observations)) throw error
      const reason = failureReason(error)
      observations.push({
        keyword: item.keyword,
        status: 'unavailable',
        report: null,
        reason,
      })
      if (error instanceof SeoError && error.code === 'PROVIDER_UNAVAILABLE') {
        observations.push(
          ...input.candidates.slice(candidateIndex + 1).map((candidate) => ({
            keyword: candidate.keyword,
            status: 'unavailable' as const,
            report: null,
            reason: `Not requested after the provider became unavailable: ${reason}`,
          })),
        )
        break
      }
    }
  }
  return observations
}
