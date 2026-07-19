import { SeoError } from '../errors.js'
import {
  analyzeBingCrawl,
  analyzeBingDimensions,
  analyzeBingTraffic,
} from './analysis.js'
import type { BingWebmasterClient } from './client.js'
import { createBingWebmasterClient } from './credentials.js'

type Section<T> =
  | { status: 'complete'; data: T }
  | { status: 'partial'; data: T; warning: string }
  | { status: 'unavailable'; warning: string }

type Finding = {
  code: string
  severity: 'info' | 'review' | 'warning'
  title: string
  evidence: Record<string, unknown>
  interpretation: string
  verification: string
}

const DAILY_OUTPUT_ROWS = 14

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function range(rows: Array<{ date: string }>) {
  return rows.length
    ? { startDate: rows[0]?.date ?? '', endDate: rows.at(-1)?.date ?? '' }
    : undefined
}

function dailyOutput<T extends { rows: Array<{ date: string }> }>(data: T) {
  const rows = data.rows.slice(-DAILY_OUTPUT_ROWS)
  return {
    ...data,
    rows,
    retainedRows: data.rows.length,
    outputSelection: {
      strategy: 'most-recent' as const,
      availableRows: data.rows.length,
      returnedRows: rows.length,
      omittedRows: Math.max(0, data.rows.length - rows.length),
    },
  }
}

async function section<T extends { invalidRows: number; capped: boolean }>(
  work: () => Promise<T>,
  options: { rowLimit: number; sourceWarning?: string },
): Promise<Section<T>> {
  try {
    const data = await work()
    const reasons = [
      ...(data.invalidRows
        ? [`${data.invalidRows} invalid provider rows were excluded.`]
        : []),
      ...(data.capped
        ? [`The provider response exceeded the ${options.rowLimit}-row limit.`]
        : []),
      ...(options.sourceWarning ? [options.sourceWarning] : []),
    ]
    return reasons.length
      ? { status: 'partial', data, warning: reasons.join(' ') }
      : { status: 'complete', data }
  } catch (error) {
    if (
      error instanceof SeoError &&
      (error.code === 'AUTH_REQUIRED' || error.code === 'ACCESS_DENIED')
    ) {
      throw error
    }
    return { status: 'unavailable', warning: message(error) }
  }
}

function changeFinding(input: {
  code: string
  title: string
  current: number
  previous: number
  absolute: number
  percent: number | null
  dates: { current: string; previous: string }
  interpretation: string
  verification: string
}): Finding {
  return {
    code: input.code,
    severity: 'warning',
    title: input.title,
    evidence: {
      current: input.current,
      previous: input.previous,
      absoluteChange: input.absolute,
      percentChange: input.percent,
      currentDate: input.dates.current,
      previousDate: input.dates.previous,
    },
    interpretation: input.interpretation,
    verification: input.verification,
  }
}

