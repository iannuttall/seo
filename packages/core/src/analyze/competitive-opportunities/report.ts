import { randomUUID } from 'node:crypto'
import type { LinkSummaryProvider } from '../../providers/link-contracts.js'
import type {
  CompetitiveOpportunitiesInput,
  CompetitiveOpportunitiesReport,
} from '../competitive-opportunity-contract.js'
import type { domainRatingReport } from '../domain-rating.js'
import {
  type KeywordResearchReport,
  keywordResearchReport,
} from '../keyword-research.js'
import type { serpResultsReport } from '../serp-results.js'
import {
  aggregateCompetitiveDomains,
  buildCompetitiveOpportunities,
  competitiveDataStatus,
} from './analysis.js'
import {
  acquireCompetitiveDomainRatings,
  acquireCompetitiveLinkSummaries,
} from './enrichment.js'
import {
  COMPETITIVE_OPPORTUNITY_LIMITS,
  validateCompetitiveOpportunitiesInput,
} from './input.js'
import {
  acquireCompetitiveSerps,
  selectCompetitiveCandidates,
} from './research.js'

const MAX_REVIEW_REASONS_PER_OPPORTUNITY = 5
const MAX_SYNTHESIS_DETAIL_ROWS =
  COMPETITIVE_OPPORTUNITY_LIMITS.keywords +
  COMPETITIVE_OPPORTUNITY_LIMITS.competitors +
  COMPETITIVE_OPPORTUNITY_LIMITS.keywords +
  COMPETITIVE_OPPORTUNITY_LIMITS.keywords *
    COMPETITIVE_OPPORTUNITY_LIMITS.competitors +
  COMPETITIVE_OPPORTUNITY_LIMITS.keywords * MAX_REVIEW_REASONS_PER_OPPORTUNITY +
  COMPETITIVE_OPPORTUNITY_LIMITS.findings

export type CompetitiveOpportunitiesDependencies = {
  keywordResearchReport?: typeof keywordResearchReport
  serpResultsReport?: typeof serpResultsReport
  domainRatingReport?: typeof domainRatingReport
  linkSummaryProvider?: LinkSummaryProvider
  now?: () => Date
  id?: () => string
}

function countLowerDomainRatings(
  opportunities: CompetitiveOpportunitiesReport['opportunities'],
): number {
  return opportunities.filter((opportunity) =>
    opportunity.competitors.some(
      (competitor) => competitor.domainRatingComparedWithTarget === 'lower',
    ),
  ).length
}

function countFewerReferringDomains(
  opportunities: CompetitiveOpportunitiesReport['opportunities'],
): number {
  return opportunities.filter((opportunity) =>
    opportunity.competitors.some(
      (competitor) => competitor.referringDomainsComparedWithTarget === 'lower',
    ),
  ).length
}

