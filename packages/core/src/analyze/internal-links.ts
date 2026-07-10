import { extractPage } from '../extract/page-extractor.js'
import { type FetchRateControls, fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { assertUrlMatchesGscProperty } from '../gsc/property-url.js'
import { SessionLedger } from '../storage/ledger.js'
import {
  analyzeInternalLinksFromRows,
  INTERNAL_LINK_LEXICAL_TARGET_LIMIT,
  INTERNAL_LINK_MATCH_EVIDENCE_LIMIT,
} from './internal-links-analysis.js'
import {
  completeInternalLinksSelection,
  internalLinksIntegerOption,
  internalLinksNumberOption,
  internalLinksReportRange,
  internalLinksVerdict,
  uniqueInternalLinksWarnings,
} from './internal-links-report.js'
import type { InternalLinksReport } from './internal-links-types.js'
import {
  INTERNAL_LINK_OBSERVED_EVIDENCE_LIMIT,
  verifyInternalLinkCandidate,
  verifyInternalLinkTarget,
} from './internal-links-verification.js'

export * from './internal-links-analysis.js'
export type * from './internal-links-types.js'

const MAX_GSC_ROWS = 100_000

type SearchAnalytics = typeof querySearchAnalytics
type FetchPage = typeof fetchPage
type ExtractPage = typeof extractPage

export interface InternalLinksInput {
  site: string
  targetUrl: string
  days?: number
  limit?: number
  checkLimit?: number
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  js?: boolean | 'auto'
  rate?: FetchRateControls
  refresh?: boolean
}

export interface InternalLinksDependencies {
  searchAnalytics: SearchAnalytics
  fetch: FetchPage
  extract: ExtractPage
  now: () => Date
}

const defaultDependencies: InternalLinksDependencies = {
  searchAnalytics: querySearchAnalytics,
  fetch: fetchPage,
  extract: extractPage,
  now: () => new Date(),
}

export async function internalLinksReport(
  input: InternalLinksInput,
  dependencies: InternalLinksDependencies = defaultDependencies,
): Promise<InternalLinksReport> {
  const targetPage = new URL(
    assertUrlMatchesGscProperty(input.site, input.targetUrl),
  )
  targetPage.hash = ''
  const targetUrl = targetPage.toString()
  const days = internalLinksIntegerOption({
    value: input.days,
    fallback: 28,
    minimum: 1,
    maximum: 548,
    label: 'days',
  })
  const limit = internalLinksIntegerOption({
    value: input.limit,
    fallback: 20,
    minimum: 1,
    maximum: 100,
    label: 'limit',
  })
  const checkLimit = internalLinksIntegerOption({
    value: input.checkLimit,
    fallback: Math.max(limit, 40),
    minimum: 1,
    maximum: 200,
    label: 'checkLimit',
  })
  const minImpressions = internalLinksNumberOption({
    value: input.minImpressions,
    fallback: 1,
    minimum: 0,
    maximum: 1_000_000_000,
    label: 'minImpressions',
  })
  const now = dependencies.now()
  const range = internalLinksReportRange(days, now)
  const ledger = new SessionLedger()
  const target = await verifyInternalLinkTarget({
    site: input.site,
    targetUrl,
    js: input.js,
    refresh: input.refresh,
    rate: input.rate,
    dependencies,
  })

  const targetRequests = await Promise.all(
    target.aliases.map(async (alias) => {
      const result = await dependencies.searchAnalytics(
        input.site,
        {
          ...range,
          dimensions: ['query', 'page'],
          type: 'web',
          dataState: 'final',
          maxRows: MAX_GSC_ROWS,
          dimensionFilterGroups: [
            {
              groupType: 'and',
              filters: [
                { dimension: 'page', operator: 'equals', expression: alias },
              ],
            },
          ],
        },
        { refresh: input.refresh },
      )
      ledger.addGsc(result.calls, result.rowsFetched)
      return { alias, result }
    }),
  )
  const targetRows = targetRequests.flatMap(({ result }) => result.rows)
  const preliminary = analyzeInternalLinksFromRows({
    targetRows,
    sourceRows: [],
    site: input.site,
    targetAliases: target.aliases,
    minImpressions,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const queryCandidates =
    target.verification === 'verified' &&
    preliminary.selection.targetEligibleQueries > 0
  const sourceResult = queryCandidates
    ? await dependencies.searchAnalytics(
        input.site,
        {
          ...range,
          dimensions: ['query', 'page'],
          type: 'web',
          dataState: 'final',
          maxRows: MAX_GSC_ROWS,
        },
        { refresh: input.refresh },
      )
    : { rows: [], calls: 0, rowsFetched: 0 }
  ledger.addGsc(sourceResult.calls, sourceResult.rowsFetched)
  const analysis = analyzeInternalLinksFromRows({
    targetRows,
    sourceRows: sourceResult.rows,
    site: input.site,
    targetAliases: target.aliases,
    minImpressions,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })

  const items: InternalLinksReport['items'] = []
  const warnings = [...target.warnings]
  let attemptedSources = 0
  let checkedSources = 0
  let existingLinkExclusions = 0
  let technicalExclusions = 0
  let selfAliasExclusions = 0
  let failedChecks = 0
  for (const candidate of analysis.candidates) {
    if (attemptedSources >= checkLimit || items.length >= limit) break
    attemptedSources += 1
    const verified = await verifyInternalLinkCandidate({
      site: input.site,
      candidate,
      target,
      js: input.js,
      refresh: input.refresh,
      rate: input.rate,
      dependencies,
    })
    warnings.push(...verified.warnings)
    if (verified.item) items.push(verified.item)
    if (verified.exclusion === 'existing-link') existingLinkExclusions += 1
    if (verified.exclusion === 'technical') technicalExclusions += 1
    if (verified.exclusion === 'self-alias') selfAliasExclusions += 1
    if (verified.exclusion === 'failed') failedChecks += 1
    else checkedSources += 1
  }
  const uncheckedCandidates = Math.max(
    0,
    analysis.candidates.length - attemptedSources,
  )
  const targetTruncated = targetRequests.some(
    ({ result }) => result.rowsFetched >= MAX_GSC_ROWS,
  )
  const sourceTruncated = sourceResult.rowsFetched >= MAX_GSC_ROWS
  const invalidRows =
    analysis.selection.targetInvalidRows + analysis.selection.sourceInvalidRows
  const structuredWarnings = uniqueInternalLinksWarnings(warnings)
  const dataStatus: InternalLinksReport['dataStatus'] =
    target.verification === 'technical-issue'
      ? 'target-technical-issue'
      : target.verification === 'failed'
        ? 'partial'
        : targetRows.length === 0
          ? 'empty'
          : targetTruncated || sourceTruncated || invalidRows > 0
            ? 'partial'
            : queryCandidates && sourceResult.rows.length === 0
              ? 'source-empty'
              : analysis.selection.targetEligibleQueries === 0 ||
                  analysis.candidates.length === 0
                ? 'filtered'
                : failedChecks > 0 || uncheckedCandidates > 0
                  ? 'partial'
                  : 'complete'
  const selection = completeInternalLinksSelection(analysis, {
    attemptedSources,
    checkedSources,
    returnedSources: items.length,
    existingLinkExclusions,
    technicalExclusions,
    selfAliasExclusions,
    failedChecks,
    uncheckedCandidates,
  })
  const summaryVerdict = internalLinksVerdict({
    dataStatus,
    returned: items.length,
    attempted: attemptedSources,
    checked: checkedSources,
    candidates: analysis.candidates.length,
    failed: failedChecks,
    unchecked: uncheckedCandidates,
  })

  return {
    site: input.site,
    targetUrl,
    generatedAt: now.toISOString(),
    range,
    rangeDays: days,
    dataStatus,
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      searchType: 'web',
      dataState: 'final',
      target: {
        pageFilters: targetRequests.map(({ alias }) => alias),
        requests: targetRequests.map(({ alias, result }) => ({
          pageFilter: alias,
          rowsFetched: result.rowsFetched,
          calls: result.calls,
          possiblyTruncated: result.rowsFetched >= MAX_GSC_ROWS,
        })),
        rowsFetched: targetRequests.reduce(
          (sum, { result }) => sum + result.rowsFetched,
          0,
        ),
        calls: targetRequests.reduce(
          (sum, { result }) => sum + result.calls,
          0,
        ),
        maxRowsPerRequest: MAX_GSC_ROWS,
        possiblyTruncated: targetTruncated,
      },
      candidates: {
        queried: queryCandidates,
        rowsFetched: sourceResult.rowsFetched,
        calls: sourceResult.calls,
        maxRows: MAX_GSC_ROWS,
        possiblyTruncated: sourceTruncated,
      },
      completeness: !queryCandidates
        ? 'not-queried'
        : targetTruncated || sourceTruncated
          ? 'possibly-truncated'
          : 'retained-rows-only',
    },
    methodology: {
      id: 'gsc_internal_link_candidates',
      version: 3,
      lexicalTargetLimit: INTERNAL_LINK_LEXICAL_TARGET_LIMIT,
      matchedQueryEvidenceLimit: INTERNAL_LINK_MATCH_EVIDENCE_LIMIT,
      observedLinkEvidenceLimit: INTERNAL_LINK_OBSERVED_EVIDENCE_LIMIT,
      matching: 'pairwise_exact_then_precision_lexical',
      ranking: 'exact_matches_then_matched_query_impressions_then_relevance',
      contextualPlacementVerified: true,
    },
    filters: {
      minImpressions,
      resultLimit: limit,
      checkLimit,
      maxGscRowsPerRequest: MAX_GSC_ROWS,
    },
    target: {
      requestedUrl: target.requestedUrl,
      preferredUrl: target.preferredUrl,
      finalUrl: target.finalUrl,
      canonical: target.canonical,
      status: target.status,
      aliases: target.aliases,
      verification: target.verification,
      technicalSignals: target.technicalSignals,
      fetchDiagnostics: target.fetchDiagnostics,
      queries: analysis.targetQueries,
    },
    selection,
    summary: {
      targetQueries: analysis.selection.targetEligibleQueries,
      candidateSources: analysis.candidates.length,
      attemptedSources,
      checkedSources,
      returnedSources: items.length,
      existingLinksObserved: existingLinkExclusions,
      technicalExclusions,
      failedChecks,
      uncheckedCandidates,
      matchedQueryImpressions: items.reduce(
        (sum, item) => sum + item.matchedQueryImpressions,
        0,
      ),
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: summaryVerdict,
    },
    items,
    warnings: structuredWarnings,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate} (${days} days), using final GSC data where available.`,
      `Selection: ${analysis.selection.targetEligibleQueries} eligible target queries, ${analysis.selection.candidateUrls} matched source pages, ${attemptedSources} attempted, ${checkedSources} successfully checked, ${items.length} returned.`,
      `Minimum retained query impressions: ${minImpressions}. Brand queries were ${input.includeBrand ? 'included' : 'excluded when detected or configured'}.`,
      'GSC query rows omit anonymized queries and lower-volume rows. A 100,000-row cap is reported separately when reached.',
      'Exact query overlap is medium-confidence affinity evidence; lexical matches are low-confidence review evidence. Neither predicts traffic lift or link equity.',
      'The fetch checks HTML link placement, but it cannot prove editorial relevance. Review intent and reader usefulness before adding a link.',
      uncheckedCandidates
        ? `${uncheckedCandidates} matched source page${uncheckedCandidates === 1 ? ' was' : 's were'} not checked because the output or check limit was reached.`
        : '',
      failedChecks
        ? `${failedChecks} source verification attempt${failedChecks === 1 ? '' : 's'} failed. Failed fetches or extraction attempts are not counted as checked pages and do not support a missing-link conclusion.`
        : '',
    ].filter(Boolean),
    recommendations:
      target.verification !== 'verified'
        ? [
            'Resolve the target fetch, indexability, redirect, or canonical issue before adding internal links.',
          ]
        : items.length
          ? [
              'Review exact-query candidates first, then lexical candidates. Add or update a contextual link only when it helps a reader move between complementary intents.',
            ]
          : [
              'No ready-to-apply link action was confirmed among the checked sources. Review completeness and unchecked counts before treating this as a site-wide absence.',
            ],
    ledgerSummary: ledger.summary(),
  }
}
