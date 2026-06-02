import { isBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import type { GscRow } from '../types.js'

export const CTR_BASELINE: Record<number, number> = {
  1: 0.27,
  2: 0.15,
  3: 0.1,
  4: 0.07,
  5: 0.05,
  6: 0.035,
  7: 0.025,
  8: 0.02,
  9: 0.015,
  10: 0.012,
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
}

export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const intersection = [...setA].filter((token) => setB.has(token))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : intersection.length / union.size
}

export function defaultDateRange(days = 28): {
  startDate: string
  endDate: string
} {
  const endDate = new Date()
  endDate.setUTCDate(endDate.getUTCDate() - 4)
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1))
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  }
}

export function looksLikeBrand(
  query: string,
  brandTerms: string[] = [],
): boolean {
  return isBrandQuery(query, brandTerms)
}

export async function fetchSiteQueryPageRows(
  site: string,
  days = 28,
  refresh = false,
  filters: SearchAnalyticsLike['dimensionFilterGroups'] = [],
): Promise<{ rows: GscRow[]; calls: number; rowsFetched: number }> {
  const range = defaultDateRange(days)
  return querySearchAnalytics(
    site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      dimensionFilterGroups: filters,
    },
    { refresh },
  )
}

type SearchAnalyticsLike = Parameters<typeof querySearchAnalytics>[1]
