import { shouldExcludeBrandQuery } from '../../brand.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { defaultDateRange } from '../shared.js'
import type { CannibalItem } from './types.js'

export async function cannibalReport(input: {
  site: string
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}) {
  const minImpressions = input.minImpressions ?? 50
  const range = defaultDateRange(28)
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )

  const byQuery = new Map<string, typeof rows>()
  for (const row of rows) {
    const query = row.keys[0] ?? ''
    const existing = byQuery.get(query) ?? []
    existing.push(row)
    byQuery.set(query, existing)
  }

  const items: CannibalItem[] = []
  for (const [query, queryRows] of byQuery.entries()) {
    if (
      shouldExcludeBrandQuery({
        query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      continue
    }

    const eligible = queryRows.filter(
      (row) => row.impressions >= minImpressions,
    )
    if (eligible.length < 2) {
      continue
    }

    const totalImpressions = eligible.reduce(
      (sum, row) => sum + row.impressions,
      0,
    )
    const hhi = eligible.reduce((sum, row) => {
      const share = row.impressions / totalImpressions
      return sum + share * share
    }, 0)

    if (hhi >= 0.5) {
      continue
    }

    const owner = [...eligible].sort((a, b) => a.position - b.position)[0]
    if (!owner) {
      continue
    }
    items.push({
      query,
      pages: eligible.map((row) => ({
        url: row.keys[1] ?? '',
        impressions: row.impressions,
        position: row.position,
      })),
      hhi,
      recommendation: {
        principle: 'C.6',
        evidenceRef: `Query "${query}" splits across ${eligible.length} URLs with HHI ${hhi.toFixed(2)}.`,
        action: `Choose ${owner.keys[1]} as the owner URL and consolidate internal links and on-page targeting around it.`,
        effort: 'M',
        confidence: 'medium',
      },
    })
  }

  return { site: input.site, generatedAt: new Date().toISOString(), items }
}
