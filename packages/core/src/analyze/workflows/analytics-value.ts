import {
  analyticsConnectionProviderId,
  analyticsProviderDetails,
} from '../../analytics/providers.js'
import {
  ga4ReportQualityWarnings,
  ga4RowsToObjects,
  runGa4Report,
} from '../../ga4/client.js'
import { runAnalyticsProviderLandingPages } from '../../provider-extensions/analytics.js'
import type { SeoAnalyticsLandingPageResult } from '../../provider-extensions/sdk.js'
import type { AnalyticsConnection } from '../../types.js'

export type LandingPageValue = {
  sessions: number
  totalUsers?: number
  conversions?: number
}

export type LandingPageValueSource = {
  provider?: string
  observedMetrics?: Array<'sessions' | 'totalUsers' | 'conversions'>
  dataStatus?: 'complete' | 'partial'
  returnedRows: number
  availableRows?: number
  retainedRowLimit: number
  retainedRowLimitReached: boolean
  qualityWarnings?: string[]
}

export type LandingPageValueResult = {
  values: Map<string, LandingPageValue>
  source?: LandingPageValueSource
  warning?: string
}

type LandingPageValueDependencies = {
  runGa4Report: typeof runGa4Report
  analyticsLandingPages: typeof runAnalyticsProviderLandingPages
}

const defaultDependencies: LandingPageValueDependencies = {
  runGa4Report,
  analyticsLandingPages: runAnalyticsProviderLandingPages,
}

function normalizePath(value: string): string {
  if (!value || value === '(not set)') return ''
  const [path = ''] = value.split('?')
  return path.replace(/\/$/, '') || '/'
}

