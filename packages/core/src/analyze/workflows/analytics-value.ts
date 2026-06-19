import { ga4RowsToObjects, runGa4Report } from '../../ga4/client.js'

export type LandingPageValue = {
  sessions: number
  totalUsers: number
  conversions: number
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
  warning?: string
}> {
  if (!input.propertyId) return { values: new Map() }
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
      limit: input.limit ?? 5000,
    })
    const values = new Map<string, LandingPageValue>()
    for (const row of ga4RowsToObjects(result)) {
      const path = normalizePath(row.landingPagePlusQueryString ?? '')
      if (!path) continue
      values.set(path, {
        sessions: Number(row.sessions ?? 0),
        totalUsers: Number(row.totalUsers ?? 0),
        conversions: Number(row.conversions ?? 0),
      })
    }
    return { values }
  } catch (error) {
    return {
      values: new Map(),
      warning: error instanceof Error ? error.message : String(error),
    }
  }
}
