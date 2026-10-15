import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import {
  analyzeCtrUnderperformersFromRows,
  CTR_DEFAULT_LIMIT,
  CTR_MAX_LIMIT,
  CTR_MAX_MIN_IMPRESSIONS,
} from './ctr-underperformers-analysis.js'
import { minImpressionsCaveat } from './min-impressions-policy.js'
import { QUERY_FLAG_METHOD } from './query-quality.js'
import { CTR_SPLIT_POSITION, SITE_CTR_CURVE_METHOD } from './site-ctr-curve.js'
import {
  defaultDateRange,
  explicitDateRange,
  integerOption,
} from './site-diagnostics/quick-wins-report-input.js'

export type * from './ctr-underperformers-types.js'

const MAX_GSC_ROWS = 100_000
const DEFAULT_DAYS = 28
const MAX_DAYS = 548

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

export interface CtrUnderperformerDependencies {
  searchAnalytics: SearchAnalyticsQuery
  now: () => Date
}

export type CtrUnderperformersInput = {
  site: string
  /** Window length in days; ignored when startDate and endDate are given. */
  days?: number
  /** Explicit window start (YYYY-MM-DD); pass with endDate. */
  startDate?: string
  /** Explicit window end (YYYY-MM-DD); pass with startDate. */
  endDate?: string
  minImpressions?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}

export type CtrUnderperformersReport = Awaited<
  ReturnType<typeof ctrUnderperformersReportWith>
>

export async function ctrUnderperformersReportWith(
  input: CtrUnderperformersInput,
  dependencies: CtrUnderperformerDependencies,
) {
  // Validate an explicit minimum here; leave it undefined so the analysis
  // scales the default to the site.
  const requestedMinImpressions =
    input.minImpressions === undefined
      ? undefined
      : integerOption({
          value: input.minImpressions,
          fallback: 1,
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
  const explicitRange = explicitDateRange(input, MAX_DAYS)
  const days =
    explicitRange?.days ??
    integerOption({
      value: input.days,
      fallback: DEFAULT_DAYS,
      minimum: 1,
      maximum: MAX_DAYS,
      label: 'Days',
    })
  const now = dependencies.now()
  const range = explicitRange?.range ?? defaultDateRange(days, now)
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
  const {
    items,
    totalClickShortfall,
    returnedClickShortfall,
    selection,
    brand,
    benchmarkByPosition,
    minImpressions,
    minImpressionsPolicy,
  } = analyzeCtrUnderperformersFromRows({
    rows: source.rows,
    site: input.site,
    minImpressions: requestedMinImpressions,
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
    rangeDays: days,
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
    minImpressionsPolicy,
    methodology: {
      id: 'gsc_ctr_underperformers_v2' as const,
      position: {
        metric: 'gsc_average_position' as const,
        minimumInclusive: 1 as const,
        maximumExclusive: CTR_SPLIT_POSITION,
        splitWith: 'quick-wins' as const,
      },
      threshold: {
        rule: 'observed CTR below 0.6 x expected CTR' as const,
        heuristic: true as const,
      },
      benchmark: SITE_CTR_CURVE_METHOD,
      queryFlags: QUERY_FLAG_METHOD,
    },
    benchmark: {
      method: SITE_CTR_CURVE_METHOD.method,
      peerRows: selection.benchmarkRows,
      byPosition: benchmarkByPosition,
    },
    brand,
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
          : `No high-impression rows at average position below ${CTR_SPLIT_POSITION} in the retained rows are materially below the heuristic CTR benchmark.`,
    },
    items,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate} (${days} ${plural(days, 'day')}), using final GSC data where available.`,
      `Brand queries: ${input.includeBrand ? 'included' : 'excluded'}. Brand terms used: ${brand.terms.join(', ') || 'none'} (${brand.source === 'provided' ? 'provided' : 'host forms, plus the bare domain stem only when Search Console shows the site is its navigational answer'}).`,
      `Only rows at average position below ${CTR_SPLIT_POSITION} with at least ${minImpressions} impressions were checked. Rows at position ${CTR_SPLIT_POSITION} to 10 belong to quick-wins, which uses the same site CTR curve.`,
      minImpressionsCaveat({
        policy: minImpressionsPolicy,
        belowMinimumRows: selection.belowMinimumRows,
      }),
      'Expected CTR uses the site CTR curve from all page-one rows (75th percentile of qualified URL CTRs per position) when enough peer data exists, otherwise the fallback position curve.',
      ...(selection.fragmentRows
        ? [
            `${selection.fragmentRows} source ${plural(selection.fragmentRows, 'row')} with a #fragment URL ${selection.fragmentRows === 1 ? 'was' : 'were'} merged into the base URL.`,
          ]
        : []),
      ...(selection.flaggedRows
        ? [
            `${selection.flaggedRows} eligible ${plural(selection.flaggedRows, 'row')} carry heuristic query flags (likely-automated or navigational-other) and rank after unflagged rows.`,
          ]
        : []),
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
