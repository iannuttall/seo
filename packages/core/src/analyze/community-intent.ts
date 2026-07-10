import {
  type CommunityIntent,
  classifyCommunityIntent,
} from './community-intent-classifier.js'
import type {
  QueryOpportunityDependencies,
  QueryOpportunityInput,
  QueryOpportunitySelection,
} from './query-opportunity-source.js'
import {
  defaultQueryOpportunityDependencies,
  queryOpportunityEvidence,
} from './query-opportunity-source.js'

export * from './community-intent-classifier.js'

export type CommunityIntentReport = {
  schemaVersion: 2
  site: string
  generatedAt: string
  rangeDays: number
  dateRange: { startDate: string; endDate: string }
  dataStatus: 'empty' | 'filtered' | 'partial' | 'available'
  source: Awaited<ReturnType<typeof queryOpportunityEvidence>>['source']
  filters: Awaited<ReturnType<typeof queryOpportunityEvidence>>['filters'] & {
    brandFiltering: 'included' | 'excluded'
  }
  methodology: {
    id: 'gsc_community_intent_query_heuristic'
    version: 2
    classificationUnit: 'retained-query-row'
    classificationType: 'language-heuristic'
    classificationLanguage: 'english-patterns'
    pageContentVerified: false
    estimatedTrafficLift: false
  }
  selection: QueryOpportunitySelection & {
    unclassifiedRows: number
    classifiedRows: number
    returnedRows: number
    limitedRows: number
  }
  summary: {
    classifiedQueries: number
    returnedQueries: number
    returnedImpressions: number
    returnedClicks: number
    verdict: string
  }
  items: Array<{
    query: string
    intent: CommunityIntent
    signals: CommunityIntent[]
    matchedTerms: string[]
    confidence: 'low'
    evidenceScope: 'retained-gsc-query-language'
    clicks: number
    impressions: number
    ctr: number
    position: number
    action: string
  }>
  warnings: string[]
  caveats: string[]
}

function reportStatus(input: {
  sourceRows: number
  classifiedRows: number
  partial: boolean
}): CommunityIntentReport['dataStatus'] {
  if (input.sourceRows === 0) return 'empty'
  if (input.partial) return 'partial'
  return input.classifiedRows === 0 ? 'filtered' : 'available'
}

export async function communityIntentReport(
  input: QueryOpportunityInput,
  dependencies: QueryOpportunityDependencies = defaultQueryOpportunityDependencies,
): Promise<CommunityIntentReport> {
  const evidence = await queryOpportunityEvidence(input, dependencies)
  const classified = evidence.rows.flatMap((row) => {
    const classification = classifyCommunityIntent(row.query)
    return classification ? [{ row, classification }] : []
  })
  const items = classified
    .slice(0, evidence.filters.limit)
    .map(({ row, classification }) => ({
      ...row,
      intent: classification.intent,
      signals: classification.signals,
      matchedTerms: classification.matchedTerms,
      confidence: classification.confidence,
      evidenceScope: 'retained-gsc-query-language' as const,
      action: classification.action,
    }))
  const partial =
    evidence.source.possiblyTruncated ||
    evidence.selection.invalidRows > 0 ||
    evidence.selection.conflictingRows > 0
  const dataStatus = reportStatus({
    sourceRows: evidence.selection.sourceRows,
    classifiedRows: classified.length,
    partial,
  })
  const verdict =
    dataStatus === 'empty'
      ? 'GSC returned no retained query rows for this range.'
      : dataStatus === 'partial' && classified.length === 0
        ? 'No matching intent language appeared in the retained rows, but incomplete source evidence makes that negative inconclusive.'
        : dataStatus === 'partial'
          ? `Partial evidence: ${classified.length} retained queries matched explicit intent language, but incomplete source rows may omit other queries.`
          : dataStatus === 'filtered'
            ? `No retained ${input.includeBrand ? '' : 'non-brand '}queries met both the thresholds and the explicit intent-language rules.`
            : `${classified.length} retained queries matched explicit community, comparison, review, experience, or recommendation language; treat each as a review hypothesis.`

  return {
    schemaVersion: 2,
    site: evidence.site,
    generatedAt: evidence.generatedAt,
    rangeDays: evidence.rangeDays,
    dateRange: evidence.dateRange,
    dataStatus,
    source: evidence.source,
    filters: {
      ...evidence.filters,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
    },
    methodology: {
      id: 'gsc_community_intent_query_heuristic',
      version: 2,
      classificationUnit: 'retained-query-row',
      classificationType: 'language-heuristic',
      classificationLanguage: 'english-patterns',
      pageContentVerified: false,
      estimatedTrafficLift: false,
    },
    selection: {
      ...evidence.selection,
      unclassifiedRows: evidence.rows.length - classified.length,
      classifiedRows: classified.length,
      returnedRows: items.length,
      limitedRows: classified.length - items.length,
    },
    summary: {
      classifiedQueries: classified.length,
      returnedQueries: items.length,
      returnedImpressions: items.reduce(
        (sum, item) => sum + item.impressions,
        0,
      ),
      returnedClicks: items.reduce((sum, item) => sum + item.clicks, 0),
      verdict,
    },
    items,
    warnings: evidence.warnings,
    caveats: [
      ...evidence.caveats,
      'Intent labels come from explicit query-language patterns, not SERP, page-content, or audience research.',
      'Classification patterns are English-only; non-English queries remain in source counts but may not be classified.',
      'Review the ranking page and live search results before changing content.',
    ],
  }
}
