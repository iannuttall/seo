import { shouldExcludeBrandQuery } from '../../brand.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { defaultDateRange } from '../shared.js'
import type { DecayItem } from './types.js'

export async function decayingReport(input: {
  site: string
  windowCompare?: '28v28' | 'YoY'
  minDropPct?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}) {
  const minDropPct = input.minDropPct ?? 20
  const currentRange = defaultDateRange(28)
  const previousEnd = new Date(`${currentRange.startDate}T00:00:00.000Z`)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousStart.getUTCDate() - 27)

  const [current, previous] = await Promise.all([
    querySearchAnalytics(
      input.site,
      {
        ...currentRange,
        dimensions: ['query'],
        type: 'web',
        dataState: 'final',
      },
      { refresh: input.refresh },
    ),
    querySearchAnalytics(
      input.site,
      {
        startDate: previousStart.toISOString().slice(0, 10),
        endDate: previousEnd.toISOString().slice(0, 10),
        dimensions: ['query'],
        type: 'web',
        dataState: 'final',
      },
      { refresh: input.refresh },
    ),
  ])

  const previousByQuery = new Map(
    previous.rows.map((row) => [row.keys[0] ?? '', row]),
  )
  const items: DecayItem[] = []

  for (const row of current.rows) {
    const query = row.keys[0] ?? ''
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

    const prev = previousByQuery.get(query)
    if (!prev || prev.clicks === 0) {
      continue
    }

    const dropPct = ((prev.clicks - row.clicks) / prev.clicks) * 100
    if (dropPct < minDropPct) {
      continue
    }

    const diagnosis =
      row.position > prev.position + 1
        ? 'lost_position'
        : row.impressions >= prev.impressions * 0.9 && row.ctr < prev.ctr * 0.8
          ? 'lost_ctr'
          : 'lost_impressions'

    const reason =
      diagnosis === 'lost_position'
        ? 'Ranking position fell between the two windows.'
        : diagnosis === 'lost_ctr'
          ? 'Position stayed roughly stable but click-through rate dropped.'
          : 'Demand fell because impressions declined.'

    items.push({
      query,
      current: {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
      previous: {
        clicks: prev.clicks,
        impressions: prev.impressions,
        ctr: prev.ctr,
        position: prev.position,
      },
      diagnosis,
      recommendation: {
        principle:
          diagnosis === 'lost_position'
            ? 'C.9'
            : diagnosis === 'lost_ctr'
              ? 'C.3'
              : 'C.10',
        evidenceRef: `${query}: ${reason}`,
        action:
          diagnosis === 'lost_position'
            ? 'Refresh the page sections that used to support the query and tighten internal links to the page.'
            : diagnosis === 'lost_ctr'
              ? 'Review title and meta intent fit against the current SERP layout before changing content depth.'
              : 'Validate whether the query is shrinking or being displaced by SERP features before rewriting the page.',
        effort: 'M',
        confidence: 'medium',
      },
    })
  }

  return { site: input.site, generatedAt: new Date().toISOString(), items }
}
