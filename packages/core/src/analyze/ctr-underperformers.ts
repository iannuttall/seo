import { querySearchAnalytics } from '../gsc/client.js'
import {
  analyzeCtrUnderperformersFromRows,
  CTR_DEFAULT_LIMIT,
  CTR_DEFAULT_MIN_IMPRESSIONS,
  CTR_MAX_LIMIT,
  CTR_MAX_MIN_IMPRESSIONS,
} from './ctr-underperformers-analysis.js'
import { defaultDateRange } from './shared.js'
import { integerOption } from './site-diagnostics/quick-wins-report-input.js'

export * from './ctr-underperformers-analysis.js'
export type * from './ctr-underperformers-types.js'

const MAX_GSC_ROWS = 100_000

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

type SearchAnalytics = typeof querySearchAnalytics

export interface CtrUnderperformerDependencies {
  searchAnalytics: SearchAnalytics
  now: () => Date
}

const defaultDependencies: CtrUnderperformerDependencies = {
  searchAnalytics: querySearchAnalytics,
  now: () => new Date(),
}

export async function ctrUnderperformersReport(
  input: {
    site: string
    minImpressions?: number
    limit?: number
    brandTerms?: string[]
    includeBrand?: boolean
    refresh?: boolean
  },
  dependencies: CtrUnderperformerDependencies = defaultDependencies,
) {
  const minImpressions = integerOption({
    value: input.minImpressions,
    fallback: CTR_DEFAULT_MIN_IMPRESSIONS,
    minimum: 1,
    maximum: CTR_MAX_MIN_IMPRESSIONS,
    label: 'minImpressions',
  })
  const limit = integerOption({
    value: input.limit,
    fallback: CTR_DEFAULT_LIMIT,
    minimum: 1,
    maximum: CTR_MAX_LIMIT,
    label: 'limit',
  })
  const now = dependencies.now()
  const range = defaultDateRange(28, now)
  const source = await dependencies.searchAnalytics(
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
  const { items, totalClickShortfall, returnedClickShortfall, selection } =
    analyzeCtrUnderperformersFromRows({
      rows: source.rows,
      site: input.site,
      minImpressions,
      limit,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
    })
  const top = items[0]
  const possiblyTruncated = source.rowsFetched >= MAX_GSC_ROWS
  const partialValidation = selection.invalidRows > 0
  const dataStatus =
    selection.sourceRows === 0
      ? ('empty' as const)
      : possiblyTruncated || partialValidation
        ? ('partial' as const)
        : selection.eligibleUnderperformers === 0
          ? ('filtered' as const)
          : ('complete' as const)
  const completeness =
    possiblyTruncated && partialValidation
      ? ('partial-and-possibly-truncated' as const)
      : possiblyTruncated
        ? ('possibly-truncated' as const)
        : partialValidation
          ? ('partial' as const)
          : ('complete' as const)

  return {
    schemaVersion: 1 as const,
    site: input.site,
    range,
    generatedAt: now.toISOString(),
    dataStatus,
    source: {
      provider: 'google-search-console' as const,
      dimensions: ['query', 'page'] as const,
      searchType: 'web' as const,
      dataState: 'final' as const,
      rowsFetched: source.rowsFetched,
      calls: source.calls,
      maxRows: MAX_GSC_ROWS,
      possiblyTruncated,
      completeness,
      validation: {
        retainedRows: selection.validRows,
        invalidRows: selection.invalidRows,
        aggregatedRows: selection.aggregatedRows,
        duplicateRows: selection.duplicateRows,
      },
    },
    selection,
    summary: {
      underperformers: selection.eligibleUnderperformers,
      returnedUnderperformers: selection.returnedUnderperformers,
      estimatedClickShortfall: totalClickShortfall,
      returnedClickShortfall,
      minImpressions,
      limit,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: top
        ? `${selection.eligibleUnderperformers} CTR ${plural(selection.eligibleUnderperformers, 'underperformer')} found in retained rows, with a calculated heuristic shortfall of ${totalClickShortfall.toFixed(0)} clicks for this window. Start review with "${top.query}" because it has the largest gap.`
        : dataStatus === 'partial'
          ? 'No material CTR underperformers remained in the validated retained rows, but partial evidence prevents an all-clear.'
          : 'No high-impression page-one queries in the retained rows are materially below the heuristic CTR benchmark.',
    },
    items,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate} (28 days), using final GSC data where available.`,
      `Brand queries: ${input.includeBrand ? 'included' : 'excluded'}.`,
      `Only queries ranking position 1-10 with at least ${minImpressions} impressions were checked.`,
      'Expected CTR uses a robust site-aware position benchmark when enough peer data exists, otherwise the fallback position curve.',
      'CTR benchmarks and calculated click shortfalls are directional heuristics, not forecasts or proof that clicks are available. Validate the search intent and live SERP before editing.',
      ...(selection.invalidRows
        ? [
            `${selection.invalidRows} invalid provider ${plural(selection.invalidRows, 'row')} ${selection.invalidRows === 1 ? 'was' : 'were'} excluded, so this report is partial.`,
          ]
        : []),
      ...(selection.duplicateRows
        ? [
            `${selection.duplicateRows} repeated query/page ${plural(selection.duplicateRows, 'row')} ${selection.duplicateRows === 1 ? 'was' : 'were'} aggregated before CTR and average position were calculated.`,
          ]
        : []),
      ...(possiblyTruncated
        ? [
            `The retained-row limit of ${MAX_GSC_ROWS} was reached, so lower-ranked source rows may be absent.`,
          ]
        : []),
      ...(selection.limitedUnderperformers
        ? [
            `${selection.limitedUnderperformers} eligible ${plural(selection.limitedUnderperformers, 'underperformer')} ${selection.limitedUnderperformers === 1 ? 'was' : 'were'} omitted by the output limit.`,
          ]
        : []),
    ],
    recommendations: top
      ? [
          `Review the live SERP and displayed snippet for "${top.query}" first. Test the title or meta description only if the observed framing does not match the query intent.`,
          'Prioritise rows with high impressions and clear intent, but treat the benchmark gap as a hypothesis rather than a diagnosed copy defect.',
          'After changing SERP copy, annotate the change and compare the next full 28-day period before making more edits.',
        ]
      : dataStatus === 'partial'
        ? [
            'No CTR-only action is recommended from the validated retained rows. Refresh or inspect the provider evidence before treating this as an all-clear.',
          ]
        : [
            'No CTR-only action is recommended from this report. Use striking-distance or page-opportunities if you want more growth ideas.',
          ],
  }
}
