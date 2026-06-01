import { querySearchAnalytics } from '../gsc/client.js'
import type { QueryCluster } from '../types.js'
import { defaultDateRange, jaccard, normalizeText, tokenize } from './shared.js'

function classifyIntent(query: string, brand?: string): QueryCluster['intent'] {
  const normalized = normalizeText(query)
  if (brand && normalized.includes(normalizeText(brand))) {
    return 'navigational'
  }
  if (/(buy|price|near me)/i.test(normalized)) {
    return 'transactional'
  }
  if (/(vs|review|best|top|compare)/i.test(normalized)) {
    return 'commercial'
  }
  if (/(how|what|why|guide)/i.test(normalized)) {
    return 'informational'
  }
  return 'mixed'
}

export async function queryClusterReport(input: {
  site: string
  scope?: string
  brand?: string
  refresh?: boolean
}) {
  const range = defaultDateRange(28)
  const filters = input.scope
    ? [
        {
          groupType: 'and' as const,
          filters: [
            {
              dimension: 'page',
              operator: 'contains' as const,
              expression: input.scope,
            },
          ],
        },
      ]
    : undefined
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      dimensionFilterGroups: filters,
    },
    { refresh: input.refresh },
  )

  const remaining = rows.map((row) => ({
    query: row.keys[0] ?? '',
    impressions: row.impressions,
    clicks: row.clicks,
    position: row.position,
    tokens: tokenize(row.keys[0] ?? ''),
  }))
  const clusters: QueryCluster[] = []

  while (remaining.length) {
    const seed = remaining.shift()
    if (!seed) break
    const clusterRows = [seed]

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const candidate = remaining[index]
      if (!candidate) continue
      if (jaccard(seed.tokens, candidate.tokens) >= 0.5) {
        clusterRows.push(candidate)
        remaining.splice(index, 1)
      }
    }

    const tokenCounts = new Map<string, number>()
    for (const row of clusterRows) {
      for (const token of row.tokens) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1)
      }
    }

    const label =
      [...tokenCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      clusterRows[0]?.query ??
      ''
    const intents = new Set(
      clusterRows.map((row) => classifyIntent(row.query, input.brand)),
    )
    const [intent] = intents

    clusters.push({
      label,
      intent: intents.size === 1 && intent ? intent : 'mixed',
      queries: clusterRows.map((row) => ({
        query: row.query,
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.position,
      })),
    })
  }

  return {
    site: input.site,
    scope: input.scope,
    generatedAt: new Date().toISOString(),
    clusters: clusters.sort((a, b) => b.queries.length - a.queries.length),
  }
}