function buildFindings(input: {
  traffic: ReturnType<typeof analyzeBingTraffic>
  crawl: ReturnType<typeof analyzeBingCrawl>
  queries: ReturnType<typeof analyzeBingDimensions> | undefined
  pages: ReturnType<typeof analyzeBingDimensions> | undefined
}) {
  const findings: Finding[] = []
  const traffic = input.traffic
  if (
    traffic &&
    traffic.current.observedDays === traffic.current.expectedDays &&
    traffic.previous.observedDays === traffic.previous.expectedDays &&
    ((traffic.changes.clicksPercent !== null &&
      Math.abs(traffic.changes.clicksPercent) >= 10) ||
      (traffic.changes.impressionsPercent !== null &&
        Math.abs(traffic.changes.impressionsPercent) >= 10))
  ) {
    const metric =
      traffic.changes.clicksPercent !== null &&
      Math.abs(traffic.changes.clicksPercent) >= 10
        ? 'clicks'
        : 'impressions'
    const declined = traffic.changes[metric] < 0
    findings.push({
      code: `bing_${metric}_${declined ? 'declined' : 'increased'}`,
      severity: declined ? 'warning' : 'info',
      title: `Bing ${metric} ${declined ? 'declined' : 'increased'} in the latest complete period`,
      evidence: {
        currentClicks: traffic.current.clicks,
        previousClicks: traffic.previous.clicks,
        clicksChange: traffic.changes.clicks,
        clicksPercentChange: traffic.changes.clicksPercent,
        currentImpressions: traffic.current.impressions,
        previousImpressions: traffic.previous.impressions,
        impressionsChange: traffic.changes.impressions,
        impressionsPercentChange: traffic.changes.impressionsPercent,
        ctrPercentagePointChange: traffic.changes.ctrPercentagePoints,
        currentRange: {
          startDate: traffic.current.startDate,
          endDate: traffic.current.endDate,
        },
        previousRange: {
          startDate: traffic.previous.startDate,
          endDate: traffic.previous.endDate,
        },
      },
      interpretation:
        'This is a Bing-observed traffic change. It does not establish the cause or describe Google traffic.',
      verification:
        'Review the query and page evidence for the same dates, then compare current pages and crawl health before changing content.',
    })
  }

  const crawl = input.crawl
  if (crawl?.previous) {
    const dates = { current: crawl.current.date, previous: crawl.previous.date }
    const errors = crawl.changes.crawlErrors
    if (
      errors &&
      errors.absolute >= Math.max(10, Math.ceil(errors.previous * 0.5))
    ) {
      findings.push(
        changeFinding({
          code: 'bing_crawl_errors_increased',
          title: 'Bing crawl errors increased',
          ...errors,
          dates,
          interpretation:
            'Bing reported more crawl errors in its latest daily snapshot. The count may include URLs outside the current sitemap.',
          verification:
            'Run the fast sitemap health check, inspect Bing crawl issue samples, then audit any affected URLs directly.',
        }),
      )
    }
    const code4xx = crawl.changes.code4xx
    if (
      code4xx &&
      code4xx.absolute >= Math.max(10, Math.ceil(code4xx.previous * 0.5))
    ) {
      findings.push(
        changeFinding({
          code: 'bing_4xx_increased',
          title: 'Bing-observed 4xx responses increased',
          ...code4xx,
          dates,
          interpretation:
            'Bing encountered more 4xx responses. Intentional removals and obsolete discovered URLs can contribute to this count.',
          verification:
            'Inspect Bing crawl issue URLs and recover or redirect only URLs that should still exist or retain search value.',
        }),
      )
    }
    const code5xx = crawl.changes.code5xx
    if (code5xx && code5xx.current > 0 && code5xx.absolute > 0) {
      findings.push(
        changeFinding({
          code: 'bing_5xx_increased',
          title: 'Bing-observed server errors increased',
          ...code5xx,
          dates,
          interpretation:
            'Bing encountered more server errors in the latest snapshot. Even a small increase deserves a live check.',
          verification:
            'Check current server logs and run targeted URL audits before treating the provider count as an active outage.',
        }),
      )
    }
  }

  for (const [kind, analysis] of [
    ['query', input.queries],
    ['page', input.pages],
  ] as const) {
    if (!analysis?.opportunities.length) continue
    findings.push({
      code: `bing_${kind}_opportunities`,
      severity: 'review',
      title: `${analysis.opportunities.length} Bing ${kind} opportunities need review`,
      evidence: {
        retainedOpportunities: analysis.opportunities.length,
        currentDimensions: analysis.coverage.currentDimensions,
        matchedDimensions: analysis.coverage.matchedDimensions,
        comparableDimensions: analysis.coverage.comparableDimensions,
        thresholds: analysis.thresholds,
      },
      interpretation:
        'These are high-impression top-list entries currently observed around positions 4 to 20. The threshold is a prioritization heuristic, not a search-engine rule.',
      verification:
        kind === 'query'
          ? 'Check intent and the ranking page before changing copy or creating content.'
          : 'Audit the selected page and its matching queries before changing internal links, titles, or content.',
    })
  }
  return findings
}

