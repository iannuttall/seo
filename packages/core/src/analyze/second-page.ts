import { extractPage } from '../extract/page-extractor.js'
import { type FetchRateControls, fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { getKeywordProvider } from '../providers/router.js'
import { SessionLedger } from '../storage/ledger.js'
import type { SecondPageItem, SecondPageReport } from '../types.js'
import {
  contentCoverageRecommendation,
  queryContentCoverageFromPage,
} from './content-coverage.js'
import { detectPageTemplate } from './page-patterns.js'
import {
  groupCandidatesByPage,
  secondPageCandidates,
} from './second-page/candidates.js'
import { scoreCoverage } from './second-page/coverage.js'
import { buildSecondPageRecommendations } from './second-page/recommendations.js'
import { defaultDateRange } from './shared.js'

export async function secondPage(input: {
  site: string
  range?: number
  minImpressions?: number
  limit?: number
  js?: boolean | 'auto'
  refresh?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  rate?: FetchRateControls
  brandTerms?: string[]
  includeBrand?: boolean
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

  const secondPageRows = secondPageCandidates({
    rows,
    site: input.site,
    minImpressions,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const grouped = groupCandidatesByPage(secondPageRows)

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
      rate: input.rate,
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
      template: detectPageTemplate(url),
      position: primary.position,
      impressions: primary.impressions,
      ctr: primary.ctr,
      coverage,
      fetchDiagnostics: fetched.diagnostics,
      recommendations: [],
    }

    if (input.verifyContent && items.length < (input.verifyLimit ?? 5)) {
      item.contentVerification = queryContentCoverageFromPage({
        query: item.primaryQuery,
        url,
        page: extracted,
        fetchDiagnostics: fetched.diagnostics,
      })
    }

    const hasVerifiedCoverage = item.contentVerification?.status === 'verified'
    item.recommendations = buildSecondPageRecommendations(
      item.primaryQuery,
      item,
      extracted,
      relatedQuestions,
    ).filter(
      (recommendation) =>
        !(hasVerifiedCoverage && recommendation.principle === 'C.2'),
    )
    if (
      item.contentVerification?.status === 'verified' &&
      item.contentVerification.classification !== 'covered'
    ) {
      item.recommendations.unshift({
        principle: 'C.3',
        evidenceRef: item.contentVerification.summary,
        action: contentCoverageRecommendation(item.contentVerification),
        effort: 'S',
        confidence: 'medium',
      })
    }
    items.push(item)
  }

  return {
    site: input.site,
    range,
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
    ledgerSummary: ledger.summary(),
    warnings,
  }
}
