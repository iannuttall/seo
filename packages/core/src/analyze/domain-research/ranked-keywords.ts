import { randomUUID } from 'node:crypto'
import { SeoError } from '../../errors.js'
import type { RankedKeywordsProvider } from '../../providers/domain-contracts.js'
import type {
  RankedKeywordFirstPartyMatch,
  RankedKeywordsReport,
  RankedKeywordsReportInput,
} from '../domain-research-contract.js'
import {
  acquireGscQueries,
  type DomainResearchDependencies,
  days,
  limit,
  normalizeDomain,
  normalizedKeyword,
  offset,
  providerFailure,
  reportStatus,
  researchFilesDependencies,
  researchProvider,
  siteMatchesDomain,
  validatedMarket,
} from './shared.js'

export async function rankedKeywordsReport(
  input: RankedKeywordsReportInput,
  dependencies: DomainResearchDependencies = {},
): Promise<RankedKeywordsReport> {
  const now = (dependencies.now ?? (() => new Date()))()
  const market = validatedMarket(input.market)
  const source = researchFilesDependencies({
    sources: input.researchFiles,
    provider: input.provider,
    dependencies,
    now,
  })
  const providerId = source.provider
  const targetDomain = normalizeDomain(input.target)
  const rowLimit = limit(input.limit, 50)
  const rowOffset = offset(input.offset)
  const rangeDays = days(input.days)
  if (input.site && !siteMatchesDomain(input.site, targetDomain)) {
    throw new SeoError(
      'INVALID_INPUT',
      'The Search Console property must match the ranked-keyword target.',
    )
  }
  const provider = await researchProvider<RankedKeywordsProvider>({
    capability: 'ranked-keywords',
    market,
    provider: providerId,
    dependencies: source.dependencies,
    method: 'rankedKeywords',
  })
  let evidence: Awaited<ReturnType<RankedKeywordsProvider['rankedKeywords']>>
  try {
    evidence = await provider.rankedKeywords({
      target: input.target,
      market,
      includeSubdomains: input.includeSubdomains,
      resultTypes: input.resultTypes,
      minSearchVolume: input.minSearchVolume,
      maxRank: input.maxRank,
      excludeTerms: input.excludeTerms,
      limit: rowLimit,
      offset: rowOffset,
      refresh: input.refresh,
      context: {
        projectId: input.projectId,
        reportId: 'ranked-keywords',
        reportRunId: randomUUID(),
      },
    })
  } catch (error) {
    return providerFailure(error)
  }
  const firstPartySource = input.site
    ? await acquireGscQueries({
        site: input.site,
        days: rangeDays,
        refresh: input.refresh,
        dependencies: source.dependencies,
        now,
      })
    : null
  const gscByQuery = new Map(
    firstPartySource?.rows.map((row) => [row.query, row]) ?? [],
  )
  const matches: RankedKeywordFirstPartyMatch[] = evidence.data.rows.map(
    (row, index) => {
      const firstParty = gscByQuery.get(normalizedKeyword(row.keyword))
      return {
        keyword: row.keyword,
        providerRowRef: `evidence.data.rows[${index}]`,
        status: !input.site
          ? 'not-requested'
          : firstParty
            ? 'observed'
            : 'not-in-retained-rows',
        clicks: firstParty?.clicks ?? null,
        impressions: firstParty?.impressions ?? null,
        averagePosition: firstParty?.averagePosition ?? null,
        urls: firstParty?.urls ?? [],
      }
    },
  )
  const findings: RankedKeywordsReport['findings'] = []
  for (const [index, row] of evidence.data.rows.entries()) {
    const match = matches[index]
    if (!match) continue
    if (
      row.monthlySearchVolume.state === 'observed' &&
      row.monthlySearchVolume.value === 0 &&
      match.status === 'observed' &&
      (match.impressions ?? 0) > 0
    ) {
      findings.push({
        code: 'provider-zero-with-first-party-evidence',
        keyword: row.keyword,
        evidenceRefs: [
          `evidence.data.rows[${index}].monthlySearchVolume`,
          `firstParty.matches[${index}]`,
        ],
        detail: `${row.keyword} has retained Search Console impressions while the provider volume estimate is zero.`,
        action:
          'Keep the first-party evidence. Inspect a current result snapshot before using the provider estimate to deprioritize the query.',
      })
    } else if (input.site && match.status === 'not-in-retained-rows') {
      findings.push({
        code: 'provider-only-keyword',
        keyword: row.keyword,
        evidenceRefs: [
          `evidence.data.rows[${index}]`,
          `firstParty.matches[${index}]`,
        ],
        detail: `${row.keyword} appears in the provider result but not in the bounded retained Search Console rows.`,
        action:
          'Check the provider ranking URL, current results, Search Console filters, and anonymized-query limits before treating it as a new opportunity.',
      })
    }
    if (findings.length >= 10) break
  }
  const matched = matches.filter((item) => item.status === 'observed').length
  const unmatched = matches.filter(
    (item) => item.status === 'not-in-retained-rows',
  ).length
  const firstPartyStatus = !input.site
    ? 'not-requested'
    : firstPartySource?.possiblyTruncated
      ? 'partial'
      : (firstPartySource?.rows.length ?? 0) === 0
        ? 'empty'
        : 'complete'
  const providerStatus = reportStatus(evidence.coverage)

  return {
    schemaVersion: 1,
    methodology: 'ranked_keywords_v1',
    generatedAt: now.toISOString(),
    dataStatus: firstPartyStatus === 'partial' ? 'partial' : providerStatus,
    market,
    summary: {
      target: evidence.data.target,
      providerRows: evidence.data.rows.length,
      providerTotalRows: evidence.data.totalRows,
      matchedSearchConsoleQueries: matched,
      unmatchedInRetainedSearchConsoleRows: unmatched,
      verdict: input.site
        ? `${matched} provider keyword row${matched === 1 ? '' : 's'} matched retained Search Console query evidence.`
        : `${evidence.data.rows.length} bounded provider keyword row${evidence.data.rows.length === 1 ? '' : 's'} were retained for review.`,
    },
    evidence,
    firstParty: {
      requested: Boolean(input.site),
      status: firstPartyStatus,
      site: input.site ?? null,
      range: firstPartySource?.range ?? null,
      rowsFetched: firstPartySource?.rowsFetched ?? 0,
      calls: firstPartySource?.calls ?? 0,
      maxRows: firstPartySource?.maxRows ?? 0,
      possiblyTruncated: firstPartySource?.possiblyTruncated ?? false,
      matches,
    },
    findings,
    caveats: [
      ...(input.researchFiles
        ? [
            'This run uses local provider exports. Check evidence.imports for each export time, file hash, included fields, rejected rows and cap before interpreting missing rows.',
          ]
        : []),
      'Rank, traffic, search volume, difficulty, intent, and CPC fields come from the provider database and its update schedule. They are not a live result check.',
      'A keyword absent from retained Search Console rows is not proof that the site had no impressions. Search Console omits anonymized queries and this acquisition is bounded.',
      'Filters and pagination change the visible subset. Check evidence.coverage and evidence.request before interpreting counts or missing rows.',
    ],
    nextSteps: [
      'Run serp-results for a shortlisted keyword when the current ranking, result type, or intent would change the decision.',
      'Run ranking-pages for the domain to find repeated URL patterns and pages carrying several observed keywords.',
      input.site
        ? 'Use keyword-opportunities for owner-verified quick wins and programmatic clusters before treating provider-only rows as content gaps.'
        : 'Pass a matching Search Console property only for a site you own. Competitor research should not pretend to have first-party evidence.',
    ],
  }
}
