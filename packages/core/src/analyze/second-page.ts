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

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

function secondPageVerdict(input: {
  opportunities: number
  impressions: number
  contentIssues: number
  top?: SecondPageItem
}): string {
  if (!input.opportunities) {
    return 'No position 11-20 opportunities matched this report threshold.'
  }
  if (input.contentIssues > 0) {
    const verb = input.contentIssues === 1 ? 'has' : 'have'
    return `${input.opportunities} second-page ${plural(input.opportunities, 'opportunity', 'opportunities')} found. ${input.contentIssues} ${verb} verified coverage or wording issues, so start with relevance before link changes.`
  }
  return `${input.opportunities} second-page ${plural(input.opportunities, 'opportunity', 'opportunities')} found across about ${input.impressions.toFixed(0)} impressions. Start with "${input.top?.primaryQuery ?? 'the highest-impression query'}" and improve the ranking URL before creating new pages.`
}

function secondPageRecommendations(items: SecondPageItem[]): string[] {
  const top = items[0]
  if (!top) {
    return [
      'No second-page action is recommended from this report. Lower --min-impressions or widen --days if you want to inspect smaller opportunities.',
    ]
  }
  const verifiedGap = items.find(
    (item) =>
      item.contentVerification?.status === 'verified' &&
      item.contentVerification.classification !== 'covered',
  )
  const rankingAction =
    top.recommendations[0]?.action ??
    `Improve ${top.url} for "${top.primaryQuery}" before creating a new page.`

  return [
    verifiedGap
      ? `Fix verified coverage or wording issues first. Start with "${verifiedGap.primaryQuery}" on ${verifiedGap.url}; the page is ranking but does not make the query angle clear enough.`
      : rankingAction,
    'Add internal links from closely related pages after the target page clearly answers the query.',
    'Do not create a duplicate page unless the query has a clearly different intent from the current ranking URL.',
  ]
}

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
        httpStatus: fetched.status,
        warnings: fetched.warnings,
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
    if (!item.recommendations.length) {
      item.recommendations.push({
        principle: 'C.6',
        evidenceRef: `The page already covers "${item.primaryQuery}" in verified content checks but averages position ${item.position.toFixed(1)}.`,
        action: `The page already appears relevant for "${item.primaryQuery}". Add internal links from closely related pages, improve the intro/example section around the query, and avoid creating a duplicate URL for the same intent.`,
        effort: 'S',
        confidence: 'medium',
      })
    }
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

  const templateCount = new Set(items.map((item) => item.template.id)).size
  const totalImpressions = items.reduce(
    (sum, item) => sum + item.impressions,
    0,
  )
  const contentIssues = items.filter(
    (item) =>
      item.contentVerification?.status === 'verified' &&
      item.contentVerification.classification !== 'covered',
  ).length
  const verification = input.verifyContent
    ? {
        requested: true as const,
        limit: input.verifyLimit ?? 5,
        verified: items.filter((item) => item.contentVerification).length,
        failed: items.filter(
          (item) => item.contentVerification?.status === 'failed',
        ).length,
      }
    : { requested: false as const, verified: 0 as const, failed: 0 as const }

  return {
    site: input.site,
    range,
    dateRange: rangeDates,
    generatedAt: new Date().toISOString(),
    summary: {
      opportunities: items.length,
      templates: templateCount,
      impressions: totalImpressions,
      contentIssues,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: secondPageVerdict({
        opportunities: items.length,
        impressions: totalImpressions,
        contentIssues,
        top: items[0],
      }),
    },
    verification,
    items,
    caveats: [
      `Date window: ${rangeDates.startDate} to ${rangeDates.endDate} (${range} ${plural(range, 'day')}), using final GSC data where available.`,
      `Brand queries: ${input.includeBrand ? 'included' : 'excluded'}.`,
      `Minimum impressions: ${minImpressions}. Limit: ${input.limit ?? 10} page groups.`,
      input.verifyContent
        ? `Content verification: requested for up to ${input.verifyLimit ?? 5} ${plural(input.verifyLimit ?? 5, 'result')}.`
        : 'Content verification: not run. Use --verify-content for stronger on-page recommendations.',
      warnings.length
        ? `${warnings.length} provider ${plural(warnings.length, 'warning')} ${warnings.length === 1 ? 'was' : 'were'} recorded, so related-question evidence may be incomplete.`
        : '',
    ].filter((item) => item.length > 0),
    recommendations: secondPageRecommendations(items),
    ledgerSummary: ledger.summary(),
    warnings,
  }
}
