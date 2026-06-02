import { shouldExcludeBrandQuery } from '../../brand.js'
import type { FetchRateControls } from '../../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import {
  type QueryContentCoverage,
  verifyQueryContent,
} from '../content-coverage.js'
import { CTR_BASELINE, defaultDateRange } from '../shared.js'
import type { QuickWinItem } from './types.js'

export async function quickWinsReport(input: {
  site: string
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  rate?: FetchRateControls
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
    .filter((row) => {
      const query = row.keys[0] ?? ''
      return (
        row.position >= 4 &&
        row.position <= 10 &&
        row.impressions >= minImpressions &&
        !shouldExcludeBrandQuery({
          query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        })
      )
    })
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

  if (input.verifyContent) {
    const verifyLimit = input.verifyLimit ?? 5
    const coverageByKey = new Map<string, QueryContentCoverage>()
    for (const item of items.slice(0, verifyLimit)) {
      const key = `${item.query}\n${item.url}`
      const existing = coverageByKey.get(key)
      const contentVerification =
        existing ??
        (await verifyQueryContent({
          query: item.query,
          url: item.url,
          js: input.js,
          refresh: input.refresh,
          rate: input.rate,
        }))
      coverageByKey.set(key, contentVerification)
      item.contentVerification = contentVerification
      if (
        contentVerification.status === 'verified' &&
        contentVerification.contentGapScore >= 5
      ) {
        item.recommendation = {
          ...item.recommendation,
          action:
            'Add clearer query coverage to the title, meta description, or main content before broader rewrites.',
          evidenceRef: `${item.recommendation.evidenceRef} ${contentVerification.summary}`,
        }
      }
    }
  }

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    verification: input.verifyContent
      ? {
          requested: true,
          limit: input.verifyLimit ?? 5,
          verified: items.filter((item) => item.contentVerification).length,
          failed: items.filter(
            (item) => item.contentVerification?.status === 'failed',
          ).length,
        }
      : { requested: false, verified: 0, failed: 0 },
    items,
  }
}
