import { randomUUID } from 'node:crypto'
import { SeoError } from '../../errors.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { finalGscDateRange } from '../../gsc/dates.js'
import type { DomainOverviewProvider } from '../../providers/domain-contracts.js'
import type {
  DomainOverviewReport,
  DomainOverviewReportInput,
  SearchConsoleAggregateEvidence,
} from '../domain-research-contract.js'
import {
  type DomainResearchDependencies,
  days,
  normalizeDomain,
  providerFailure,
  reportStatus,
  researchProvider,
  siteMatchesDomain,
  validatedMarket,
  validatedProvider,
  value,
} from './shared.js'

const GSC_AGGREGATE_ROWS = 1

async function firstPartyEvidence(input: {
  site?: string
  domain: string
  days: number
  refresh?: boolean
  now: Date
  dependencies: DomainResearchDependencies
}): Promise<SearchConsoleAggregateEvidence> {
  if (!input.site) {
    return {
      requested: false,
      status: 'not-requested',
      provider: 'google-search-console',
      site: null,
      range: null,
      clicks: null,
      impressions: null,
      averagePosition: null,
      rowsFetched: 0,
      calls: 0,
      maxRows: GSC_AGGREGATE_ROWS,
      possiblyTruncated: false,
    }
  }
  if (!siteMatchesDomain(input.site, input.domain)) {
    throw new SeoError(
      'INVALID_INPUT',
      'The Search Console property must match the domain being researched.',
    )
  }
  const range = finalGscDateRange(input.days, input.now)
  const response = await (
    input.dependencies.searchAnalytics ?? querySearchAnalytics
  )(
    input.site,
    {
      ...range,
      dimensions: [],
      type: 'web',
      dataState: 'final',
      maxRows: GSC_AGGREGATE_ROWS,
    },
    { refresh: input.refresh },
  )
  const row = response.rows[0]
  return {
    requested: true,
    status: row ? 'complete' : 'empty',
    provider: 'google-search-console',
    site: input.site,
    range,
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    averagePosition: row?.position ?? null,
    rowsFetched: response.rowsFetched,
    calls: response.calls,
    maxRows: GSC_AGGREGATE_ROWS,
    possiblyTruncated: response.rowsFetched > GSC_AGGREGATE_ROWS,
  }
}

export async function domainOverviewReport(
  input: DomainOverviewReportInput,
  dependencies: DomainResearchDependencies = {},
): Promise<DomainOverviewReport> {
  const now = (dependencies.now ?? (() => new Date()))()
  const market = validatedMarket(input.market)
  const providerId = validatedProvider(input.provider)
  const domain = normalizeDomain(input.domain)
  const rangeDays = days(input.days)
  if (input.site && !siteMatchesDomain(input.site, domain)) {
    throw new SeoError(
      'INVALID_INPUT',
      'The Search Console property must match the domain being researched.',
    )
  }
  const provider = await researchProvider<DomainOverviewProvider>({
    capability: 'domain-overview',
    market,
    provider: providerId,
    dependencies,
    method: 'domainOverview',
  })
  let evidence: Awaited<ReturnType<DomainOverviewProvider['domainOverview']>>
  try {
    evidence = await provider.domainOverview({
      domain,
      market,
      refresh: input.refresh,
      context: {
        projectId: input.projectId,
        reportId: 'domain-overview',
        reportRunId: randomUUID(),
      },
    })
  } catch (error) {
    return providerFailure(error)
  }
  const firstParty = await firstPartyEvidence({
    site: input.site,
    domain,
    days: rangeDays,
    refresh: input.refresh,
    now,
    dependencies,
  })
  const estimatedMonthlyTraffic = value(
    evidence.data.organic.estimatedMonthlyTraffic,
  )
  const rankedKeywords = value(evidence.data.organic.rankedKeywords)
  const rankings = value(evidence.data.organic.rankings)
  const searchConsoleClicks = firstParty.clicks
  const findings: DomainOverviewReport['findings'] = []
  if (firstParty.requested) {
    findings.push({
      code: 'provider-and-first-party-context',
      evidenceRefs: ['evidence.data.organic', 'firstParty'],
      detail:
        'The report has an independent market estimate beside owner-verified search performance for the matching site.',
      action:
        'Use Search Console for actual site performance. Use the provider footprint to frame competitor research and terms omitted from retained first-party rows.',
    })
  }
  if (
    firstParty.requested &&
    searchConsoleClicks === 0 &&
    rankedKeywords !== null &&
    rankedKeywords > 0
  ) {
    findings.push({
      code: 'ranking-footprint-without-clicks',
      evidenceRefs: [
        'evidence.data.organic.rankedKeywords',
        'firstParty.clicks',
      ],
      detail:
        'The provider reports ranked keywords while the selected Search Console range contains no clicks.',
      action:
        'Inspect impressions, current result snapshots, query coverage, and the date range. Do not treat the difference as proof that either source is wrong.',
    })
  }
  const providerStatus = reportStatus(evidence.coverage)
  const dataStatus =
    firstParty.status === 'partial' || firstParty.possiblyTruncated
      ? 'partial'
      : providerStatus

  return {
    schemaVersion: 1,
    methodology: 'domain_overview_v1',
    generatedAt: now.toISOString(),
    dataStatus,
    market,
    summary: {
      domain,
      estimatedMonthlyTraffic,
      rankedKeywords,
      top10Rankings: rankings?.top10 ?? null,
      searchConsoleClicks,
      verdict: firstParty.requested
        ? `Independent estimates and ${rangeDays} days of matching Search Console evidence are shown side by side.`
        : 'The provider footprint is an independent market estimate; no Search Console comparison was requested.',
    },
    evidence,
    firstParty,
    findings,
    caveats: [
      'Provider traffic, keyword counts, ranking movements, and traffic cost are estimates from a country-level database. They are not measured visits or Search Console totals.',
      'Search Console clicks and impressions use the selected final-data date range. Provider estimates use their own update schedule, so the values should not be subtracted or turned into a percentage gap.',
      'An empty or partial provider result cannot support a zero-footprint or all-clear claim.',
    ],
    nextSteps: [
      'Run ranking-pages to see which URLs account for the estimated footprint and whether repeated page patterns are present.',
      'Run ranked-keywords for the bounded keyword and ranking-page rows behind the aggregate estimate.',
      input.site
        ? 'Use Search Console opportunity reports for the site before changing priorities based on third-party estimates.'
        : 'Pass the matching Search Console property only when comparing the site you own. Competitor domains should stay provider-only.',
    ],
  }
}