export async function competitiveOpportunitiesReport(
  input: CompetitiveOpportunitiesInput,
  dependencies: CompetitiveOpportunitiesDependencies = {},
): Promise<CompetitiveOpportunitiesReport> {
  const options = validateCompetitiveOpportunitiesInput(input)
  const reportRunId = (dependencies.id ?? randomUUID)()
  const research: KeywordResearchReport = await (
    dependencies.keywordResearchReport ?? keywordResearchReport
  )({
    seeds: options.seeds,
    sources: options.discoverySources,
    market: {
      countryCode: options.market.countryCode,
      languageCode: options.market.languageCode,
      searchEngine: options.market.searchEngine,
    },
    limit: options.discoveryLimit,
    provider: options.keywordProvider,
    projectId: options.projectId,
    context: {
      reportId: 'competitive-opportunities',
      reportRunId,
    },
    refresh: options.refresh,
  })
  const candidates = selectCompetitiveCandidates({
    report: research,
    seeds: options.seeds,
    limit: options.keywordLimit,
  })
  const serps = await acquireCompetitiveSerps({
    options,
    candidates,
    reportRunId,
    report: dependencies.serpResultsReport,
  })
  const aggregated = aggregateCompetitiveDomains({
    observations: serps,
    target: options.target,
    limit: options.competitorLimit,
  })
  const domains = [
    options.target,
    ...aggregated.competitors.map((competitor) => competitor.domain),
  ]
  const domainRatings = await acquireCompetitiveDomainRatings({
    options,
    domains,
    reportRunId,
    report: dependencies.domainRatingReport,
  })
  const linkSummaries = await acquireCompetitiveLinkSummaries({
    options,
    domains,
    reportRunId,
    provider: dependencies.linkSummaryProvider,
  })
  const analysis = buildCompetitiveOpportunities({
    candidates,
    serps,
    competitors: aggregated.competitors,
    target: options.target,
    domainRatings,
    linkSummaries,
  })
  const completedSerps = serps.filter(
    (observation) => observation.report,
  ).length
  const failedSerps = serps.length - completedSerps
  const lowerDomainRatings = countLowerDomainRatings(analysis.opportunities)
  const fewerReferringDomains = countFewerReferringDomains(
    analysis.opportunities,
  )
  const targetObservedKeywords = analysis.opportunities.filter(
    (opportunity) => opportunity.targetRanks.length,
  ).length
  const sections = {
    candidates: candidates.length,
    competitors: aggregated.competitors.length,
    opportunities: analysis.opportunities.length,
    competitorComparisons: analysis.candidateDomainComparisons,
    reviewReasons: analysis.opportunities.reduce(
      (total, opportunity) => total + opportunity.reviewReasons.length,
      0,
    ),
    findings: analysis.findings.length,
  }
  const dataStatus = competitiveDataStatus({
    keywordResearchStatus: research.dataStatus,
    serps,
    domainRatings,
    linkSummaries,
    candidates,
  })

  return {
    schemaVersion: 1,
    methodology: 'competitive_opportunities_v1',
    generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    dataStatus,
    target: options.target,
    market: options.market,
    summary: {
      requestedSeeds: options.seeds.length,
      discoveredKeywords: research.summary.discoveredKeywords,
      researchedKeywords: candidates.length,
      completedSerps,
      failedSerps,
      recurringCompetitors: aggregated.recurringCompetitors,
      targetObservedKeywords,
      keywordsWithLowerDomainRatingResult: lowerDomainRatings,
      keywordsWithFewerReferringDomainsResult: fewerReferringDomains,
      verdict:
        completedSerps === 0
          ? 'No current result snapshot completed, so the report cannot compare ranking domains.'
          : `${completedSerps} current result snapshot${completedSerps === 1 ? '' : 's'} completed for ${candidates.length} retained keyword${candidates.length === 1 ? '' : 's'}. ${targetObservedKeywords} include the target, ${lowerDomainRatings} include a retained result with lower observed Domain Rating, and ${fewerReferringDomains} include one with fewer provider-observed referring domains.`,
    },
    selection: {
      discoveryLimit: options.discoveryLimit,
      keywordLimit: options.keywordLimit,
      serpDepth: options.serpDepth,
      competitorLimit: options.competitorLimit,
      competitionEvidence: options.competitionEvidence,
      candidateOrder:
        'normalized-seeds-then-discovery-source-count-volume-keyword-v1',
      competitorOrder: 'keyword-round-robin-absolute-rank-domain-v1',
      reviewOrder:
        'target-observed-lower-domain-rating-fewer-referring-domains-discovery-volume-keyword-v1',
    },
    source: {
      keywordResearch: research,
      serps: {
        requested: serps.length,
        completed: completedSerps,
        failed: failedSerps,
        observations: serps,
      },
      domainRatings: {
        requested: options.competitionEvidence !== 'serp',
        provider: 'ahrefs',
        observations: domainRatings,
      },
      linkSummaries: {
        requested: options.competitionEvidence === 'link-summary',
        provider: options.linkProvider,
        observations: linkSummaries,
      },
    },
    processing: {
      discoveryRowsRead: research.evidence.data.length,
      organicRowsRead: aggregated.organicRowsRead,
      candidateDomainComparisons: analysis.candidateDomainComparisons,
    },
    detailBudget: {
      unit: 'competitive-synthesis-rows',
      limit: MAX_SYNTHESIS_DETAIL_ROWS,
      returned: Object.values(sections).reduce(
        (total, value) => total + value,
        0,
      ),
      sections,
    },
    candidates,
    competitors: aggregated.competitors,
    opportunities: analysis.opportunities,
    findings: analysis.findings,
    caveats: [
      'The report orders a bounded investigation queue. It does not calculate a ranking-feasibility, authority, or keyword-difficulty score.',
      'Keyword volume, difficulty, intent, Domain Rating, backlink counts, and referring-domain counts are provider estimates. They remain separate from current result observations and first-party performance.',
      'A lower Domain Rating or referring-domain count does not make a result easy to outrank. Page relevance, intent, result type, URL-level links, content, brand demand, and other unobserved signals can change the decision.',
      'The current result snapshots describe the selected country, language, device, depth, and observation time. Missing domains outside that depth are not zero rankings.',
      'Recurring result domains are search competitors for this retained keyword set. Their business type and relevance remain unclassified until reviewed.',
      'Provider rows, failed requests, caps, cache state, costs, warnings, and observation dates remain visible inside each source report or evidence envelope.',
    ],
    nextSteps: [
      'Open the current ranking pages for the first one or two retained keywords and check whether they answer the same intent and page type.',
      options.competitionEvidence === 'serp'
        ? 'Rerun with competitionEvidence set to domain-rating when free attributed backlink-profile context would change the shortlist.'
        : options.competitionEvidence === 'domain-rating'
          ? 'Rerun with competitionEvidence set to link-summary only when paid domain-level link counts would change the shortlist.'
          : 'Inspect URL-level link evidence only for the ranking pages that remain decision-critical after the domain-level comparison.',
      'Check Search Console and the existing site before proposing a new page. A missing retained query row is not proof that the site has no impressions or coverage.',
      'Audit the target or proposed page after choosing one keyword. Verify the decision against the live page and a fresh current result snapshot.',
    ],
  }
}
