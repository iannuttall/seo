import { shouldExcludeBrandQuery } from '../brand.js'
import type { GscRow } from '../types.js'
import type {
  PageOpportunityAnalysisInput,
  PageOpportunitySelection,
} from './page-opportunities-types.js'
import { samePageUrl } from './page-technical-signals.js'
import { isLowActionabilityQuery } from './query-quality.js'

const DEFAULT_MIN_IMPRESSIONS = 10
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

function integerInRange(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function hasValidMetrics(row: GscRow): boolean {
  return (
    Number.isFinite(row.clicks) &&
    Number.isFinite(row.impressions) &&
    Number.isFinite(row.ctr) &&
    Number.isFinite(row.position) &&
    row.clicks >= 0 &&
    row.impressions > 0 &&
    row.clicks <= row.impressions &&
    row.ctr >= 0 &&
    row.ctr <= 1 &&
    row.position > 0
  )
}

function isBrandRow(input: {
  query: string
  site: string
  brandTerms?: string[]
  includeBrand?: boolean
}): boolean {
  return shouldExcludeBrandQuery({
    query: input.query,
    siteUrl: input.site,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
}

export function normalizePageOpportunityOptions(
  input: Pick<PageOpportunityAnalysisInput, 'minImpressions' | 'limit'>,
): { minImpressions: number; limit: number } {
  return {
    minImpressions: integerInRange(
      input.minImpressions,
      DEFAULT_MIN_IMPRESSIONS,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    limit: integerInRange(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
  }
}

export function selectTargetRows(input: {
  rows: GscRow[]
  site: string
  url: string
  minImpressions: number
  brandTerms?: string[]
  includeBrand?: boolean
}): { eligibleRows: GscRow[]; selection: PageOpportunitySelection } {
  const selection: PageOpportunitySelection = {
    sourceRows: input.rows.length,
    invalidRows: 0,
    wrongPageRows: 0,
    belowMinimumRows: 0,
    lowActionabilityRows: 0,
    brandRows: 0,
    eligibleRows: 0,
    returnedRows: 0,
    limitedRows: 0,
  }
  const eligibleRows: GscRow[] = []

  for (const row of input.rows) {
    const query = row.keys[0]?.trim() ?? ''
    const page = row.keys[1] ?? ''
    if (
      row.keys.length < 2 ||
      !query ||
      !isHttpUrl(page) ||
      !hasValidMetrics(row)
    ) {
      selection.invalidRows++
      continue
    }
    if (!samePageUrl(page, input.url)) {
      selection.wrongPageRows++
      continue
    }
    if (row.impressions < input.minImpressions) {
      selection.belowMinimumRows++
      continue
    }
    if (isLowActionabilityQuery(query)) {
      selection.lowActionabilityRows++
      continue
    }
    if (
      isBrandRow({
        query,
        site: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      selection.brandRows++
      continue
    }
    selection.eligibleRows++
    eligibleRows.push(row)
  }

  return { eligibleRows, selection }
}

export function selectBenchmarkRows(input: {
  rows: GscRow[]
  site: string
  brandTerms?: string[]
  includeBrand?: boolean
}): GscRow[] {
  return input.rows.filter((row) => {
    const query = row.keys[0]?.trim() ?? ''
    return (
      row.keys.length >= 2 &&
      isHttpUrl(row.keys[1] ?? '') &&
      hasValidMetrics(row) &&
      row.position >= 1 &&
      row.position <= 10 &&
      Boolean(query) &&
      !isLowActionabilityQuery(query) &&
      !isBrandRow({
        query,
        site: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    )
  })
}
