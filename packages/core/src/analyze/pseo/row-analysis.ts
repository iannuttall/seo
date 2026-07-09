import {
  canonicalPseoTerm,
  normalizePseoText,
  pseoQueryPatterns,
  pseoQueryTerms,
  pseoQueryThemeTerms,
} from './query-insights.js'
import { type PseoTemplateCluster, parsePseoPath } from './templates.js'
import type {
  PseoEntityFit,
  PseoPageRow,
  PseoQueryCoverage,
  PseoQueryPageRow,
  PseoTemplateMetrics,
} from './types.js'

export function comparePseoText(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0) ?? 0)
  const rightPoints = [...right].map((value) => value.codePointAt(0) ?? 0)
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index++
  ) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0)
    if (difference) return difference
  }
  return leftPoints.length - rightPoints.length
}

export function validPseoHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function validMetric(value: number, minimum = 0): boolean {
  return Number.isFinite(value) && value >= minimum
}

export function validPseoQueryPageRow(row: PseoQueryPageRow): boolean {
  return (
    Boolean(row.query.trim()) &&
    validPseoHttpUrl(row.page) &&
    validMetric(row.clicks) &&
    validMetric(row.impressions) &&
    row.clicks <= row.impressions &&
    validMetric(row.position, 1)
  )
}

export function validPseoPageRow(row: PseoPageRow): boolean {
  return (
    validPseoHttpUrl(row.page) &&
    validMetric(row.clicks) &&
    validMetric(row.impressions) &&
    row.clicks <= row.impressions &&
    validMetric(row.position, 1)
  )
}

function weightedPosition(
  rows: Array<{ impressions: number; position: number }>,
): number {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  if (!impressions) return 0
  return (
    rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
    impressions
  )
}

export function aggregatePseoPageRows(rows: PseoPageRow[]): PseoPageRow[] {
  const pages = new Map<string, PseoPageRow>()
  for (const row of rows) {
    const previous = pages.get(row.page)
    pages.set(row.page, {
      page: row.page,
      clicks: (previous?.clicks ?? 0) + row.clicks,
      impressions: (previous?.impressions ?? 0) + row.impressions,
      position: previous ? weightedPosition([previous, row]) : row.position,
    })
  }
  return [...pages.values()]
}

export function aggregatePseoQueryPageRows(
  rows: PseoQueryPageRow[],
): PseoQueryPageRow[] {
  const pairs = new Map<string, PseoQueryPageRow>()
  for (const row of rows) {
    const key = `${row.query}\u0000${row.page}`
    const previous = pairs.get(key)
    pairs.set(key, {
      query: row.query,
      page: row.page,
      clicks: (previous?.clicks ?? 0) + row.clicks,
      impressions: (previous?.impressions ?? 0) + row.impressions,
      position: previous ? weightedPosition([previous, row]) : row.position,
    })
  }
  return [...pairs.values()]
}

function termCoverage(query: string, text?: string) {
  const terms = pseoQueryTerms(query).map(canonicalPseoTerm)
  if (!terms.length) return { coverage: 0, missingTerms: [] }
  const textTerms = new Set(
    pseoQueryTerms(normalizePseoText(text ?? '')).map(canonicalPseoTerm),
  )
  const matched = terms.filter((term) => textTerms.has(term))
  return {
    coverage: matched.length / terms.length,
    missingTerms: terms.filter((term) => !textTerms.has(term)),
  }
}

export function pseoQueryCoverage(input: {
  query: string
  title?: string
  h1?: string
  body?: string
}): PseoQueryCoverage {
  const title = termCoverage(input.query, input.title)
  const h1 = termCoverage(input.query, input.h1)
  const body = termCoverage(input.query, input.body)
  const classification =
    body.coverage < 0.75
      ? 'body-term-review'
      : title.coverage < 0.75 || h1.coverage < 0.75
        ? 'serp-framing-review'
        : 'covered'
  return {
    method: 'literal-query-term-presence-v1',
    heuristic: true,
    query: input.query,
    classification,
    titleCoverage: title.coverage,
    h1Coverage: h1.coverage,
    bodyCoverage: body.coverage,
    missingTerms: body.missingTerms.slice(0, 8),
  }
}

