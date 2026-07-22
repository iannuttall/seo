import { randomUUID } from 'node:crypto'
import { SeoError } from '../../errors.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { finalGscDateRange } from '../../gsc/dates.js'
import type { RankingPagesProvider } from '../../providers/domain-contracts.js'
import type {
  RankingPagesReport,
  RankingPagesReportInput,
} from '../domain-research-contract.js'
import { clusterPseoTemplates } from '../pseo/templates.js'
import {
  compareText,
  type DomainResearchDependencies,
  days,
  limit,
  normalizeDomain,
  offset,
  providerFailure,
  reportStatus,
  researchFilesDependencies,
  researchProvider,
  siteMatchesDomain,
  validatedMarket,
} from './shared.js'

const MAX_GSC_PAGE_ROWS = 25_000

export async function rankingPagesReport(
  input: RankingPagesReportInput,
  dependencies: DomainResearchDependencies = {},
): Promise<RankingPagesReport> {
  const now = (dependencies.now ?? (() => new Date()))()
  const market = validatedMarket(input.market)
  const source = researchFilesDependencies({
    sources: input.researchFiles,
    provider: input.provider,
    dependencies,
    now,
  })
  const providerId = source.provider
  const domain = normalizeDomain(input.domain)
  const rowLimit = limit(input.limit, 50)
  const rowOffset = offset(input.offset)
  const rangeDays = days(input.days)
  if (input.site && !siteMatchesDomain(input.site, domain)) {
    throw new SeoError(
      'INVALID_INPUT',
      'The Search Console property must match the ranking-pages domain.',
    )
  }
  const provider = await researchProvider<RankingPagesProvider>({
    capability: 'relevant-pages',
    market,
    provider: providerId,
    dependencies: source.dependencies,
    method: 'rankingPages',
  })
  let evidence: Awaited<ReturnType<RankingPagesProvider['rankingPages']>>
  try {
    evidence = await provider.rankingPages({
      domain,
      market,
      minEstimatedTraffic: input.minEstimatedTraffic,
      minRankedKeywords: input.minRankedKeywords,
      limit: rowLimit,
      offset: rowOffset,
      refresh: input.refresh,
      context: {
        projectId: input.projectId,
        reportId: 'ranking-pages',
        reportRunId: randomUUID(),
      },
    })
  } catch (error) {
    return providerFailure(error)
  }
  const patterns = clusterPseoTemplates(
    evidence.data.rows.map((row) => row.url),
    { minUrls: 2, minShare: 0, limit: 10, sampleSize: 3 },
  ).map((pattern) => ({
    signature: pattern.signature,
    urlCount: pattern.urlCount,
    sampleUrls: pattern.sampleUrls,
    evidenceRefs: evidence.data.rows.flatMap((row, index) =>
      pattern.sampleUrls.includes(row.url)
        ? [`evidence.data.rows[${index}]`]
        : [],
    ),
  }))
  const range = input.site ? finalGscDateRange(rangeDays, now) : null
  const firstPartyResponse =
    input.site && range
      ? await (source.dependencies.searchAnalytics ?? querySearchAnalytics)(
          input.site,
          {
            ...range,
            dimensions: ['page'],
            type: 'web',
            dataState: 'final',
            maxRows: MAX_GSC_PAGE_ROWS,
          },
          { refresh: input.refresh },
        )
      : null
  const wanted = new Map(
    evidence.data.rows.map((row, index) => [row.url, index]),
  )
  const matches = (firstPartyResponse?.rows ?? [])
    .flatMap((row) => {
      const url = row.keys[0]
      const index = url ? wanted.get(url) : undefined
      return url && index !== undefined
        ? [
            {
              pageRef: `evidence.data.rows[${index}]`,
              url,
              clicks: row.clicks,
              impressions: row.impressions,
              averagePosition: row.position,
            },
          ]
        : []
    })
    .sort(
      (left, right) =>
        right.impressions - left.impressions ||
        compareText(left.url, right.url),
    )
  const firstPartyStatus = !input.site
    ? 'not-requested'
    : (firstPartyResponse?.rowsFetched ?? 0) >= MAX_GSC_PAGE_ROWS
      ? 'partial'
      : firstPartyResponse?.rows.length === 0
        ? 'empty'
        : 'complete'
  const findings: RankingPagesReport['findings'] = patterns
    .slice(0, 5)
    .map((pattern, index) => ({
      code: 'repeated-ranking-page-pattern' as const,
      evidenceRefs: [`repeatedPatterns[${index}]`, ...pattern.evidenceRefs],
      detail: `${pattern.urlCount} retained ranking pages match ${pattern.signature}.`,
      action:
        'Inspect representative pages, shared intent, source fields, page uniqueness, internal links, and crawl evidence before treating the URL pattern as a reusable template.',
    }))
  for (const [index, match] of matches.entries()) {
    if (findings.length >= 10) break
    findings.push({
      code: 'provider-page-with-first-party-evidence',
      evidenceRefs: [match.pageRef, `firstParty.matches[${index}]`],
      detail: `${match.url} appears in both the provider page footprint and retained Search Console page evidence.`,
      action:
        'Use Search Console for actual performance, then inspect the provider-ranked keywords and current page before changing the template.',
    })
  }
  const providerStatus = reportStatus(evidence.coverage)

  return {
    schemaVersion: 1,
    methodology: 'ranking_pages_v1',
    generatedAt: now.toISOString(),
    dataStatus: firstPartyStatus === 'partial' ? 'partial' : providerStatus,
    market,
    summary: {
      domain,
      providerRows: evidence.data.rows.length,
      providerTotalRows: evidence.data.totalRows,
      repeatedPagePatterns: patterns.length,
      searchConsoleMatchedPages: matches.length,
      verdict: `${evidence.data.rows.length} ranking page${evidence.data.rows.length === 1 ? '' : 's'} and ${patterns.length} repeated URL pattern${patterns.length === 1 ? '' : 's'} were retained.`,
    },
    evidence,
    firstParty: {
      requested: Boolean(input.site),
      status: firstPartyStatus,
      site: input.site ?? null,
      range,
      rowsFetched: firstPartyResponse?.rowsFetched ?? 0,
      maxRows: input.site ? MAX_GSC_PAGE_ROWS : 0,
      possiblyTruncated:
        (firstPartyResponse?.rowsFetched ?? 0) >= MAX_GSC_PAGE_ROWS,
      matches,
    },
    repeatedPatterns: patterns,
    findings,
    caveats: [
      ...(input.researchFiles
        ? [
            "These page groups were calculated from local ranked-keyword exports. Check evidence.imports before treating the retained rows as the provider's full domain footprint.",
          ]
        : []),
      'Estimated page traffic and ranked-keyword counts come from a country-level provider database. Search Console remains the evidence for measured site performance.',
      'Repeated URL paths are a deterministic structural heuristic. They do not prove shared intent, page quality, a common generator, or that more pages should be created.',
      'Pagination and filters bound the page sample. Patterns found in this subset may not describe the whole domain.',
    ],
    nextSteps: [
      'Run ranked-keywords for a representative page to see the bounded query and intent evidence behind it.',
      input.site
        ? 'Run pseo-audit before changing a working template family, then compare representative pages and crawl evidence.'
        : 'Inspect representative competitor pages for useful fields, result type, navigation, and data provenance without copying their content.',
      'Use a current result snapshot for a representative query when live competitors or intent would change the decision.',
    ],
  }
}
