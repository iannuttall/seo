import type {
  CompetitorKeywordGapCandidate,
  CompetitorKeywordGapReport,
  CompetitorKeywordGapReportInput,
  DomainResearchDataStatus,
} from '../domain-research-contract.js'
import { acquireCompetitorGap, MAX_GAP_COMPETITORS } from './gap-acquisition.js'
import {
  analyzeCompetitorGap,
  MAX_TOKEN_ROWS_PER_TERM,
} from './gap-analysis.js'
import {
  type DomainResearchDependencies,
  MAX_GSC_DOMAIN_ROWS,
} from './shared.js'

const MAX_FINDINGS = 10
const MAX_SOURCE_BRIEFS = 5

function count(
  candidates: CompetitorKeywordGapCandidate[],
  classification: CompetitorKeywordGapCandidate['classification'],
): number {
  return candidates.filter((item) => item.classification === classification)
    .length
}

function dataStatus(input: {
  sourceTruncated: boolean
  candidateCount: number
  ownStatus: CompetitorKeywordGapReport['source']['ownDomain']['status']
  competitors: CompetitorKeywordGapReport['source']['competitors']
}): DomainResearchDataStatus {
  if (input.competitors.every((item) => item.status === 'unavailable')) {
    return 'unavailable'
  }
  if (
    input.sourceTruncated ||
    ['partial', 'unavailable'].includes(input.ownStatus) ||
    input.competitors.some((item) =>
      ['partial', 'unavailable'].includes(item.status),
    )
  ) {
    return 'partial'
  }
  if (
    input.ownStatus === 'filtered' ||
    input.competitors.some((item) => item.status === 'filtered')
  ) {
    return 'filtered'
  }
  if (input.candidateCount === 0) return 'empty'
  return 'complete'
}

function findings(input: {
  candidates: CompetitorKeywordGapCandidate[]
  patterns: CompetitorKeywordGapReport['repeatedCompetitorPatterns']
}): CompetitorKeywordGapReport['findings'] {
  const result: CompetitorKeywordGapReport['findings'] = []
  for (const [index, candidate] of input.candidates.entries()) {
    if (result.length >= MAX_FINDINGS) break
    if (candidate.classification === 'relevant-gap-candidate') {
      result.push({
        code: 'relevant-competitor-gap',
        evidenceRefs: [`candidates[${index}]`, ...candidate.evidenceRefs],
        detail: `${candidate.keyword} appears for ${candidate.competitorCount} compared domain${candidate.competitorCount === 1 ? '' : 's'} and overlaps with retained first-party query themes.`,
        action:
          candidate.pseo.proposal === 'existing-template-review'
            ? 'Review the matching first-party template and its coverage before proposing a new page or variant.'
            : candidate.pseo.proposal === 'new-template-research'
              ? 'Validate current results, intent, source fields, page uniqueness, and maintenance cost before proposing a new template family.'
              : 'Validate current results, intent, and first-party relevance before treating this as a content opportunity.',
      })
    } else if (candidate.classification === 'already-observed-first-party') {
      result.push({
        code: 'first-party-query-already-covered',
        evidenceRefs: [`candidates[${index}]`, ...candidate.evidenceRefs],
        detail: `${candidate.keyword} already has retained Search Console evidence for the selected site and date range.`,
        action:
          'Inspect the existing page, query trend, and current result before calling it a content gap.',
      })
    }
  }
  for (const [index, pattern] of input.patterns.entries()) {
    if (result.length >= MAX_FINDINGS) break
    result.push({
      code: 'competitor-template-pattern',
      evidenceRefs: [
        `repeatedCompetitorPatterns[${index}]`,
        ...pattern.evidenceRefs,
      ],
      detail: `${pattern.urlCount} retained pages from ${pattern.domain} match ${pattern.signature}.`,
      action:
        'Inspect representative pages for shared intent, useful data fields, unique page value, internal links, and crawl behavior. The path pattern alone is not a recommendation to copy or scale it.',
    })
  }
  return result
}

function sourceBriefs(
  candidates: CompetitorKeywordGapCandidate[],
): CompetitorKeywordGapReport['dataSourceBriefs'] {
  return candidates
    .flatMap((candidate, index) =>
      candidate.classification === 'relevant-gap-candidate' &&
      candidate.pseo.proposal !== 'none'
        ? [{ candidate, index }]
        : [],
    )
    .slice(0, MAX_SOURCE_BRIEFS)
    .map(({ candidate, index }) => ({
      candidateRef: `candidates[${index}]`,
      instruction: `Research authoritative, legally usable data sources for ${candidate.keyword} before designing or expanding a programmatic template. Prefer official APIs, primary datasets, and stable local imports.`,
      requiredChecks: [
        'Record stable identifiers, fields, units, geographic coverage, update frequency, and missing-value behavior.',
        'Confirm access rights, attribution, rate limits, acquisition bounds, cache retention, and expected local storage growth.',
        'Define what makes each generated page useful and distinct beyond changing a keyword or place name.',
        'Test representative, sparse, duplicate, stale, and malformed records before scaling page count.',
      ],
      evidenceBoundary:
        'This brief comes from lexical overlap and repeated ranking-page patterns. It does not verify demand, intent, data availability, page quality, or that a new template should be built.',
    }))
}