export async function bingWebmasterOverview(input: {
  site: string
  client?: BingWebmasterClient
  credentialSource?: 'environment' | 'keychain' | 'file'
}) {
  if (!input.site.trim()) {
    throw new SeoError('INVALID_INPUT', 'Pass a Bing Webmaster site URL.')
  }
  const resolved = input.client
    ? {
        client: input.client,
        credentialSource: input.credentialSource ?? ('environment' as const),
      }
    : await createBingWebmasterClient()
  const observedAt = new Date().toISOString()
  const topListWarning =
    'Bing returns weekly top-list rows, so dimensions missing from a period remain unknown.'
  const [traffic, crawl, queries, pages] = await Promise.all([
    section(() => resolved.client.getTraffic(input.site), { rowLimit: 400 }),
    section(() => resolved.client.getCrawlStats(input.site), { rowLimit: 400 }),
    section(() => resolved.client.getQueryStats(input.site), {
      rowLimit: 8_000,
      sourceWarning: topListWarning,
    }),
    section(() => resolved.client.getPageStats(input.site), {
      rowLimit: 8_000,
      sourceWarning: topListWarning,
    }),
  ])
  const statuses = [traffic.status, crawl.status, queries.status, pages.status]
  const dataStatus = statuses.every((status) => status === 'complete')
    ? 'complete'
    : statuses.every((status) => status === 'unavailable')
      ? 'unavailable'
      : 'partial'

  const trafficAnalysis =
    traffic.status === 'unavailable'
      ? undefined
      : analyzeBingTraffic(traffic.data.rows)
  const crawlAnalysis =
    crawl.status === 'unavailable'
      ? undefined
      : analyzeBingCrawl(crawl.data.rows)
  const queryAnalysis =
    queries.status === 'unavailable'
      ? undefined
      : analyzeBingDimensions(queries.data.rows, 'query')
  const pageAnalysis =
    pages.status === 'unavailable'
      ? undefined
      : analyzeBingDimensions(pages.data.rows, 'page')
  const findings = buildFindings({
    traffic: trafficAnalysis,
    crawl: crawlAnalysis,
    queries: queryAnalysis,
    pages: pageAnalysis,
  })

  return {
    schemaVersion: 2 as const,
    site: input.site,
    generatedAt: observedAt,
    dataStatus,
    summary: {
      findings: findings.length,
      warnings: findings.filter((finding) => finding.severity === 'warning')
        .length,
      reviewItems: findings.filter((finding) => finding.severity === 'review')
        .length,
    },
    findings,
    outputBudget: {
      maxFindings: 6,
      maxDailyRowsPerSection: DAILY_OUTPUT_ROWS,
      maxDailyRowsTotal: DAILY_OUTPUT_ROWS * 2,
      maxDimensionItemsPerList: 10,
      maxDimensionItemsTotal: 40,
    },
    provenance: {
      provider: 'bing-webmaster' as const,
      authentication: resolved.client.authentication,
      credentialSource: resolved.credentialSource,
      observedAt,
      cached: false as const,
      rowLimits: { traffic: 400, crawl: 400, queries: 8_000, pages: 8_000 },
      methods: [
        'GetRankAndTrafficStats',
        'GetCrawlStats',
        'GetQueryStats',
        'GetPageStats',
      ],
    },
    traffic:
      traffic.status === 'unavailable'
        ? traffic
        : {
            ...traffic,
            data: {
              ...dailyOutput(traffic.data),
              range: range(traffic.data.rows),
              clicks: traffic.data.rows.reduce(
                (total, row) => total + row.clicks,
                0,
              ),
              impressions: traffic.data.rows.reduce(
                (total, row) => total + row.impressions,
                0,
              ),
              analysis: trafficAnalysis,
            },
          },
    crawl:
      crawl.status === 'unavailable'
        ? crawl
        : {
            ...crawl,
            data: {
              ...dailyOutput(crawl.data),
              range: range(crawl.data.rows),
              latest: crawl.data.rows.at(-1),
              analysis: crawlAnalysis,
            },
          },
    queries:
      queries.status === 'unavailable'
        ? queries
        : {
            ...queries,
            data: {
              returnedRows: queries.data.returnedRows,
              retainedRows: queries.data.rows.length,
              invalidRows: queries.data.invalidRows,
              capped: queries.data.capped,
              range: range(queries.data.rows),
              analysis: queryAnalysis,
            },
          },
    pages:
      pages.status === 'unavailable'
        ? pages
        : {
            ...pages,
            data: {
              returnedRows: pages.data.returnedRows,
              retainedRows: pages.data.rows.length,
              invalidRows: pages.data.invalidRows,
              capped: pages.data.capped,
              range: range(pages.data.rows),
              analysis: pageAnalysis,
            },
          },
    caveats: [
      'Bing reports its own observed search and crawl evidence. It is not a complete view of every search engine.',
      'The inIndex field is provider-reported crawl statistics, not independent proof that a URL is indexed.',
      'Query and page movements include only dimensions observed in every weekly top list in both periods. Missing entries are not treated as zero.',
      'Opportunity thresholds prioritize review. They are heuristics, not search-engine requirements.',
    ],
  }
}
