import { shouldExcludeBrandQuery } from '../../brand.js'
import type { FetchRateControls } from '../../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import {
  contentCoverageRecommendation,
  type QueryContentCoverage,
  verifyQueryContent,
} from '../content-coverage.js'
import { detectPageTemplate, summarizeTemplates } from '../page-patterns.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import { CTR_BASELINE, defaultDateRange } from '../shared.js'
import { groupQuickWins } from './quick-win-groups.js'
import type { QuickWinItem } from './types.js'

function verifiedQuickWinAction(coverage: QueryContentCoverage): {
  action: string
  confidence: 'high' | 'medium' | 'low'
} {
  const action = contentCoverageRecommendation(coverage)
  if (coverage.status === 'failed') return { action, confidence: 'low' }
  if (coverage.classification === 'content-gap') {
    return { action, confidence: 'high' }
  }
  if (coverage.classification === 'technical-check') {
    return { action, confidence: 'medium' }
  }
  return { action, confidence: 'medium' }
}

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
      const rounded = Math.max(1, Math.min(10, Math.round(row.position)))
      const expectedCtrAt3 = CTR_BASELINE[3] ?? 0.1
      const estimatedClickLift = Math.max(
        0,
        (expectedCtrAt3 - row.ctr) * row.impressions,
      )
      return {
        query: row.keys[0] ?? '',
        url: row.keys[1] ?? '',
        template: detectPageTemplate(row.keys[1] ?? ''),
        position: row.position,
        impressions: row.impressions,
        ctr: row.ctr,
        expectedCtrAt3,
        estimatedClickLift,
        recommendation: {
          principle: 'C.3',
          evidenceRef: `Query "${row.keys[0]}" sits at position ${rounded} with ${row.impressions} impressions and CTR ${row.ctr.toFixed(3)}.`,
          action: `This page already ranks well for "${row.keys[0]}". Improve the title, meta description, and visible heading so searchers can immediately see that the page answers this query before adding more body copy.`,
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
      const verified = verifiedQuickWinAction(contentVerification)
      item.recommendation = {
        ...item.recommendation,
        action: verified.action,
        confidence: verified.confidence,
        evidenceRef: `${item.recommendation.evidenceRef} ${contentVerification.summary}`,
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
    templates: summarizeTemplates(items),
    groups: groupQuickWins(items),
    items,
  }
}