export async function competitorKeywordGapReport(
  input: CompetitorKeywordGapReportInput,
  dependencies: DomainResearchDependencies = {},
): Promise<CompetitorKeywordGapReport> {
  const acquisition = await acquireCompetitorGap(input, dependencies)
  const analysis = analyzeCompetitorGap(acquisition)
  const relevant = count(analysis.candidates, 'relevant-gap-candidate')
  const alreadyObserved = count(
    analysis.candidates,
    'already-observed-first-party',
  )
  const alreadyRanked = count(analysis.candidates, 'already-ranked-provider')
  const unverified = count(analysis.candidates, 'unverified-competitor-term')
  const completed = acquisition.competitors.filter(
    (item) => item.status !== 'unavailable',
  ).length
  const candidates = analysis.returnedCandidates
  const reportStatus = dataStatus({
    sourceTruncated: acquisition.sourceRows.possiblyTruncated,
    candidateCount: analysis.candidates.length,
    ownStatus: acquisition.ownSource.status,
    competitors: acquisition.competitors,
  })

  return {
    schemaVersion: 1,
    methodology: 'competitor_keyword_gap_v1',
    generatedAt: acquisition.now.toISOString(),
    dataStatus: reportStatus,
    market: acquisition.market,
    summary: {
      competitorsRequested: acquisition.competitors.length,
      competitorsCompleted: completed,
      sourceRows: acquisition.sourceRows.rows.length,
      uniqueCompetitorKeywords: analysis.candidates.length,
      alreadyObservedFirstParty: alreadyObserved,
      alreadyRankedProvider: alreadyRanked,
      relevantGapCandidates: relevant,
      unverifiedCompetitorTerms: unverified,
      returnedCandidates: candidates.length,
      verdict:
        reportStatus === 'unavailable'
          ? 'No competitor keyword source completed, so the report cannot identify gaps.'
          : `${relevant} relevant candidate${relevant === 1 ? '' : 's'} remained after checking retained Search Console themes and the provider footprint for the site.`,
    },
    source: {
      firstParty: {
        provider: 'google-search-console',
        site: input.site,
        range: acquisition.sourceRows.range,
        rowsFetched: acquisition.sourceRows.rowsFetched,
        calls: acquisition.sourceRows.calls,
        maxRows: acquisition.sourceRows.maxRows,
        possiblyTruncated: acquisition.sourceRows.possiblyTruncated,
      },
      ownDomain: acquisition.ownSource,
      competitors: acquisition.competitors,
    },
    selection: {
      limitPerDomain: acquisition.limitPerDomain,
      candidateLimit: acquisition.candidateLimit,
      minSearchVolume: acquisition.minSearchVolume,
      maxRank: acquisition.maxRank,
      sourceRowLimit: MAX_GSC_DOMAIN_ROWS,
      competitorLimit: MAX_GAP_COMPETITORS,
      tokenRowsPerTermLimit: MAX_TOKEN_ROWS_PER_TERM,
      firstPartyPatternUrlLimit: analysis.firstPartyPatternUrlLimit,
      candidateOrder: 'classification-competitor-count-volume-rank-keyword-v1',
    },
    processing: analysis.processing,
    candidates,
    repeatedCompetitorPatterns: analysis.competitorPatterns,
    dataSourceBriefs: sourceBriefs(candidates),
    findings: findings({
      candidates,
      patterns: analysis.competitorPatterns,
    }),
    caveats: [
      'A relevant gap candidate is a heuristic. It requires retained first-party theme overlap plus either multiple compared domains or a top-10 competitor rank. It does not prove intent, demand, traffic, or that a page should be created.',
      'Search Console absences mean only that a query was not found in the bounded retained rows. Anonymized queries, filters, the selected date range, and row caps can hide evidence.',
      'Provider ranks, volume, difficulty, intent, and traffic are estimates from a country-level database. Verify shortlisted terms with current result evidence before acting.',
      'Programmatic page patterns come from URL structure. Inspect representative pages and data sources before deciding whether a scalable template is useful or safe.',
    ],
    nextSteps: [
      'Review relevant-gap-candidate rows first, then exclude terms that do not fit the site purpose or current result intent.',
      'Run a current result report for shortlisted terms before drafting content, changing a template, or creating a new template family.',
      'For existing-template-review rows, compare the current first-party template coverage before adding variants. For new-template-research rows, complete the bounded data-source brief first.',
    ],
  }
}
