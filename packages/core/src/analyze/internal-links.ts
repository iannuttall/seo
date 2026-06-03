import { shouldExcludeBrandQuery } from '../brand.js'
import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { isLowActionabilityQuery } from './query-quality.js'
import { defaultDateRange, jaccard, tokenize } from './shared.js'

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

function internalLinksVerdict(input: {
  opportunities: number
  targetQueries: number
}): string {
  if (input.opportunities > 0) {
    const verb = input.opportunities === 1 ? 'ranks' : 'rank'
    return `${input.opportunities} source ${plural(input.opportunities, 'page')} ${verb} for related demand and do not link to the target.`
  }
  if (input.targetQueries === 0) {
    return 'No non-brand target queries were found for this URL in the selected GSC window.'
  }
  return 'No source pages with related query demand were found missing a link to the target.'
}

export async function internalLinksReport(input: {
  site: string
  targetUrl: string
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
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
    .filter(
      (row) =>
        (row.keys[1] ?? '') === input.targetUrl &&
        !isLowActionabilityQuery(row.keys[0] ?? '') &&
        !shouldExcludeBrandQuery({
          query: row.keys[0] ?? '',
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        }),
    )
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
        !isLowActionabilityQuery(row.query) &&
        !shouldExcludeBrandQuery({
          query: row.query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        }) &&
        (row.overlap >= 0.6 ||
          targetQueries.some((target) => target.keys[0] === row.query)),
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
  const warnings: string[] = []
  let checkedSources = 0
  for (const [url, data] of [...byUrl.entries()]
    .sort((a, b) => b[1].impressions - a[1].impressions)
    .slice(0, input.limit ?? 20)) {
    checkedSources += 1
    const fetched = await fetchPage(url, {
      js: 'auto',
      refresh: input.refresh,
    }).catch((error) => {
      warnings.push(
        `${url}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return undefined
    })
    if (!fetched) continue
    const extracted = await extractPage(fetched).catch((error) => {
      warnings.push(
        `${url}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return undefined
    })
    if (!extracted) continue
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
        action: `This page ranks for similar queries but does not link to the target URL. Add one natural in-content link to ${input.targetUrl} using wording from the shared queries: ${data.queries.slice(0, 3).join('; ')}.`,
        effort: 'S',
        confidence: 'medium',
      },
    })
  }

  return {
    site: input.site,
    targetUrl: input.targetUrl,
    generatedAt: new Date().toISOString(),
    summary: {
      targetQueries: targetQueries.length,
      candidateSources: byUrl.size,
      checkedSources,
      opportunities: items.length,
      skippedSources: warnings.length,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: internalLinksVerdict({
        opportunities: items.length,
        targetQueries: targetQueries.length,
      }),
    },
    items,
    warnings,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate} (28 days), using final GSC data where available.`,
      `Brand queries: ${input.includeBrand ? 'included' : 'excluded'}.`,
      'Only source pages with overlapping GSC query demand were checked.',
      warnings.length
        ? `${warnings.length} source page(s) could not be fetched or extracted, so some opportunities may be missing.`
        : '',
    ].filter((item) => item.length > 0),
    recommendations: items.length
      ? [
          `Add links from the highest-impression source pages first. Use natural anchors from the shared query list, not forced exact-match anchors.`,
        ]
      : [
          'No internal link action is needed from this report. Try a broader target, more days, or a different URL if this page should have more internal support.',
        ],
  }
}
