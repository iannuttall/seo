import { ga4RowsToObjects, runGa4Report } from '../../ga4/client.js'

export type LandingPageValue = {
  sessions: number
  totalUsers: number
  conversions: number
}

export type LandingPageValueSource = {
  returnedRows: number
  availableRows?: number
  retainedRowLimit: number
  retainedRowLimitReached: boolean
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

export function landingValueForUrl(
  values: Map<string, LandingPageValue>,
  url: string,
): LandingPageValue | undefined {
  return values.get(urlPath(url))
}

export async function fetchLandingPageValues(input: {
  propertyId?: string
  startDate: string
  endDate: string
  limit?: number
}): Promise<{
  values: Map<string, LandingPageValue>
  source?: LandingPageValueSource
  warning?: string
}> {
  const retainedRowLimit = input.limit ?? 5000
  if (!input.propertyId) {
    return {
      values: new Map(),
      source: {
        returnedRows: 0,
        retainedRowLimit,
        retainedRowLimitReached: false,
      },
    }
  }
  try {
    const result = await runGa4Report(input.propertyId, {
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
    const values = new Map<string, LandingPageValue>()
    const rows = ga4RowsToObjects(result)
    for (const row of rows) {
      const path = normalizePath(row.landingPagePlusQueryString ?? '')
      if (!path) continue
      values.set(path, {
        sessions: Number(row.sessions ?? 0),
        totalUsers: Number(row.totalUsers ?? 0),
        conversions: Number(row.conversions ?? 0),
      })
    }
    const availableRows = result.rowCount
    return {
      values,
      source: {
        returnedRows: rows.length,
        ...(availableRows !== undefined ? { availableRows } : {}),
        retainedRowLimit,
        retainedRowLimitReached:
          (availableRows !== undefined && availableRows > rows.length) ||
          rows.length >= retainedRowLimit,
      },
    }
  } catch (error) {
    return {
      values: new Map(),
      source: {
        returnedRows: 0,
        retainedRowLimit,
        retainedRowLimitReached: false,
      },
      warning: error instanceof Error ? error.message : String(error),
    }
  }
}
