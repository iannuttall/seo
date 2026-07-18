import { isBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { finalGscDateRange } from '../gsc/dates.js'
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

const WORD_SEGMENTER =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('und', { granularity: 'word' })
    : undefined

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function unicodeTokens(value: string): string[] {
  const normalized = normalizeText(value)

  if (WORD_SEGMENTER) {
    return [...WORD_SEGMENTER.segment(normalized)]
      .filter((part) => part.isWordLike)
      .map((part) => part.segment.trim())
      .filter((token) => token.length > 1)
  }

  return (normalized.match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length > 1,
  )
}

export function tokenize(value: string): string[] {
  return unicodeTokens(value)
}

export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const intersection = [...setA].filter((token) => setB.has(token))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : intersection.length / union.size
}

export function defaultDateRange(
  days = 28,
  now = new Date(),
): {
  startDate: string
  endDate: string
} {
  return finalGscDateRange(days, now)
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
