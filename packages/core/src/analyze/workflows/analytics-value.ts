import { ClickyClient, type ClickyReportResult } from '../../clicky/client.js'
import {
  ga4ReportQualityWarnings,
  ga4RowsToObjects,
  runGa4Report,
} from '../../ga4/client.js'
import type { AnalyticsConnection } from '../../types.js'

export type LandingPageValue = {
  sessions: number
  totalUsers?: number
  conversions?: number
}

export type LandingPageValueSource = {
  provider?: AnalyticsConnection['provider']
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
  clickyReport: (
    siteId: string,
    input: Parameters<ClickyClient['report']>[0],
  ) => Promise<ClickyReportResult>
}

const defaultDependencies: LandingPageValueDependencies = {
  runGa4Report,
  clickyReport: (siteId, input) => new ClickyClient({ siteId }).report(input),
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

export function landingPageValuesFromClickyRows(
  rows: ClickyReportResult['rows'],
): Map<string, LandingPageValue> {
  const values = new Map<string, LandingPageValue>()
  const orderedRows = [...rows].sort((left, right) =>
    compareText(left.url ?? '', right.url ?? ''),
  )
  for (const row of orderedRows) {
    if (!row.url) continue
    let path = ''
    try {
      path = normalizePath(new URL(row.url).pathname)
    } catch {
      continue
    }
    const sessions = Number(row.value)
    if (!path || !Number.isSafeInteger(sessions) || sessions < 0) continue
    const existing = values.get(path)
    values.set(path, { sessions: (existing?.sessions ?? 0) + sessions })
  }
  return values
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
  const label = connection.provider === 'clicky' ? 'Clicky' : 'Google Analytics'
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
  if (connection.provider === 'clicky') {
    try {
      const result = await (
        dependencies.clickyReport ?? defaultDependencies.clickyReport
      )(connection.siteId, {
        type: 'pages-entrance',
        startDate: input.startDate,
        endDate: input.endDate,
        limit: retainedRowLimit,
        refresh: input.refresh,
      })
      return {
        values: landingPageValuesFromClickyRows(result.rows),
        source: {
          provider: 'clicky',
          observedMetrics: ['sessions'],
          dataStatus: result.retainedRowLimitReached ? 'partial' : 'complete',
          returnedRows: result.returnedRows,
          retainedRowLimit: result.retainedRowLimit,
          retainedRowLimitReached: result.retainedRowLimitReached,
          qualityWarnings: result.retainedRowLimitReached
            ? [
                'Clicky returned the retained landing-page limit. Missing pages are not reliable zero-visit evidence.',
              ]
            : [],
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
  }
  try {
    const result = await (
      dependencies.runGa4Report ?? defaultDependencies.runGa4Report
    )(
      connection.propertyId,
      {
        dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
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
}
