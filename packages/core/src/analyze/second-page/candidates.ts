import { shouldExcludeBrandQuery } from '../../brand.js'
import type { GscRow } from '../../types.js'
import { tokenize } from '../shared.js'

export function secondPageCandidates(input: {
  rows: GscRow[]
  site: string
  minImpressions: number
  brandTerms?: string[]
  includeBrand?: boolean
}): GscRow[] {
  return input.rows.filter((row) => {
    const query = row.keys[0] ?? ''
    return (
      row.position >= 11 &&
      row.position <= 20 &&
      row.impressions >= input.minImpressions &&
      tokenize(query).length <= 8 &&
      !shouldExcludeBrandQuery({
        query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    )
  })
}

export function groupCandidatesByPage(rows: GscRow[]): Map<string, GscRow[]> {
  const grouped = new Map<string, GscRow[]>()
  for (const row of rows) {
    const page = row.keys[1] ?? ''
    const existing = grouped.get(page) ?? []
    existing.push(row)
    grouped.set(page, existing)
  }
  return grouped
}
