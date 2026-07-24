import type { ProviderValue } from '../../providers/contracts.js'
import type {
  CompetitiveDomainComparison,
  CompetitiveDomainRatingObservation,
  CompetitiveDomainSummary,
  CompetitiveKeywordCandidate,
  CompetitiveKeywordOpportunity,
  CompetitiveLinkSummaryObservation,
  CompetitiveOpportunitiesReport,
  CompetitiveOpportunityFinding,
  CompetitiveReviewReason,
  CompetitiveSerpObservation,
} from '../competitive-opportunity-contract.js'
import { COMPETITIVE_OPPORTUNITY_LIMITS } from './input.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^www\./u, '')
    .replace(/\.$/u, '')
}

function normalizedKeyword(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase()
}

function targetResult(domain: string, target: string): boolean {
  const normalized = normalizedDomain(domain)
  return normalized === target || normalized.endsWith(`.${target}`)
}

export function aggregateCompetitiveDomains(input: {
  observations: CompetitiveSerpObservation[]
  target: string
  limit: number
}): {
  competitors: CompetitiveDomainSummary[]
  organicRowsRead: number
  recurringCompetitors: number
} {
  const domains = new Map<
    string,
    {
      appearances: number
      bestAbsoluteRank: number
      keywords: Set<string>
      urls: Set<string>
      evidenceRefs: string[]
    }
  >()
  const rankedDomainsByKeyword: string[][] = []
  let organicRowsRead = 0
  for (const [observationIndex, observation] of input.observations.entries()) {
    const results = observation.report?.evidence.data.organicResults ?? []
    const rankedDomains = new Map<string, number>()
    organicRowsRead += results.length
    for (const [resultIndex, result] of results.entries()) {
      const domain = normalizedDomain(result.domain)
      if (!domain || targetResult(domain, input.target)) continue
      rankedDomains.set(
        domain,
        Math.min(
          rankedDomains.get(domain) ?? Number.MAX_SAFE_INTEGER,
          result.rankAbsolute,
        ),
      )
      const existing = domains.get(domain) ?? {
        appearances: 0,
        bestAbsoluteRank: result.rankAbsolute,
        keywords: new Set<string>(),
        urls: new Set<string>(),
        evidenceRefs: [],
      }
      existing.appearances++
      existing.bestAbsoluteRank = Math.min(
        existing.bestAbsoluteRank,
        result.rankAbsolute,
      )
      existing.keywords.add(observation.keyword)
      existing.urls.add(result.url)
      existing.evidenceRefs.push(
        `source.serps.observations[${observationIndex}].report.evidence.data.organicResults[${resultIndex}]`,
      )
      domains.set(domain, existing)
    }
    rankedDomainsByKeyword.push(
      [...rankedDomains.entries()]
        .sort(
          ([leftDomain, leftRank], [rightDomain, rightRank]) =>
            leftRank - rightRank || compareText(leftDomain, rightDomain),
        )
        .map(([domain]) => domain),
    )
  }
  const selectedDomains: string[] = []
  const selected = new Set<string>()
  for (
    let resultIndex = 0;
    selectedDomains.length < input.limit;
    resultIndex++
  ) {
    let rowsRemain = false
    for (const rankedDomains of rankedDomainsByKeyword) {
      const domain = rankedDomains[resultIndex]
      if (!domain) continue
      rowsRemain = true
      if (selected.has(domain)) continue
      selected.add(domain)
      selectedDomains.push(domain)
      if (selectedDomains.length >= input.limit) break
    }
    if (!rowsRemain) break
  }
  const competitors = selectedDomains.map((domain) => {
    const value = domains.get(domain)
    if (!value) {
      throw new Error('Selected competitive domain is missing its summary.')
    }
    return {
      domain,
      appearances: value.appearances,
      keywordCoverage: value.keywords.size,
      bestAbsoluteRank: value.bestAbsoluteRank,
      keywords: [...value.keywords].sort(compareText),
      representativeUrls: [...value.urls].sort(compareText).slice(0, 5),
      evidenceRefs: value.evidenceRefs,
    }
  })
  return {
    competitors,
    organicRowsRead,
    recurringCompetitors: [...domains.values()].filter(
      (domain) => domain.keywords.size > 1,
    ).length,
  }
}

