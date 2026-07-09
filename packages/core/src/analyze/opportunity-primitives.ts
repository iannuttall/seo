import { samePageUrl } from './page-technical-signals.js'
import { CTR_BASELINE, unicodeTokens } from './shared.js'

export { unicodeTokens } from './shared.js'

export type OpportunityBenchmarkRow = {
  keys?: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type PositionBenchmark = {
  ctr: number
  source: string
  samplePopulation: 'positive_url_samples' | 'all_qualified_url_samples'
  rows: number
  impressions: number
  qualifiedImpressions: number
  urlSamples: number
  positiveUrlSamples: number
}

export type QueryFieldCoverage = {
  evaluated: boolean
  reason?: string
  queryTokens: string[]
  inTitle: boolean
  inMetaDescription: boolean
  inH1: boolean
  inOpeningCopy: boolean
}

const MIN_BENCHMARK_URL_IMPRESSIONS = 30
const MIN_BENCHMARK_IMPRESSIONS = 1000
const MIN_BENCHMARK_URL_SAMPLES = 5
const MIN_POSITIVE_URL_SAMPLES = 3
const SITE_BENCHMARK_FLOOR_MULTIPLIER = 0.5
const SITE_BENCHMARK_CAP_MULTIPLIER = 1.5

export function roundedPosition(position: number): number {
  return Math.max(1, Math.min(10, Math.round(position)))
}

export function expectedCtrForPosition(position: number): number {
  return CTR_BASELINE[roundedPosition(position)] ?? 0.01
}

function percentile(
  values: number[],
  percentileValue: number,
): number | undefined {
  if (values.length === 0) return undefined

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  )

  return sorted[index]
}

function bucketBenchmark(input: {
  rows: OpportunityBenchmarkRow[]
  position: number
  excludedRows?: Set<OpportunityBenchmarkRow>
  sourceSuffix?: string
  samplePopulation?: PositionBenchmark['samplePopulation']
  fallbackSource?: string
}): PositionBenchmark {
  const peerRows = input.rows.filter((row) => !input.excludedRows?.has(row))
  const impressions = peerRows.reduce((sum, row) => sum + row.impressions, 0)
  const byUrl = new Map<string, { clicks: number; impressions: number }>()

  for (const row of peerRows) {
    const key = row.keys?.[1] || `${row.keys?.[0] ?? 'query'}:${row.position}`
    const current = byUrl.get(key) ?? { clicks: 0, impressions: 0 }
    current.clicks += row.clicks
    current.impressions += row.impressions
    byUrl.set(key, current)
  }

  const qualifiedSamples = [...byUrl.values()].filter(
    (sample) => sample.impressions >= MIN_BENCHMARK_URL_IMPRESSIONS,
  )
  const urlCtrSamples = qualifiedSamples.map(
    (sample) => sample.clicks / sample.impressions,
  )
  const positiveUrlCtrSamples = urlCtrSamples.filter((ctr) => ctr > 0)
  const qualifiedImpressions = qualifiedSamples.reduce(
    (sum, sample) => sum + sample.impressions,
    0,
  )
  const hasEnoughSiteData =
    qualifiedImpressions >= MIN_BENCHMARK_IMPRESSIONS &&
    urlCtrSamples.length >= MIN_BENCHMARK_URL_SAMPLES &&
    positiveUrlCtrSamples.length >= MIN_POSITIVE_URL_SAMPLES
  const fallbackCtr = expectedCtrForPosition(input.position)
  const samplePopulation = input.samplePopulation ?? 'positive_url_samples'
  const percentileSamples =
    samplePopulation === 'all_qualified_url_samples'
      ? urlCtrSamples
      : positiveUrlCtrSamples
  const rawSiteCtr = hasEnoughSiteData
    ? percentile(percentileSamples, 75)
    : undefined
  const floorCtr = fallbackCtr * SITE_BENCHMARK_FLOOR_MULTIPLIER
  const capCtr = fallbackCtr * SITE_BENCHMARK_CAP_MULTIPLIER
  const hasSiteCtr = rawSiteCtr !== undefined
  const ctr = hasSiteCtr
    ? Math.max(floorCtr, Math.min(rawSiteCtr, capCtr))
    : fallbackCtr
  const adjustment =
    hasSiteCtr && rawSiteCtr < floorCtr
      ? '_floored'
      : hasSiteCtr && rawSiteCtr > capCtr
        ? '_capped'
        : ''
  const source = hasSiteCtr
    ? `site_gsc_position_bucket_robust_p75${samplePopulation === 'all_qualified_url_samples' ? '_all_samples' : ''}${input.sourceSuffix ?? ''}${adjustment}`
    : (input.fallbackSource ?? 'default_position_curve')

  return {
    ctr: Number(ctr.toFixed(4)),
    source,
    samplePopulation,
    rows: peerRows.length,
    impressions,
    qualifiedImpressions,
    urlSamples: urlCtrSamples.length,
    positiveUrlSamples: positiveUrlCtrSamples.length,
  }
}

function smoothMonotonicBenchmarks(
  input: Record<number, PositionBenchmark>,
): Record<string, PositionBenchmark> {
  const byPosition: Record<string, PositionBenchmark> = {}
  let previousCtr = Number.POSITIVE_INFINITY

  for (const position of Object.keys(CTR_BASELINE).map(Number)) {
    const benchmark = input[position] ?? bucketBenchmark({ rows: [], position })
    const ctr = Math.min(benchmark.ctr, previousCtr)
    const smoothed = ctr < benchmark.ctr
    previousCtr = ctr

    byPosition[String(position)] = {
      ...benchmark,
      ctr: Number(ctr.toFixed(4)),
      source: smoothed
        ? `${benchmark.source}_monotonic_smoothed`
        : benchmark.source,
    }
  }

  return byPosition
}

