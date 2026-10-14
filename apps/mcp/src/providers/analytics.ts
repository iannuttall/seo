import { runAnalyticsReport } from '../google.ts'

// Search landing pages from Google Analytics, with the caller's Google
// sign-in. Other analytics sources run on the person's machine through
// provider packages, so this server never holds their keys.

export type AnalyticsInput = {
  site: string
  startDate: string
  endDate: string
  searchOnly: boolean
  limit: number
}

type Row = Record<string, string | number | null>
export type AnalyticsResult = { rows: Row[]; notes: string[] }

export function landingPages(
  token: string,
  input: AnalyticsInput,
): Promise<AnalyticsResult> {
  return google(token, input)
}

async function google(token: string, input: AnalyticsInput) {
  const data = (await runAnalyticsReport(token, input.site, {
    dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
    dimensions: [{ name: 'landingPage' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagedSessions' },
      { name: 'keyEvents' },
    ],
    dimensionFilter: input.searchOnly
      ? {
          filter: {
            fieldName: 'sessionDefaultChannelGroup',
            stringFilter: { value: 'Organic Search' },
          },
        }
      : undefined,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: input.limit,
  })) as {
    rows?: {
      dimensionValues: { value: string }[]
      metricValues: { value: string }[]
    }[]
    rowCount?: number
    metadata?: {
      subjectToThresholding?: boolean
      dataLossFromOtherRow?: boolean
    }
  }
  const notes = [
    input.searchOnly
      ? 'Sessions in the Organic Search default channel group.'
      : 'All sessions.',
  ]
  if (data.metadata?.subjectToThresholding) {
    notes.push(
      'Google Analytics applied thresholding; small rows can be hidden.',
    )
  }
  if (data.metadata?.dataLossFromOtherRow) {
    notes.push('Some rows were grouped into (other) by Google Analytics.')
  }
  if ((data.rowCount ?? 0) > input.limit) {
    notes.push(`${data.rowCount} landing pages in total; ${input.limit} shown.`)
  }
  return {
    notes,
    rows: (data.rows ?? []).map((row) => ({
      page: row.dimensionValues[0]?.value ?? '',
      sessions: Number(row.metricValues[0]?.value ?? 0),
      users: Number(row.metricValues[1]?.value ?? 0),
      engaged_sessions: Number(row.metricValues[2]?.value ?? 0),
      key_events: Number(row.metricValues[3]?.value ?? 0),
    })),
  }
}
