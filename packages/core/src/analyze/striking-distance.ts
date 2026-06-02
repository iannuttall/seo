import { shouldExcludeBrandQuery } from '../brand.js'
import type { FetchRateControls } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import {
  contentCoverageRecommendation,
  type QueryContentCoverage,
  verifyQueryContent,
} from './content-coverage.js'
import type { PageTemplate } from './page-patterns.js'
import { detectPageTemplate, summarizeTemplates } from './page-patterns.js'
import { isLowActionabilityQuery } from './query-quality.js'
import { defaultDateRange } from './shared.js'

export type StrikingDistanceItem = {
  query: string
  url: string
  template: PageTemplate
  clicks: number
  impressions: number
  ctr: number
  position: number
  opportunityScore: number
  contentVerification?: QueryContentCoverage
  action: string
}

export async function strikingDistance(input: {
  site: string
  days?: number
  minImpressions?: number
  maxCtr?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  rate?: FetchRateControls
  refresh?: boolean
}): Promise<{
  site: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  verification:
    | { requested: false; verified: 0; failed: 0 }
    | { requested: true; limit: number; verified: number; failed: number }
  items: StrikingDistanceItem[]
  templates: ReturnType<typeof summarizeTemplates>
}> {
  const range = defaultDateRange(input.days ?? 28)
  const minImpressions = input.minImpressions ?? 100
  const maxCtr = input.maxCtr ?? 0.03
  const result = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )

  const items: StrikingDistanceItem[] = result.rows
    .filter((row) => {
      const query = row.keys[0] ?? ''
      return (
        row.position >= 11 &&
        row.position <= 20 &&
        row.impressions >= minImpressions &&
        row.ctr <= maxCtr &&
        !isLowActionabilityQuery(query) &&
        !shouldExcludeBrandQuery({
          query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        })
      )
    })
    .map((row) => {
      const score =
        row.impressions * (21 - row.position) * (maxCtr - row.ctr + 0.005)
      return {
        query: row.keys[0] ?? '',
        url: row.keys[1] ?? '',
        template: detectPageTemplate(row.keys[1] ?? ''),
        clicks: Number(row.clicks.toFixed(3)),
        impressions: Number(row.impressions.toFixed(3)),
        ctr: Number(row.ctr.toFixed(4)),
        position: Number(row.position.toFixed(2)),
        opportunityScore: Number(score.toFixed(2)),
        action:
          'Improve query-page alignment and SERP framing before expanding scope.',
      }
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, input.limit ?? 25)

  if (input.verifyContent) {
    const verifyLimit = input.verifyLimit ?? 5
    for (const item of items.slice(0, verifyLimit)) {
      const contentVerification = await verifyQueryContent({
        query: item.query,
        url: item.url,
        js: input.js,
        refresh: input.refresh,
        rate: input.rate,
      })
      item.contentVerification = contentVerification
      if (contentVerification.status === 'verified') {
        item.action = contentCoverageRecommendation(contentVerification)
      }
    }
  }

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    range,
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
    templates: summarizeTemplates(items),
  }
}
