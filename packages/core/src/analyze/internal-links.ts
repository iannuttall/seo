import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { defaultDateRange, jaccard, tokenize } from './shared.js'

export async function internalLinksReport(input: {
  site: string
  targetUrl: string
  limit?: number
  refresh?: boolean
}) {
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

  const targetQueries = rows
    .filter((row) => (row.keys[1] ?? '') === input.targetUrl)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20)

  const targetTokens = new Set(
    targetQueries.flatMap((row) => tokenize(row.keys[0] ?? '')),
  )
  const candidates = rows
    .filter((row) => (row.keys[1] ?? '') !== input.targetUrl)
    .map((row) => ({
      url: row.keys[1] ?? '',
      query: row.keys[0] ?? '',
      impressions: row.impressions,
      overlap: jaccard([...targetTokens], tokenize(row.keys[0] ?? '')),
    }))
    .filter(
      (row) =>
        row.overlap >= 0.6 ||
        targetQueries.some((target) => target.keys[0] === row.query),
    )

  const byUrl = new Map<
    string,
    { impressions: number; overlap: number; queries: string[] }
  >()
  for (const candidate of candidates) {
    const current = byUrl.get(candidate.url) ?? {
      impressions: 0,
      overlap: 0,
      queries: [],
    }
    current.impressions += candidate.impressions
    current.overlap = Math.max(current.overlap, candidate.overlap)
    current.queries.push(candidate.query)
    byUrl.set(candidate.url, current)
  }

  const items = []
  for (const [url, data] of [...byUrl.entries()]
    .sort((a, b) => b[1].impressions - a[1].impressions)
    .slice(0, input.limit ?? 20)) {
    const fetched = await fetchPage(url, { js: 'auto', refresh: input.refresh })
    const extracted = await extractPage(fetched)
    const alreadyLinks = extracted.links.some(
      (link) => link.href === input.targetUrl,
    )
    if (alreadyLinks) {
      continue
    }

    items.push({
      sourceUrl: url,
      sourceImpressions: data.impressions,
      sharedQueries: data.queries.slice(0, 5),
      recommendation: {
        principle: 'C.6',
        evidenceRef: `${url} overlaps with the target URL on ${data.queries.length} queries and does not currently link to it.`,
        action:
          'Add one contextual internal link from this page to the target URL using the shared query language already present on the page.',
        effort: 'S',
        confidence: 'medium',
      },
    })
  }

  return {
    site: input.site,
    targetUrl: input.targetUrl,
    generatedAt: new Date().toISOString(),
    items,
  }
}