function observedNumber(
  value: ProviderValue<number> | undefined,
): number | null {
  return value?.state === 'observed' ? value.value : null
}

function compareMetric(
  value: number | null,
  target: number | null,
): 'lower' | 'equal' | 'higher' | 'unknown' {
  if (value === null || target === null) return 'unknown'
  return value < target ? 'lower' : value > target ? 'higher' : 'equal'
}

function domainRating(
  observation: CompetitiveDomainRatingObservation | undefined,
): number | null {
  return observation?.report?.summary.domainRating ?? null
}

function referringDomains(
  observation: CompetitiveLinkSummaryObservation | undefined,
): number | null {
  return observedNumber(observation?.evidence?.data.referringDomains)
}

function observedVolume(candidate: CompetitiveKeywordCandidate): number {
  const value = candidate.metrics?.monthlySearchVolume
  return value?.state === 'observed' ? value.value : -1
}

function reviewReasons(input: {
  candidate: CompetitiveKeywordCandidate
  targetRanks: number[]
  targetEvidenceRefs: string[]
  competitors: CompetitiveDomainComparison[]
  candidateIndex: number
}): CompetitiveReviewReason[] {
  const reasons: CompetitiveReviewReason[] = []
  if (input.targetRanks.length) {
    reasons.push({
      code: 'target-already-observed',
      evidenceRefs: input.targetEvidenceRefs,
      detail: `The target appears at absolute rank${input.targetRanks.length === 1 ? '' : 's'} ${input.targetRanks.join(', ')} in the retained current result snapshot.`,
    })
  }
  const volume = input.candidate.metrics?.monthlySearchVolume
  if (volume?.state === 'observed' && volume.value > 0) {
    reasons.push({
      code: 'observed-search-volume',
      evidenceRefs: [
        `candidates[${input.candidateIndex}].metrics.monthlySearchVolume`,
      ],
      detail: `The keyword provider returned ${volume.value.toLocaleString('en-US')} monthly searches for the selected market.`,
    })
  }
  if (input.candidate.sourceCount > 1) {
    reasons.push({
      code: 'several-discovery-sources',
      evidenceRefs: [`candidates[${input.candidateIndex}].discoverySources`],
      detail: `The keyword appeared in ${input.candidate.sourceCount} requested discovery sources.`,
    })
  }
  const lowerRatings = input.competitors.filter(
    (competitor) => competitor.domainRatingComparedWithTarget === 'lower',
  )
  if (lowerRatings.length) {
    reasons.push({
      code: 'lower-domain-rating-result',
      evidenceRefs: lowerRatings.flatMap(
        (competitor) => competitor.evidenceRefs,
      ),
      detail: `${lowerRatings.length} retained ranking domain${lowerRatings.length === 1 ? ' has' : 's have'} a lower observed Ahrefs Domain Rating than the target.`,
    })
  }
  const fewerReferringDomains = input.competitors.filter(
    (competitor) => competitor.referringDomainsComparedWithTarget === 'lower',
  )
  if (fewerReferringDomains.length) {
    reasons.push({
      code: 'fewer-referring-domains-result',
      evidenceRefs: fewerReferringDomains.flatMap(
        (competitor) => competitor.evidenceRefs,
      ),
      detail: `${fewerReferringDomains.length} retained ranking domain${fewerReferringDomains.length === 1 ? ' has' : 's have'} fewer provider-observed referring domains than the target.`,
    })
  }
  return reasons
}

