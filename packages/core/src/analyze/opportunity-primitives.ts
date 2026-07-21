import { normalizePageUrl } from './page-technical-signals.js'
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
const URL_BENCHMARK_CACHE_LIMIT = 10_000

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
    const rawKey =
      row.keys?.[1] || `${row.keys?.[0] ?? 'query'}:${row.position}`
    const key = row.keys?.[1] ? normalizePageUrl(rawKey) : rawKey
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

type IndexedUrlSample = {
  key: string
  clicks: number
  impressions: number
  rows: number
  ctr: number
}

type IndexedPositionBucket = {
  rows: number
  impressions: number
  byUrl: Map<string, IndexedUrlSample>
  qualified: IndexedUrlSample[]
  qualifiedIndexes: Map<string, number>
  positive: IndexedUrlSample[]
  positiveIndexes: Map<string, number>
  qualifiedImpressions: number
}

function indexedPositionBucket(
  rows: OpportunityBenchmarkRow[],
): IndexedPositionBucket {
  const byUrl = new Map<string, IndexedUrlSample>()
  let impressions = 0
  for (const row of rows) {
    impressions += row.impressions
    const rawKey =
      row.keys?.[1] || `${row.keys?.[0] ?? 'query'}:${row.position}`
    const key = row.keys?.[1] ? normalizePageUrl(rawKey) : rawKey
    const current = byUrl.get(key) ?? {
      key,
      clicks: 0,
      impressions: 0,
      rows: 0,
      ctr: 0,
    }
    current.clicks += row.clicks
    current.impressions += row.impressions
    current.rows += 1
    current.ctr = current.impressions ? current.clicks / current.impressions : 0
    byUrl.set(key, current)
  }
  const compareSample = (left: IndexedUrlSample, right: IndexedUrlSample) =>
    left.ctr - right.ctr ||
    (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
  const qualified = [...byUrl.values()]
    .filter((sample) => sample.impressions >= MIN_BENCHMARK_URL_IMPRESSIONS)
    .sort(compareSample)
  const positive = qualified
    .filter((sample) => sample.ctr > 0)
    .sort(compareSample)
  return {
    rows: rows.length,
    impressions,
    byUrl,
    qualified,
    qualifiedIndexes: new Map(
      qualified.map((sample, index) => [sample.key, index]),
    ),
    positive,
    positiveIndexes: new Map(
      positive.map((sample, index) => [sample.key, index]),
    ),
    qualifiedImpressions: qualified.reduce(
      (sum, sample) => sum + sample.impressions,
      0,
    ),
  }
}

function indexedPercentile(
  samples: IndexedUrlSample[],
  indexes: ReadonlyMap<string, number>,
  excludedKey: string,
  percentileValue: number,
): number | undefined {
  const excludedIndex = indexes.get(excludedKey)
  const length = samples.length - (excludedIndex === undefined ? 0 : 1)
  if (length === 0) return undefined
  const rank = Math.min(
    length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * length) - 1),
  )
  const sourceIndex =
    excludedIndex !== undefined && rank >= excludedIndex ? rank + 1 : rank
  return samples[sourceIndex]?.ctr
}

