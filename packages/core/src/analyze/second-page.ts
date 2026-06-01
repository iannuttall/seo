import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { getKeywordProvider } from '../providers/router.js'
import { SessionLedger } from '../storage/ledger.js'
import type {
  Recommendation,
  SecondPageItem,
  SecondPageReport,
} from '../types.js'
import {
  defaultDateRange,
  looksLikeBrand,
  normalizeText,
  tokenize,
} from './shared.js'

function scoreCoverage(
  query: string,
  page: Awaited<ReturnType<typeof extractPage>>,
) {
  const normalizedQuery = normalizeText(query)
  const first100 = page.contentText.split(/\s+/).slice(0, 100).join(' ')
  const h1 = page.headings.find((heading) => heading.level === 1)?.text ?? ''

  return {
    inTitleExact: normalizeText(page.title ?? '').includes(normalizedQuery),
    inMeta: normalizeText(page.metaDescription ?? '').includes(normalizedQuery),
    inH1: normalizeText(h1).includes(normalizedQuery),
    inFirst100Words: normalizeText(first100).includes(normalizedQuery),
    inSlug: normalizeText(new URL(page.finalUrl).pathname).includes(
      normalizedQuery.replace(/\s+/g, '-'),
    ),
    bodyCount:
      normalizeText(page.contentText).split(normalizedQuery).length - 1,
  }
}

function estimateExpectedCtr(position: number): number {
  if (position <= 3) {
    return 0.1
  }
  if (position <= 10) {
    return 0.03
  }
  if (position <= 20) {
    return 0.015
  }
  return 0.005
}

function buildSecondPageRecommendations(
  query: string,
  item: SecondPageItem,
  page: Awaited<ReturnType<typeof extractPage>>,
  relatedQuestions: string[],
): Recommendation[] {
  const recommendations: Recommendation[] = []
  if (!item.coverage.inTitleExact || !item.coverage.inH1) {
    recommendations.push({
      principle: 'C.2',
      evidenceRef: `Query "${query}" is missing from ${!item.coverage.inTitleExact ? 'title' : 'H1'}.`,
      action:
        'Align the page label stack so the primary query appears in the title and H1 naturally.',
      effort: 'S',
      confidence: 'high',
      impactEstimate: `CTR gap to top 10 is ${Math.max(0, estimateExpectedCtr(10) - item.ctr).toFixed(2)}`,
    })
  }

  if (page.wordCount < 800 && relatedQuestions.length > 0) {
    recommendations.push({
      principle: 'C.5',
      evidenceRef: `Page has ${page.wordCount} extracted words and misses related questions: ${relatedQuestions.slice(0, 3).join(', ')}.`,
      action:
        'Add missing subtopic sections that answer the related questions already attached to this query cluster.',
      effort: 'M',
      confidence: 'medium',
      impactEstimate: `If the page moves into the top 10, expected CTR improves from ${item.ctr.toFixed(3)}.`,
    })
  }

  return recommendations
}

export async function secondPage(input: {
  site: string
  range?: number
  minImpressions?: number
  limit?: number
  js?: boolean | 'auto'
  refresh?: boolean
  brandTerms?: string[]
  prefer?: 'cheap' | 'authoritative'
}): Promise<SecondPageReport> {
  const range = input.range ?? 28
  const minImpressions = input.minImpressions ?? 50
  const rangeDates = defaultDateRange(range)
  const ledger = new SessionLedger()
  const { rows, calls, rowsFetched } = await querySearchAnalytics(
    input.site,
    {
      ...rangeDates,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )
  ledger.addGsc(calls, rowsFetched)

  const secondPageRows = rows.filter((row) => {
    const query = row.keys[0] ?? ''
    return (
      row.position >= 11 &&
      row.position <= 20 &&
      row.impressions >= minImpressions &&
      tokenize(query).length <= 8 &&
      !looksLikeBrand(query, input.brandTerms)
    )
  })

  const grouped = new Map<string, typeof secondPageRows>()
  for (const row of secondPageRows) {
    const page = row.keys[1] ?? ''
    const existing = grouped.get(page) ?? []
    existing.push(row)
    grouped.set(page, existing)
  }

  const provider = getKeywordProvider(input.prefer)
  const items: SecondPageItem[] = []
  const warnings: string[] = []

  for (const [url, pageRows] of [...grouped.entries()]
    .sort((a, b) => (b[1][0]?.impressions ?? 0) - (a[1][0]?.impressions ?? 0))
    .slice(0, input.limit ?? 10)) {
    const sortedRows = [...pageRows].sort(
      (a, b) => b.impressions - a.impressions,
    )
    const primary = sortedRows[0]
    if (!primary) {
      continue
    }

    const fetched = await fetchPage(url, {
      js: input.js ?? 'auto',
      refresh: input.refresh,
    })
    const extracted = await extractPage(fetched)
    const coverage = scoreCoverage(primary.keys[0] ?? '', extracted)
    const relatedQuestions: string[] = []

    if (provider?.questions) {
      try {
        const result = await provider.questions(primary.keys[0] ?? '', {
          refresh: input.refresh,
        })
        ledger.addUsage(result.usage)
        relatedQuestions.push(...result.data.map((row) => row.phrase))
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error))
      }
    }

    const item: SecondPageItem = {
      url,
      primaryQuery: primary.keys[0] ?? '',
      position: primary.position,
      impressions: primary.impressions,
      ctr: primary.ctr,
      coverage,
      recommendations: [],
    }

    item.recommendations = buildSecondPageRecommendations(
      item.primaryQuery,
      item,
      extracted,
      relatedQuestions,
    )
    items.push(item)
  }

  return {
    site: input.site,
    range,
    generatedAt: new Date().toISOString(),
    items,
    ledgerSummary: ledger.summary(),
    warnings,
  }
}