function pathVariableTerms(
  url: string,
  cluster: PseoTemplateCluster,
): string[] {
  const parts = parsePseoPath(url)
  const terms = cluster.shape.variableSegments.flatMap((segment) => {
    const value = parts[segment.index]
    return value ? pseoQueryThemeTerms(value) : []
  })
  return [...new Set(terms.map(canonicalPseoTerm))]
}

function entityFitForRows(
  rows: PseoQueryPageRow[],
  cluster: PseoTemplateCluster,
): PseoEntityFit {
  let checkedQueries = 0
  let matchedQueries = 0
  let checkedImpressions = 0
  let matchedImpressions = 0
  const weakExamples: PseoEntityFit['weakExamples'] = []
  for (const row of rows) {
    const pathTerms = pathVariableTerms(row.page, cluster)
    if (!pathTerms.length) continue
    const queryTerms = new Set(pseoQueryTerms(row.query).map(canonicalPseoTerm))
    checkedQueries += 1
    checkedImpressions += row.impressions
    if (pathTerms.some((term) => queryTerms.has(term))) {
      matchedQueries += 1
      matchedImpressions += row.impressions
    } else {
      weakExamples.push({
        url: row.page,
        query: row.query,
        pathTerms: pathTerms.slice(0, 6),
        impressions: row.impressions,
      })
    }
  }
  return {
    method: 'any-path-variable-term-v1',
    heuristic: true,
    checkedQueries,
    matchedQueries,
    impressionShare: checkedImpressions
      ? matchedImpressions / checkedImpressions
      : 0,
    weakExamples: weakExamples
      .sort(
        (left, right) =>
          right.impressions - left.impressions ||
          comparePseoText(left.query, right.query) ||
          comparePseoText(left.url, right.url),
      )
      .slice(0, 5),
  }
}

export function pseoMetricsForRows(input: {
  pageRows: PseoPageRow[]
  queryRows: PseoQueryPageRow[]
  cluster: PseoTemplateCluster
}): PseoTemplateMetrics {
  const clicks = input.pageRows.reduce((sum, row) => sum + row.clicks, 0)
  const impressions = input.pageRows.reduce(
    (sum, row) => sum + row.impressions,
    0,
  )
  const byQuery = new Map<string, PseoTemplateMetrics['topQueries'][number]>()
  for (const row of input.queryRows) {
    const previous = byQuery.get(row.query)
    byQuery.set(row.query, {
      query: row.query,
      clicks: (previous?.clicks ?? 0) + row.clicks,
      impressions: (previous?.impressions ?? 0) + row.impressions,
      position: previous ? weightedPosition([previous, row]) : row.position,
    })
  }
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: weightedPosition(input.pageRows),
    impressionsPerUrl: input.cluster.urlCount
      ? impressions / input.cluster.urlCount
      : 0,
    clicksPerUrl: input.cluster.urlCount ? clicks / input.cluster.urlCount : 0,
    retainedQueryImpressions: input.queryRows.reduce(
      (sum, row) => sum + row.impressions,
      0,
    ),
    queryCount: byQuery.size,
    pageCountWithGsc: input.pageRows.length,
    zeroClickImpressions: input.pageRows
      .filter((row) => row.clicks === 0)
      .reduce((sum, row) => sum + row.impressions, 0),
    entityFit: entityFitForRows(input.queryRows, input.cluster),
    queryPatterns: pseoQueryPatterns(input.queryRows),
    topQueries: [...byQuery.values()]
      .sort(
        (left, right) =>
          right.impressions - left.impressions ||
          right.clicks - left.clicks ||
          comparePseoText(left.query, right.query),
      )
      .slice(0, 5),
  }
}