function urlPath(url: string): string {
  try {
    return normalizePath(new URL(url).pathname)
  } catch {
    return ''
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function landingPageValuesFromRows(
  rows: Array<Record<string, string>>,
): Map<string, LandingPageValue> {
  const orderedRows = [...rows].sort((left, right) => {
    const leftPath = normalizePath(left.landingPagePlusQueryString ?? '')
    const rightPath = normalizePath(right.landingPagePlusQueryString ?? '')
    return (
      compareText(leftPath, rightPath) ||
      compareText(
        left.landingPagePlusQueryString ?? '',
        right.landingPagePlusQueryString ?? '',
      ) ||
      compareText(left.sessions ?? '', right.sessions ?? '') ||
      compareText(left.totalUsers ?? '', right.totalUsers ?? '') ||
      compareText(left.conversions ?? '', right.conversions ?? '')
    )
  })
  const values = new Map<string, LandingPageValue>()
  for (const row of orderedRows) {
    const path = normalizePath(row.landingPagePlusQueryString ?? '')
    if (!path) continue
    const existing = values.get(path) ?? {
      sessions: 0,
      totalUsers: 0,
      conversions: 0,
    }
    values.set(path, {
      sessions: existing.sessions + Number(row.sessions ?? 0),
      totalUsers: (existing.totalUsers ?? 0) + Number(row.totalUsers ?? 0),
      conversions: (existing.conversions ?? 0) + Number(row.conversions ?? 0),
    })
  }
  return values
}

export function landingPageValuesFromProviderRows(
  rows: SeoAnalyticsLandingPageResult['rows'],
): Map<string, LandingPageValue> {
  return new Map(rows.map((row) => [row.path, { sessions: row.visits }]))
}

export function landingValueForUrl(
  values: Map<string, LandingPageValue>,
  url: string,
): LandingPageValue | undefined {
  return values.get(urlPath(url))
}

export function landingPageValuesCanRank(
  source: LandingPageValueSource | undefined,
): boolean {
  return source?.dataStatus === 'complete'
}

export function landingPageRankingPolicy(input: {
  connection?: AnalyticsConnection
  propertyId?: string
  source?: LandingPageValueSource
  warning?: string
}): { canRank: boolean; warnings: string[] } {
  const connection =
    input.connection ??
    (input.propertyId
      ? ({ provider: 'google', propertyId: input.propertyId } as const)
      : undefined)
  if (!connection) return { canRank: false, warnings: [] }
  const label = analyticsProviderDetails(
    analyticsConnectionProviderId(connection),
  ).label
  const warningSuffix =
    'Observed landing-page values remain visible but do not affect priority scores.'
  const warnings = [
    ...(input.warning ? [`${label}: ${input.warning}`] : []),
    ...(input.source?.retainedRowLimitReached
      ? [`${label}: the retained-row limit was reached. ${warningSuffix}`]
      : []),
    ...(input.source?.qualityWarnings?.map(
      (warning) => `${warning} ${warningSuffix}`,
    ) ?? []),
  ]
  if (!input.source?.dataStatus && !input.warning) {
    warnings.push(
      `${label}: landing-page completeness was not reported. ${warningSuffix}`,
    )
  }
  return {
    canRank:
      !input.warning &&
      warnings.length === 0 &&
      landingPageValuesCanRank(input.source),
    warnings,
  }
}

export async function fetchLandingPageValues(
  input: {
    connection?: AnalyticsConnection
    propertyId?: string
    startDate: string
    endDate: string
    limit?: number
    refresh?: boolean
  },
  dependencies: Partial<LandingPageValueDependencies> = defaultDependencies,
): Promise<LandingPageValueResult> {
  const retainedRowLimit = input.limit ?? 5000
  const connection =
    input.connection ??
    (input.propertyId
      ? ({ provider: 'google', propertyId: input.propertyId } as const)
      : undefined)
  if (!connection) {
    return {
      values: new Map(),
      source: {
        provider: 'google',
        observedMetrics: [],
        dataStatus: 'complete',
        returnedRows: 0,
        retainedRowLimit,
        retainedRowLimitReached: false,
        qualityWarnings: [],
      },
    }
  }
  if (connection.provider === 'extension') {
    try {
      const result = await (
        dependencies.analyticsLandingPages ??
        defaultDependencies.analyticsLandingPages
      )({
        providerId: connection.providerId,
        account: connection.account,
        startDate: input.startDate,
        endDate: input.endDate,
        limit: retainedRowLimit,
        refresh: input.refresh,
      })
      return {
        values: landingPageValuesFromProviderRows(result.rows),
        source: {
          provider: connection.providerId,
          observedMetrics: ['sessions'],
          dataStatus: result.dataStatus,
          returnedRows: result.returnedRows,
          ...(result.availableRows !== undefined
            ? { availableRows: result.availableRows }
            : {}),
          retainedRowLimit: result.retainedRowLimit,
          retainedRowLimitReached: result.retainedRowLimitReached,
          qualityWarnings: [...result.qualityWarnings],
        },
      }
    } catch (error) {
      return {
        values: new Map(),
        source: {
          provider: connection.providerId,
          observedMetrics: [],
          dataStatus: 'partial',
          returnedRows: 0,
          retainedRowLimit,
          retainedRowLimitReached: false,
          qualityWarnings: [],
        },
        warning: error instanceof Error ? error.message : String(error),
      }
    }
  }
  const fetchers: Record<
    Exclude<AnalyticsConnection['provider'], 'extension'>,
    (
      selected: Exclude<AnalyticsConnection, { provider: 'extension' }>,
    ) => Promise<LandingPageValueResult>
  > = {
    clicky: async (selected) => {
      if (selected.provider !== 'clicky') {
        throw new Error('Clicky analytics connection mismatch.')
      }
      try {
        const result = await (
          dependencies.analyticsLandingPages ??
          defaultDependencies.analyticsLandingPages
        )({
          providerId: 'clicky',
          account: { siteId: selected.siteId },
          startDate: input.startDate,
          endDate: input.endDate,
          limit: retainedRowLimit,
          refresh: input.refresh,
        })
        return {
          values: landingPageValuesFromProviderRows(result.rows),
          source: {
            provider: 'clicky',
            observedMetrics: ['sessions'],
            dataStatus: result.dataStatus,
            returnedRows: result.returnedRows,
            retainedRowLimit: result.retainedRowLimit,
            retainedRowLimitReached: result.retainedRowLimitReached,
            qualityWarnings: [...result.qualityWarnings],
          },
        }
      } catch (error) {
        return {
          values: new Map(),
          source: {
            provider: 'clicky',
            observedMetrics: [],
            dataStatus: 'partial',
            returnedRows: 0,
            retainedRowLimit,
            retainedRowLimitReached: false,
            qualityWarnings: [],
          },
          warning: error instanceof Error ? error.message : String(error),
        }
      }
    },
    google: async (selected) => {
      if (selected.provider !== 'google') {
        throw new Error('Google Analytics connection mismatch.')
      }
      try {
        const result = await (
          dependencies.runGa4Report ?? defaultDependencies.runGa4Report
        )(
          selected.propertyId,
          {
            dateRanges: [
              { startDate: input.startDate, endDate: input.endDate },
            ],
            dimensions: [{ name: 'landingPagePlusQueryString' }],
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'conversions' },
            ],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: retainedRowLimit,
          },
          { refresh: input.refresh },
        )
        const rows = ga4RowsToObjects(result)
        const values = landingPageValuesFromRows(rows)
        const availableRows = result.rowCount
        const retainedRowLimitReached =
          (availableRows !== undefined && availableRows > rows.length) ||
          rows.length >= retainedRowLimit
        const qualityWarnings = ga4ReportQualityWarnings(
          result,
          'Google Analytics landing-page report',
        )
        return {
          values,
          source: {
            provider: 'google',
            observedMetrics: ['sessions', 'totalUsers', 'conversions'],
            dataStatus:
              retainedRowLimitReached || qualityWarnings.length
                ? 'partial'
                : 'complete',
            returnedRows: rows.length,
            ...(availableRows !== undefined ? { availableRows } : {}),
            retainedRowLimit,
            retainedRowLimitReached,
            qualityWarnings,
          },
        }
      } catch (error) {
        return {
          values: new Map(),
          source: {
            provider: 'google',
            observedMetrics: [],
            dataStatus: 'partial',
            returnedRows: 0,
            retainedRowLimit,
            retainedRowLimitReached: false,
            qualityWarnings: [],
          },
          warning: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
  return fetchers[connection.provider](connection)
}
