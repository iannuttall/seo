import type { GscRow } from '../../types.js'
import type { CannibalPage } from './cannibal-types.js'

export type CannibalAggregatedPage = Omit<
  CannibalPage,
  'impressionShare' | 'template'
>

export type CannibalQueryGroup = {
  query: string
  pages: Map<string, CannibalAggregatedPage>
}

export function compareCannibalText(left: string, right: string): number {
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

export function normalizeCannibalQuery(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function normalizeCannibalUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function validMetrics(row: GscRow): boolean {
  return (
    Number.isFinite(row.clicks) &&
    row.clicks >= 0 &&
    Number.isFinite(row.impressions) &&
    row.impressions > 0 &&
    row.clicks <= row.impressions &&
    Number.isFinite(row.ctr) &&
    row.ctr >= 0 &&
    row.ctr <= 1 &&
    Number.isFinite(row.position) &&
    row.position > 0
  )
}

export function validCannibalRow(
  row: GscRow,
  query: string,
  url?: string,
): boolean {
  return Boolean(query && url) && validMetrics(row)
}

export function validCannibalPropertyRow(row: GscRow, query: string): boolean {
  return Boolean(query) && validMetrics(row)
}

export function addCannibalRow(
  group: CannibalQueryGroup,
  url: string,
  row: GscRow,
): void {
  const current = group.pages.get(url)
  const clicks = (current?.clicks ?? 0) + row.clicks
  const impressions = (current?.impressions ?? 0) + row.impressions
  const weightedPosition =
    (current?.position ?? 0) * (current?.impressions ?? 0) +
    row.position * row.impressions
  group.pages.set(url, {
    url,
    clicks,
    impressions,
    ctr: clicks / impressions,
    position: weightedPosition / impressions,
  })
}