function opportunityFinding(
  keyword: string,
  reason: CompetitiveReviewReason,
): CompetitiveOpportunityFinding {
  const principles: Record<CompetitiveReviewReason['code'], string> = {
    'target-already-observed':
      'A current target result is direct snapshot evidence of visibility for this exact market, not proof that the position will persist or improve.',
    'observed-search-volume':
      'Provider search volume is demand context for research, not measured traffic or a forecast.',
    'several-discovery-sources':
      'Repeated provider discovery is a reason to inspect intent, not proof that a page should be created.',
    'lower-domain-rating-result':
      'A lower Domain Rating is supporting backlink-profile context and does not make a ranking domain easy to outrank.',
    'fewer-referring-domains-result':
      'Provider referring-domain counts describe one index and target scope. Lower counts do not prove weaker page relevance or ranking feasibility.',
  }
  return {
    code: reason.code,
    keyword,
    evidenceRefs: reason.evidenceRefs,
    principle: principles[reason.code],
    detail: reason.detail,
  }
}

export function buildCompetitiveOpportunities(input: {
  candidates: CompetitiveKeywordCandidate[]
  serps: CompetitiveSerpObservation[]
  competitors: CompetitiveDomainSummary[]
  target: string
  domainRatings: CompetitiveDomainRatingObservation[]
  linkSummaries: CompetitiveLinkSummaryObservation[]
}): {
  opportunities: CompetitiveKeywordOpportunity[]
  findings: CompetitiveOpportunityFinding[]
  candidateDomainComparisons: number
} {
  const ratingByDomain = new Map(
    input.domainRatings.map((observation) => [observation.domain, observation]),
  )
  const ratingRefByDomain = new Map(
    input.domainRatings.map((observation, index) => [
      observation.domain,
      `source.domainRatings.observations[${index}]`,
    ]),
  )
  const linksByDomain = new Map(
    input.linkSummaries.map((observation) => [observation.domain, observation]),
  )
  const linkRefByDomain = new Map(
    input.linkSummaries.map((observation, index) => [
      observation.domain,
      `source.linkSummaries.observations[${index}]`,
    ]),
  )
  const targetRating = domainRating(ratingByDomain.get(input.target))
  const targetReferringDomains = referringDomains(
    linksByDomain.get(input.target),
  )
  const retainedDomains = new Set(
    input.competitors.map((competitor) => competitor.domain),
  )
  const serpByKeyword = new Map(
    input.serps.map((observation) => [
      normalizedKeyword(observation.keyword),
      observation,
    ]),
  )
  const opportunities = input.candidates.map((candidate, candidateIndex) => {
    const serp = serpByKeyword.get(normalizedKeyword(candidate.keyword))
    const results = serp?.report?.evidence.data.organicResults ?? []
    const targetRanks = results
      .filter((result) => targetResult(result.domain, input.target))
      .map((result) => result.rankAbsolute)
      .sort((left, right) => left - right)
    const targetEvidenceRefs = results.flatMap((result, resultIndex) =>
      targetResult(result.domain, input.target)
        ? [
            `source.serps.observations[${serp ? input.serps.indexOf(serp) : -1}].report.evidence.data.organicResults[${resultIndex}]`,
          ]
        : [],
    )
    const byDomain = new Map<
      string,
      { rank: number; url: string; evidenceRef: string }
    >()
    const serpIndex = serp ? input.serps.indexOf(serp) : -1
    for (const [resultIndex, result] of results.entries()) {
      const domain = normalizedDomain(result.domain)
      if (
        !domain ||
        targetResult(domain, input.target) ||
        !retainedDomains.has(domain)
      ) {
        continue
      }
      const existing = byDomain.get(domain)
      if (!existing || result.rankAbsolute < existing.rank) {
        byDomain.set(domain, {
          rank: result.rankAbsolute,
          url: result.url,
          evidenceRef: `source.serps.observations[${serpIndex}].report.evidence.data.organicResults[${resultIndex}]`,
        })
      }
    }
    const comparisons: CompetitiveDomainComparison[] = [...byDomain]
      .map(([domain, result]) => {
        const competitorRating = domainRating(ratingByDomain.get(domain))
        const competitorReferringDomains = referringDomains(
          linksByDomain.get(domain),
        )
        return {
          domain,
          bestAbsoluteRank: result.rank,
          rankingUrl: result.url,
          domainRating: competitorRating,
          domainRatingComparedWithTarget: compareMetric(
            competitorRating,
            targetRating,
          ),
          referringDomains: competitorReferringDomains,
          referringDomainsComparedWithTarget: compareMetric(
            competitorReferringDomains,
            targetReferringDomains,
          ),
          evidenceRefs: [
            result.evidenceRef,
            ...(ratingRefByDomain.get(domain)
              ? [ratingRefByDomain.get(domain) as string]
              : []),
            ...(ratingRefByDomain.get(input.target)
              ? [ratingRefByDomain.get(input.target) as string]
              : []),
            ...(linkRefByDomain.get(domain)
              ? [linkRefByDomain.get(domain) as string]
              : []),
            ...(linkRefByDomain.get(input.target)
              ? [linkRefByDomain.get(input.target) as string]
              : []),
          ],
        }
      })
      .sort(
        (left, right) =>
          left.bestAbsoluteRank - right.bestAbsoluteRank ||
          compareText(left.domain, right.domain),
      )
    return {
      reviewOrder: 0,
      keyword: candidate.keyword,
      candidate,
      serpStatus: serp?.status ?? 'unavailable',
      targetRanks,
      competitors: comparisons,
      reviewReasons: reviewReasons({
        candidate,
        targetRanks,
        targetEvidenceRefs,
        competitors: comparisons,
        candidateIndex,
      }),
    }
  })
  opportunities.sort((left, right) => {
    const leftLowerRatings = left.competitors.filter(
      (competitor) => competitor.domainRatingComparedWithTarget === 'lower',
    ).length
    const rightLowerRatings = right.competitors.filter(
      (competitor) => competitor.domainRatingComparedWithTarget === 'lower',
    ).length
    const leftFewerLinks = left.competitors.filter(
      (competitor) => competitor.referringDomainsComparedWithTarget === 'lower',
    ).length
    const rightFewerLinks = right.competitors.filter(
      (competitor) => competitor.referringDomainsComparedWithTarget === 'lower',
    ).length
    return (
      Number(right.targetRanks.length > 0) -
        Number(left.targetRanks.length > 0) ||
      rightLowerRatings - leftLowerRatings ||
      rightFewerLinks - leftFewerLinks ||
      right.candidate.sourceCount - left.candidate.sourceCount ||
      observedVolume(right.candidate) - observedVolume(left.candidate) ||
      compareText(
        normalizedKeyword(left.keyword),
        normalizedKeyword(right.keyword),
      )
    )
  })
  opportunities.forEach((opportunity, index) => {
    opportunity.reviewOrder = index + 1
  })
  const findings = opportunities
    .flatMap((opportunity) =>
      opportunity.reviewReasons.map((reason) =>
        opportunityFinding(opportunity.keyword, reason),
      ),
    )
    .slice(0, COMPETITIVE_OPPORTUNITY_LIMITS.findings)
  return {
    opportunities,
    findings,
    candidateDomainComparisons: opportunities.reduce(
      (total, opportunity) => total + opportunity.competitors.length,
      0,
    ),
  }
}

export function competitiveDataStatus(input: {
  keywordResearchStatus: 'complete' | 'partial' | 'unavailable'
  serps: CompetitiveSerpObservation[]
  domainRatings: CompetitiveDomainRatingObservation[]
  linkSummaries: CompetitiveLinkSummaryObservation[]
  candidates: CompetitiveKeywordCandidate[]
}): CompetitiveOpportunitiesReport['dataStatus'] {
  if (!input.candidates.length) return 'empty'
  const completedSerps = input.serps.filter((observation) => observation.report)
  if (!completedSerps.length) return 'unavailable'
  if (
    input.keywordResearchStatus !== 'complete' ||
    input.serps.some((observation) => observation.status !== 'complete') ||
    input.domainRatings.some(
      (observation) => observation.status !== 'complete',
    ) ||
    input.linkSummaries.some((observation) => observation.status !== 'complete')
  ) {
    return 'partial'
  }
  return 'complete'
}