function compareIndexedSample(
  left: IndexedUrlSample,
  right: IndexedUrlSample,
): number {
  return (
    left.ctr - right.ctr ||
    (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
  )
}

function adjustedIndexedPercentile(input: {
  samples: IndexedUrlSample[]
  indexes: ReadonlyMap<string, number>
  replacements: IndexedUrlSample[]
  affectedKeys: ReadonlySet<string>
  percentileValue: number
}): number | undefined {
  const removedIndexes = [...input.affectedKeys]
    .map((key) => input.indexes.get(key))
    .filter((index): index is number => index !== undefined)
    .sort((left, right) => left - right)
  const length =
    input.samples.length - removedIndexes.length + input.replacements.length
  if (length === 0) return undefined

  const rank = Math.min(
    length - 1,
    Math.max(0, Math.ceil((input.percentileValue / 100) * length) - 1),
  )
  const displacement = removedIndexes.length + input.replacements.length + 1
  const start = Math.max(0, rank - displacement)
  const end = Math.min(input.samples.length, rank + displacement + 1)
  const removedBefore = removedIndexes.filter((index) => index < start).length
  const candidates = [
    ...input.samples
      .slice(start, end)
      .filter((sample) => !input.affectedKeys.has(sample.key)),
    ...input.replacements,
  ].sort(compareIndexedSample)
  const candidateRank = rank - (start - removedBefore)
  return candidates[candidateRank]?.ctr
}

function finalizeIndexedBenchmark(input: {
  position: number
  rows: number
  impressions: number
  qualifiedImpressions: number
  urlSamples: number
  positiveUrlSamples: number
  rawSiteCtr?: number
  sourceSuffix: string
  samplePopulation: PositionBenchmark['samplePopulation']
  fallbackSource?: string
}): PositionBenchmark {
  const fallbackCtr = expectedCtrForPosition(input.position)
  const floorCtr = fallbackCtr * SITE_BENCHMARK_FLOOR_MULTIPLIER
  const capCtr = fallbackCtr * SITE_BENCHMARK_CAP_MULTIPLIER
  const hasSiteCtr = input.rawSiteCtr !== undefined
  const ctr = hasSiteCtr
    ? Math.max(floorCtr, Math.min(input.rawSiteCtr ?? 0, capCtr))
    : fallbackCtr
  const adjustment =
    hasSiteCtr && (input.rawSiteCtr ?? 0) < floorCtr
      ? '_floored'
      : hasSiteCtr && (input.rawSiteCtr ?? 0) > capCtr
        ? '_capped'
        : ''
  const source = hasSiteCtr
    ? `site_gsc_position_bucket_robust_p75${input.samplePopulation === 'all_qualified_url_samples' ? '_all_samples' : ''}${input.sourceSuffix}${adjustment}`
    : (input.fallbackSource ?? 'default_position_curve')
  return {
    ctr: Number(ctr.toFixed(4)),
    source,
    samplePopulation: input.samplePopulation,
    rows: input.rows,
    impressions: input.impressions,
    qualifiedImpressions: input.qualifiedImpressions,
    urlSamples: input.urlSamples,
    positiveUrlSamples: input.positiveUrlSamples,
  }
}

function indexedBucketBenchmark(input: {
  bucket: IndexedPositionBucket
  position: number
  excludedKey: string
  sourceSuffix: string
  samplePopulation?: PositionBenchmark['samplePopulation']
  fallbackSource?: string
}): PositionBenchmark {
  const excluded = input.bucket.byUrl.get(input.excludedKey)
  const excludesQualified =
    excluded && excluded.impressions >= MIN_BENCHMARK_URL_IMPRESSIONS
      ? excluded
      : undefined
  const rows = input.bucket.rows - (excluded?.rows ?? 0)
  const impressions = input.bucket.impressions - (excluded?.impressions ?? 0)
  const qualifiedImpressions =
    input.bucket.qualifiedImpressions - (excludesQualified?.impressions ?? 0)
  const urlSamples = input.bucket.qualified.length - (excludesQualified ? 1 : 0)
  const excludesPositive = Boolean(
    excludesQualified && excludesQualified.ctr > 0,
  )
  const positiveUrlSamples =
    input.bucket.positive.length - (excludesPositive ? 1 : 0)
  const hasEnoughSiteData =
    qualifiedImpressions >= MIN_BENCHMARK_IMPRESSIONS &&
    urlSamples >= MIN_BENCHMARK_URL_SAMPLES &&
    positiveUrlSamples >= MIN_POSITIVE_URL_SAMPLES
  const samplePopulation = input.samplePopulation ?? 'positive_url_samples'
  const rawSiteCtr = hasEnoughSiteData
    ? samplePopulation === 'all_qualified_url_samples'
      ? indexedPercentile(
          input.bucket.qualified,
          input.bucket.qualifiedIndexes,
          input.excludedKey,
          75,
        )
      : indexedPercentile(
          input.bucket.positive,
          input.bucket.positiveIndexes,
          input.excludedKey,
          75,
        )
    : undefined
  return finalizeIndexedBenchmark({
    position: input.position,
    rows,
    impressions,
    qualifiedImpressions,
    urlSamples,
    positiveUrlSamples,
    rawSiteCtr,
    sourceSuffix: input.sourceSuffix,
    samplePopulation,
    fallbackSource: input.fallbackSource,
  })
}

function indexedAggregateBucketBenchmark(input: {
  bucket: IndexedPositionBucket
  position: number
  excludedRows: OpportunityBenchmarkRow[]
  sourceSuffix: string
  samplePopulation?: PositionBenchmark['samplePopulation']
  fallbackSource?: string
}): PositionBenchmark {
  const excludedByKey = new Map<
    string,
    { clicks: number; impressions: number; rows: number }
  >()
  let excludedImpressions = 0
  for (const row of input.excludedRows) {
    excludedImpressions += row.impressions
    const rawKey =
      row.keys?.[1] || `${row.keys?.[0] ?? 'query'}:${row.position}`
    const key = row.keys?.[1] ? normalizePageUrl(rawKey) : rawKey
    const current = excludedByKey.get(key) ?? {
      clicks: 0,
      impressions: 0,
      rows: 0,
    }
    current.clicks += row.clicks
    current.impressions += row.impressions
    current.rows += 1
    excludedByKey.set(key, current)
  }

  const affectedKeys = new Set(excludedByKey.keys())
  const qualifiedReplacements: IndexedUrlSample[] = []
  const positiveReplacements: IndexedUrlSample[] = []
  let removedQualified = 0
  let removedPositive = 0
  let qualifiedImpressions = input.bucket.qualifiedImpressions

  for (const [key, excluded] of excludedByKey) {
    const original = input.bucket.byUrl.get(key)
    if (!original) continue
    const originalQualified =
      original.impressions >= MIN_BENCHMARK_URL_IMPRESSIONS
    if (originalQualified) {
      removedQualified += 1
      qualifiedImpressions -= original.impressions
      if (original.ctr > 0) removedPositive += 1
    }
    const impressions = Math.max(0, original.impressions - excluded.impressions)
    const clicks = Math.max(0, original.clicks - excluded.clicks)
    if (impressions < MIN_BENCHMARK_URL_IMPRESSIONS) continue
    const replacement = {
      key,
      clicks,
      impressions,
      rows: Math.max(0, original.rows - excluded.rows),
      ctr: impressions ? clicks / impressions : 0,
    }
    qualifiedReplacements.push(replacement)
    qualifiedImpressions += impressions
    if (replacement.ctr > 0) positiveReplacements.push(replacement)
  }

  const rows = input.bucket.rows - input.excludedRows.length
  const impressions = input.bucket.impressions - excludedImpressions
  const urlSamples =
    input.bucket.qualified.length -
    removedQualified +
    qualifiedReplacements.length
  const positiveUrlSamples =
    input.bucket.positive.length - removedPositive + positiveReplacements.length
  const hasEnoughSiteData =
    qualifiedImpressions >= MIN_BENCHMARK_IMPRESSIONS &&
    urlSamples >= MIN_BENCHMARK_URL_SAMPLES &&
    positiveUrlSamples >= MIN_POSITIVE_URL_SAMPLES
  const samplePopulation = input.samplePopulation ?? 'positive_url_samples'
  const rawSiteCtr = hasEnoughSiteData
    ? samplePopulation === 'all_qualified_url_samples'
      ? adjustedIndexedPercentile({
          samples: input.bucket.qualified,
          indexes: input.bucket.qualifiedIndexes,
          replacements: qualifiedReplacements,
          affectedKeys,
          percentileValue: 75,
        })
      : adjustedIndexedPercentile({
          samples: input.bucket.positive,
          indexes: input.bucket.positiveIndexes,
          replacements: positiveReplacements,
          affectedKeys,
          percentileValue: 75,
        })
    : undefined

  return finalizeIndexedBenchmark({
    position: input.position,
    rows,
    impressions,
    qualifiedImpressions,
    urlSamples,
    positiveUrlSamples,
    rawSiteCtr,
    sourceSuffix: input.sourceSuffix,
    samplePopulation,
    fallbackSource: input.fallbackSource,
  })
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
  const diagnostics = {
    indexRowVisits: 0,
    urlLookups: 0,
    fallbackRowScans: 0,
  }

  for (const row of rows) {
    const position = roundedPosition(row.position)
    const bucket = buckets.get(position) ?? []
    bucket.push(row)
    buckets.set(position, bucket)
    diagnostics.indexRowVisits += 1
  }
  const indexedBuckets = new Map(
    [...buckets].map(([position, bucketRows]) => [
      position,
      indexedPositionBucket(bucketRows),
    ]),
  )
  const emptyIndexedBucket = indexedPositionBucket([])
  const urlBenchmarkCache = new Map<string, Map<number, PositionBenchmark>>()
  const urlRowCounts = new Map<string, number>()
  for (const row of rows) {
    const key = normalizePageUrl(row.keys?.[1] ?? '')
    urlRowCounts.set(key, (urlRowCounts.get(key) ?? 0) + 1)
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
    diagnostics.fallbackRowScans += rows.length
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

  function benchmarkForAggregate(
    row: OpportunityBenchmarkRow,
    excludedRows: OpportunityBenchmarkRow[],
  ): PositionBenchmark {
    const position = roundedPosition(row.position)
    const excludedByPosition = new Map<number, OpportunityBenchmarkRow[]>()
    for (const excluded of excludedRows) {
      const excludedPosition = roundedPosition(excluded.position)
      const positionRows = excludedByPosition.get(excludedPosition) ?? []
      positionRows.push(excluded)
      excludedByPosition.set(excludedPosition, positionRows)
    }
    const rowRaw: Record<number, PositionBenchmark> = {}
    for (const bucketPosition of Object.keys(CTR_BASELINE).map(Number)) {
      rowRaw[bucketPosition] = indexedAggregateBucketBenchmark({
        bucket: indexedBuckets.get(bucketPosition) ?? emptyIndexedBucket,
        position: bucketPosition,
        excludedRows: excludedByPosition.get(bucketPosition) ?? [],
        sourceSuffix: excludedRows.length ? '_leave_group_out' : '',
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

  function benchmarkForUrl(row: OpportunityBenchmarkRow): PositionBenchmark {
    diagnostics.urlLookups += 1
    const position = roundedPosition(row.position)
    const excludedKey = normalizePageUrl(row.keys?.[1] ?? '')
    const cached = excludedKey
      ? urlBenchmarkCache.get(excludedKey)?.get(position)
      : undefined
    if (cached) return cached
    const rowRaw: Record<number, PositionBenchmark> = {}
    for (const bucketPosition of Object.keys(CTR_BASELINE).map(Number)) {
      rowRaw[bucketPosition] = indexedBucketBenchmark({
        bucket: indexedBuckets.get(bucketPosition) ?? emptyIndexedBucket,
        position: bucketPosition,
        excludedKey,
        sourceSuffix: '_leave_target_url_out',
        samplePopulation: options.samplePopulation,
        fallbackSource: options.fallbackSource,
      })
    }
    const benchmark =
      smoothMonotonicBenchmarks(rowRaw)[String(position)] ??
      byPosition[String(position)] ??
      bucketBenchmark({ rows: [], position })
    let byPositionForUrl = excludedKey
      ? urlBenchmarkCache.get(excludedKey)
      : undefined
    if (
      excludedKey &&
      !byPositionForUrl &&
      urlBenchmarkCache.size < URL_BENCHMARK_CACHE_LIMIT
    ) {
      byPositionForUrl = new Map()
      urlBenchmarkCache.set(excludedKey, byPositionForUrl)
    }
    byPositionForUrl?.set(position, benchmark)
    return benchmark
  }

  return {
    byPosition,
    forRow(row: OpportunityBenchmarkRow): PositionBenchmark {
      return benchmarkForRow(row, [row], '_leave_one_out')
    },
    forUrl(row: OpportunityBenchmarkRow): PositionBenchmark {
      return benchmarkForUrl(row)
    },
    urlRowCount(row: OpportunityBenchmarkRow): number {
      const key = normalizePageUrl(row.keys?.[1] ?? '')
      return urlRowCounts.get(key) ?? 0
    },
    forAggregate(
      row: OpportunityBenchmarkRow,
      excludedRows: OpportunityBenchmarkRow[] = [],
    ): PositionBenchmark {
      return benchmarkForAggregate(row, excludedRows)
    },
    diagnostics,
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
