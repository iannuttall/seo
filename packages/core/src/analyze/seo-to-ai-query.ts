import { aiPromptsForQuery } from './ai-monitoring-prompts.js'
import type {
  QueryOpportunityDependencies,
  QueryOpportunityInput,
  QueryOpportunitySelection,
} from './query-opportunity-source.js'
import {
  defaultQueryOpportunityDependencies,
  queryOpportunityEvidence,
} from './query-opportunity-source.js'

export * from './ai-monitoring-prompts.js'

export type SeoToAiQueryReport = {
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
    id: 'gsc_query_to_ai_monitoring_prompt'
    version: 2
    sourceUnit: 'retained-query-row'
    promptType: 'deterministic-template-heuristic'
    observedAiPromptData: false
    estimatedTrafficLift: false
  }
  selection: QueryOpportunitySelection & {
    returnedRows: number
    limitedRows: number
  }
  summary: {
    eligibleQueries: number
    returnedQueries: number
    prompts: number
    verdict: string
  }
  items: Array<{
    query: string
    clicks: number
    impressions: number
    ctr: number
    position: number
    evidenceScope: 'retained-gsc-query'
    prompts: string[]
  }>
  warnings: string[]
  caveats: string[]
}

function reportStatus(input: {
  sourceRows: number
  eligibleRows: number
  partial: boolean
}): SeoToAiQueryReport['dataStatus'] {
  if (input.sourceRows === 0) return 'empty'
  if (input.partial) return 'partial'
  return input.eligibleRows === 0 ? 'filtered' : 'available'
}

export async function seoToAiQueryReport(
  input: QueryOpportunityInput,
  dependencies: QueryOpportunityDependencies = defaultQueryOpportunityDependencies,
): Promise<SeoToAiQueryReport> {
  const evidence = await queryOpportunityEvidence(input, dependencies)
  const rows = evidence.rows.slice(0, evidence.filters.limit)
  const items = rows.map((row) => ({
    ...row,
    evidenceScope: 'retained-gsc-query' as const,
    prompts: aiPromptsForQuery(row.query),
  }))
  const partial =
    evidence.source.possiblyTruncated ||
    evidence.selection.invalidRows > 0 ||
    evidence.selection.conflictingRows > 0
  const dataStatus = reportStatus({
    sourceRows: evidence.selection.sourceRows,
    eligibleRows: evidence.selection.eligibleRows,
    partial,
  })
  const verdict =
    dataStatus === 'empty'
      ? 'GSC returned no retained query rows for this range.'
      : dataStatus === 'partial' && items.length === 0
        ? 'No prompt candidates survived the retained rows and filters, but incomplete source evidence makes that negative inconclusive.'
        : dataStatus === 'partial'
          ? `Partial evidence: ${items.length} retained GSC queries were converted into prompt suggestions, but incomplete source rows may omit other queries.`
          : dataStatus === 'filtered'
            ? `No retained ${input.includeBrand ? '' : 'non-brand '}queries met the minimum-impression threshold.`
            : `${items.length} retained GSC queries were converted into deterministic monitoring-prompt suggestions; these are not observed AI prompts.`

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
      id: 'gsc_query_to_ai_monitoring_prompt',
      version: 2,
      sourceUnit: 'retained-query-row',
      promptType: 'deterministic-template-heuristic',
      observedAiPromptData: false,
      estimatedTrafficLift: false,
    },
    selection: {
      ...evidence.selection,
      returnedRows: items.length,
      limitedRows: evidence.selection.eligibleRows - items.length,
    },
    summary: {
      eligibleQueries: evidence.selection.eligibleRows,
      returnedQueries: items.length,
      prompts: items.reduce((sum, item) => sum + item.prompts.length, 0),
      verdict,
    },
    items,
    warnings: evidence.warnings,
    caveats: [
      ...evidence.caveats,
      'Generated prompts are deterministic monitoring suggestions derived from GSC query wording, not evidence of demand in any AI product.',
    ],
  }
}
