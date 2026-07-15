import {
  ga4ReportQualityWarnings,
  ga4RowsToObjects,
  runGa4Report,
} from '../../ga4/client.js'

export type LandingPageValue = {
  sessions: number
  totalUsers: number
  conversions: number
}

export type LandingPageValueSource = {
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
}

const defaultDependencies: LandingPageValueDependencies = { runGa4Report }

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
      totalUsers: existing.totalUsers + Number(row.totalUsers ?? 0),
      conversions: existing.conversions + Number(row.conversions ?? 0),
    })
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
  propertyId?: string
  source?: LandingPageValueSource
  warning?: string
}): { canRank: boolean; warnings: string[] } {
  if (!input.propertyId) return { canRank: false, warnings: [] }
  const warningSuffix =
    'Observed landing-page values remain visible but do not affect priority scores.'
  const warnings = [
    ...(input.warning ? [`Google Analytics: ${input.warning}`] : []),
    ...(input.source?.retainedRowLimitReached
      ? [
          `Google Analytics: the retained-row limit was reached. ${warningSuffix}`,
        ]
      : []),
    ...(input.source?.qualityWarnings?.map(
      (warning) => `${warning} ${warningSuffix}`,
    ) ?? []),
  ]
  if (!input.source?.dataStatus && !input.warning) {
    warnings.push(
      `Google Analytics: landing-page completeness was not reported. ${warningSuffix}`,
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
    propertyId?: string
    startDate: string
    endDate: string
    limit?: number
  },
  dependencies: LandingPageValueDependencies = defaultDependencies,
): Promise<LandingPageValueResult> {
  const retainedRowLimit = input.limit ?? 5000
  if (!input.propertyId) {
    return {
      values: new Map(),
      source: {
        dataStatus: 'complete',
        returnedRows: 0,
        retainedRowLimit,
        retainedRowLimitReached: false,
        qualityWarnings: [],
      },
    }
  }
  try {
    const result = await dependencies.runGa4Report(input.propertyId, {
      dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
      dimensions: [{ name: 'landingPagePlusQueryString' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'conversions' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: retainedRowLimit,
    })
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