export function createCtrBenchmarkContext(
  rows: OpportunityBenchmarkRow[],
  options: {
    samplePopulation?: PositionBenchmark['samplePopulation']
    fallbackSource?: string
  } = {},
) {
  const buckets = new Map<number, OpportunityBenchmarkRow[]>()

  for (const row of rows) {
    const position = roundedPosition(row.position)
    buckets.set(position, [...(buckets.get(position) ?? []), row])
  }

  const raw: Record<number, PositionBenchmark> = {}
  for (const position of Object.keys(CTR_BASELINE).map(Number)) {
    raw[position] = bucketBenchmark({
      rows: buckets.get(position) ?? [],
      position,
      samplePopulation: options.samplePopulation,
      fallbackSource: options.fallbackSource,
    })
  }

  const byPosition = smoothMonotonicBenchmarks(raw)

  function benchmarkForRow(
    row: OpportunityBenchmarkRow,
    excludedRows: OpportunityBenchmarkRow[],
    sourceSuffix?: string,
  ): PositionBenchmark {
    const position = roundedPosition(row.position)
    const excludedSet = new Set(excludedRows)
    const rowRaw: Record<number, PositionBenchmark> = {}

    for (const bucketPosition of Object.keys(CTR_BASELINE).map(Number)) {
      rowRaw[bucketPosition] = bucketBenchmark({
        rows: buckets.get(bucketPosition) ?? [],
        position: bucketPosition,
        excludedRows: excludedSet,
        sourceSuffix,
        samplePopulation: options.samplePopulation,
        fallbackSource: options.fallbackSource,
      })
    }

    return (
      smoothMonotonicBenchmarks(rowRaw)[String(position)] ??
      byPosition[String(position)] ??
      bucketBenchmark({ rows: [], position })
    )
  }

  return {
    byPosition,
    forRow(row: OpportunityBenchmarkRow): PositionBenchmark {
      return benchmarkForRow(row, [row], '_leave_one_out')
    },
    forUrl(row: OpportunityBenchmarkRow): PositionBenchmark {
      const url = row.keys?.[1]
      const excludedRows = url
        ? rows.filter((candidate) =>
            samePageUrl(candidate.keys?.[1] ?? '', url),
          )
        : [row]
      return benchmarkForRow(row, excludedRows, '_leave_target_url_out')
    },
    forAggregate(
      row: OpportunityBenchmarkRow,
      excludedRows: OpportunityBenchmarkRow[] = [],
    ): PositionBenchmark {
      return benchmarkForRow(
        row,
        excludedRows,
        excludedRows.length ? '_leave_group_out' : undefined,
      )
    },
  }
}

export function queryFieldCoverage(
  query: string,
  input: { title?: string; meta?: string; h1?: string; opening?: string },
): QueryFieldCoverage {
  const tokens = unicodeTokens(query).filter((token) => token.length > 2)
  if (query.trim() && tokens.length === 0) {
    return {
      evaluated: false,
      reason: 'coverage_not_evaluated_for_script',
      queryTokens: tokens,
      inTitle: false,
      inMetaDescription: false,
      inH1: false,
      inOpeningCopy: false,
    }
  }

  const hasToken = (value?: string) => {
    const haystack = new Set(unicodeTokens(value ?? ''))
    return tokens.length > 0 && tokens.some((token) => haystack.has(token))
  }

  return {
    evaluated: true,
    queryTokens: tokens,
    inTitle: hasToken(input.title),
    inMetaDescription: hasToken(input.meta),
    inH1: hasToken(input.h1),
    inOpeningCopy: hasToken(input.opening),
  }
}

export function pageEvidenceRecommendation(input: {
  query: string
  coverage: QueryFieldCoverage
}): string {
  if (!input.coverage.evaluated) {
    return 'Coverage was not evaluated for this query script, so do not infer a title, meta, H1, or copy gap from token matching alone. Use manual SERP and page review before editing.'
  }

  const missing = [
    !input.coverage.inTitle ? 'title' : undefined,
    !input.coverage.inMetaDescription ? 'meta description' : undefined,
    !input.coverage.inH1 ? 'H1' : undefined,
    !input.coverage.inOpeningCopy ? 'opening copy' : undefined,
  ].filter((field): field is string => Boolean(field))

  return missing.length
    ? `Check ${missing.join(', ')} first. The page ranks already, but the main SERP-facing fields do not clearly reflect "${input.query}".`
    : 'The query already appears in the main extracted fields. Avoid a blind rewrite; compare SERP intent, snippets, and competing titles before changing the page.'
}

export function queryOpportunityRecommendation(input: {
  query: string
  position: number
  ctr: number
  expectedCtr: number
  estimatedClickLift: number
}) {
  const percent = (value: number) =>
    `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`
  const rounded = roundedPosition(input.position)

  return {
    title: `Review SERP framing for "${input.query}".`,
    reason: `The page already ranks around position ${rounded}, but CTR is ${percent(input.ctr)} against an expected ${percent(input.expectedCtr)} for that position.`,
    expectedImpact: `About ${Math.round(input.estimatedClickLift)} extra clicks in the selected GSC window if CTR reaches the benchmark.`,
  }
}
