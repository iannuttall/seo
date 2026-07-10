import type { GscRow } from '../types.js'
import type {
  QueryOpportunityRow,
  QueryOpportunitySelection,
} from './query-opportunity-types.js'

function compareText(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0) ?? 0)
  const rightPoints = [...right].map((value) => value.codePointAt(0) ?? 0)
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index++
  ) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

export function compareQueryOpportunityRows(
  left: QueryOpportunityRow,
  right: QueryOpportunityRow,
): number {
  return (
    right.impressions - left.impressions ||
    right.clicks - left.clicks ||
    left.position - right.position ||
    compareText(left.query, right.query)
  )
}

function validRow(row: GscRow, query: string): boolean {
  return (
    row.keys.length === 1 &&
    Boolean(query) &&
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

function signature(row: GscRow): string {
  return `${row.clicks}\u0000${row.impressions}\u0000${row.ctr}\u0000${row.position}`
}

export function normalizeQueryOpportunityRows(
  rows: GscRow[],
  selection: QueryOpportunitySelection,
): QueryOpportunityRow[] {
  const grouped = new Map<string, GscRow[]>()
  for (const row of rows) {
    const query = row.keys[0]?.trim() ?? ''
    if (!validRow(row, query)) {
      selection.invalidRows++
      continue
    }
    const group = grouped.get(query) ?? []
    group.push(row)
    grouped.set(query, group)
  }

  const normalized: QueryOpportunityRow[] = []
  for (const [query, group] of grouped) {
    const signatures = new Set(group.map(signature))
    if (signatures.size > 1) {
      selection.conflictingRows += group.length
      continue
    }
    selection.duplicateRows += group.length - 1
    const row = group[0]
    if (!row) continue
    normalized.push({
      query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })
  }
  return normalized
}
