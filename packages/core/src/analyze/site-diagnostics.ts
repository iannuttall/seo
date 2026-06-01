import { querySearchAnalytics } from '../gsc/client.js'
import type { Recommendation } from '../types.js'
import { CTR_BASELINE, defaultDateRange } from './shared.js'

interface CannibalItem {
  query: string
  pages: Array<{ url: string; impressions: number; position: number }>
  hhi: number
  recommendation: Recommendation
}

interface DecayItem {
  query: string
  current: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  previous: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  diagnosis: 'lost_position' | 'lost_ctr' | 'lost_impressions'
  recommendation: Recommendation
}

interface QuickWinItem {
  query: string
  url: string
  position: number
  impressions: number
  ctr: number
  expectedCtrAt3: number
  estimatedClickLift: number
  recommendation: Recommendation
}

export async function cannibalReport(input: {
  site: string
  minImpressions?: number
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

export async function decayingReport(input: {
  site: string
  windowCompare?: '28v28' | 'YoY'
  minDropPct?: number
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

export async function quickWinsReport(input: {
  site: string
  minImpressions?: number
  refresh?: boolean
}) {
  const minImpressions = input.minImpressions ?? 200
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

  const items: QuickWinItem[] = rows
    .filter(
      (row) =>
        row.position >= 4 &&
        row.position <= 10 &&
        row.impressions >= minImpressions,
    )
    .map((row) => {
      const rounded = Math.max(1, Math.min(10, Math.round(row.position)))
      const expectedCtrAt3 = CTR_BASELINE[3] ?? 0.1
      const estimatedClickLift = Math.max(
        0,
        (expectedCtrAt3 - row.ctr) * row.impressions,
      )
      return {
        query: row.keys[0] ?? '',
        url: row.keys[1] ?? '',
        position: row.position,
        impressions: row.impressions,
        ctr: row.ctr,
        expectedCtrAt3,
        estimatedClickLift,
        recommendation: {
          principle: 'C.3',
          evidenceRef: `Query "${row.keys[0]}" sits at position ${rounded} with ${row.impressions} impressions and CTR ${row.ctr.toFixed(3)}.`,
          action:
            'Tighten title relevance, meta intent, and visible SERP framing before deeper content changes.',
          effort: 'S' as const,
          confidence: 'medium' as const,
          impactEstimate: `~+${Math.round(estimatedClickLift)} clicks if it reaches position 3.`,
        },
      }
    })
    .sort((a, b) => b.estimatedClickLift - a.estimatedClickLift)

  return { site: input.site, generatedAt: new Date().toISOString(), items }
}
