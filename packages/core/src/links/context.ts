import type { CrawlReport } from '../analyze/crawler/report.js'
import { latestCrawlReport } from '../analyze/crawler/report-store.js'
import { SeoError } from '../errors.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { finalGscDateRange } from '../gsc/dates.js'
import { linkTargetFindings } from './context-findings.js'
import {
  type AggregatedSearchRow,
  aggregateLinkSearchRows,
  crawlForLinkTargets,
  linkTargetCounts,
  urlKey,
} from './context-sources.js'
import type {
  LinkTargetContext,
  LinkTargetContextRow,
  LinkTargetSearchEvidence,
} from './context-types.js'
import type { CollectedLinkEvidence } from './types.js'

export type {
  LinkTargetContext,
  LinkTargetContextRow,
  LinkTargetCrawlEvidence,
  LinkTargetFinding,
  LinkTargetSearchEvidence,
} from './context-types.js'

const DEFAULT_DAYS = 90
const MAX_DAYS = 548
const DEFAULT_CONTEXT_LIMIT = 100
const MAX_CONTEXT_LIMIT = 100
const MAX_GSC_ROWS = 25_000

type SearchAnalytics = typeof querySearchAnalytics

export type LinkTargetContextDependencies = {
  latestCrawl: (site?: string) => CrawlReport | undefined
  searchAnalytics: SearchAnalytics
  now: () => Date
}

const defaultDependencies: LinkTargetContextDependencies = {
  latestCrawl: latestCrawlReport,
  searchAnalytics: querySearchAnalytics,
  now: () => new Date(),
}

function integer(input: {
  value: number | undefined
  fallback: number
  maximum: number
  label: string
}): number {
  const value = input.value ?? input.fallback
  if (!Number.isSafeInteger(value) || value < 1 || value > input.maximum) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} must be between 1 and ${input.maximum}.`,
    )
  }
  return value
}

function searchEvidence(input: {
  site: string | undefined
  error: string | null
  retainedLimitReached: boolean
  aggregate: AggregatedSearchRow | undefined
}): LinkTargetSearchEvidence {
  if (!input.site) {
    return {
      state: 'unavailable',
      reason: 'No Search Console property was selected for this report.',
    }
  }
  if (input.error) return { state: 'unavailable', reason: input.error }
  if (!input.aggregate) {
    return {
      state: 'not-retained',
      reason: input.retainedLimitReached
        ? `The bounded Search Console response reached ${MAX_GSC_ROWS} rows and did not retain this page.`
        : 'Search Console did not retain a page row for this URL in the selected window.',
    }
  }
  return {
    state: 'observed',
    clicks: input.aggregate.clicks,
    impressions: input.aggregate.impressions,
    ctr:
      input.aggregate.impressions > 0
        ? input.aggregate.clicks / input.aggregate.impressions
        : 0,
    position:
      input.aggregate.impressions > 0
        ? input.aggregate.positionWeight / input.aggregate.impressions
        : 0,
  }
}

export async function linkTargetContext(
  input: {
    evidence: CollectedLinkEvidence
    searchConsoleSite?: string
    crawlSite?: string
    days?: number
    limit?: number
    refresh?: boolean
  },
  dependencies: LinkTargetContextDependencies = defaultDependencies,
): Promise<LinkTargetContext> {
  const days = integer({
    value: input.days,
    fallback: DEFAULT_DAYS,
    maximum: MAX_DAYS,
    label: 'Link context days',
  })
  const limit = integer({
    value: input.limit,
    fallback: DEFAULT_CONTEXT_LIMIT,
    maximum: MAX_CONTEXT_LIMIT,
    label: 'Link context limit',
  })
  const available = linkTargetCounts(input.evidence)
  const selected = available.slice(0, limit)
  const crawlLookup = input.crawlSite ?? input.searchConsoleSite
  const crawl = crawlLookup ? dependencies.latestCrawl(crawlLookup) : undefined
  const crawlValues = crawlForLinkTargets({ report: crawl, targets: selected })
  const warnings: string[] = []
  const range = finalGscDateRange(days, dependencies.now())
  let searchRows = new Map<string, AggregatedSearchRow>()
  let searchCalls = 0
  let searchRowsFetched = 0
  let searchError: string | null = null
  if (input.searchConsoleSite) {
    try {
      const result = await dependencies.searchAnalytics(
        input.searchConsoleSite,
        {
          ...range,
          dimensions: ['page'],
          type: 'web',
          dataState: 'final',
          rowLimit: MAX_GSC_ROWS,
          maxRows: MAX_GSC_ROWS,
        },
        { refresh: input.refresh },
      )
      searchRows = aggregateLinkSearchRows(result.rows)
      searchCalls = result.calls
      searchRowsFetched = result.rowsFetched
    } catch (error) {
      searchError =
        error instanceof Error
          ? error.message
          : 'Search Console evidence could not be loaded.'
      warnings.push(`Search Console context was unavailable. ${searchError}`)
    }
  }
  let searchMatches = 0
  const retainedLimitReached = searchRowsFetched >= MAX_GSC_ROWS
  const rows = selected.map((target): LinkTargetContextRow => {
    const aggregate = searchRows.get(urlKey(target.targetUrl) ?? '')
    if (aggregate) searchMatches += 1
    return {
      ...target,
      crawl:
        crawlValues.values.get(target.targetUrl) ??
        ({
          state: 'not-observed',
          reason: 'The target URL was not present in the retained crawl pages.',
        } as const),
      searchConsole: searchEvidence({
        site: input.searchConsoleSite,
        error: searchError,
        retainedLimitReached,
        aggregate,
      }),
    }
  })
  if (!crawl) {
    warnings.push(
      'No matching saved crawl was available, so target response and indexability checks were skipped.',
    )
  }
  if (retainedLimitReached) {
    warnings.push(
      `Search Console reached the ${MAX_GSC_ROWS}-row acquisition limit. Missing target rows remain not retained rather than zero.`,
    )
  }
  const unavailableSources = Number(!crawl) + Number(!input.searchConsoleSite)
  return {
    schemaVersion: 1,
    dataStatus:
      unavailableSources === 2
        ? 'unavailable'
        : unavailableSources > 0 || searchError || retainedLimitReached
          ? 'partial'
          : 'complete',
    selection: {
      availableTargets: available.length,
      returnedTargets: rows.length,
      omittedTargets: Math.max(0, available.length - rows.length),
      limit,
    },
    provenance: {
      crawl: {
        status: crawl ? 'joined' : 'unavailable',
        reportId: crawl?.id ?? null,
        observedAt: crawl?.generatedAt ?? null,
        availablePages: crawl?.pages.length ?? 0,
        matchedTargets: crawlValues.matched,
      },
      searchConsole: {
        status:
          !input.searchConsoleSite || searchError
            ? 'unavailable'
            : retainedLimitReached
              ? 'partial'
              : 'joined',
        site: input.searchConsoleSite ?? null,
        range: input.searchConsoleSite ? { ...range, days } : null,
        calls: searchCalls,
        rowsFetched: searchRowsFetched,
        retainedRowLimit: MAX_GSC_ROWS,
        retainedRowLimitReached: retainedLimitReached,
        matchedTargets: searchMatches,
      },
    },
    rows,
    findings: linkTargetFindings(rows),
    warnings,
  }
}
