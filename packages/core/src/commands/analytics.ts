import {
  type GoogleFetch,
  listAnalyticsAccounts,
  runAnalyticsReport,
} from '../google/api.js'
import type { Detail } from './present.js'
import { PAGE_SIZE, rowsText } from './rows.js'
import { dateWindow } from './shared.js'
import type { GoogleAccount } from './sites.js'
import { CommandError, type CommandResult } from './types.js'

// The sign-in that can read a Google Analytics property.
export async function analyticsSignIn(
  accounts: GoogleAccount[],
  property: string,
  signIn: string,
): Promise<GoogleFetch> {
  const only = accounts.length === 1 ? accounts[0] : undefined
  if (only) return only.google
  const found = await Promise.all(
    accounts.map(async (account) => {
      const summaries = await listAnalyticsAccounts(account.google, {
        signIn,
      }).catch(() => [])
      return summaries.some((summary) =>
        summary.propertySummaries.some(
          (item) => item.property === `properties/${property}`,
        ),
      )
        ? account
        : null
    }),
  )
  const account = found.find(Boolean)
  if (account) return account.google
  throw new CommandError(
    'NO_ACCESS',
    `No connected Google account can read Google Analytics property ${property}. Call seo_sites to list the properties.`,
  )
}

// Landing pages for visits from search, from Google Analytics. Metric names
// stay Google Analytics' own: sessions, users, engaged sessions, key events.

export type AnalyticsRowsInput = {
  // The numeric Google Analytics property id.
  property: string
  startDate?: string
  endDate?: string
  detail?: Detail
  offset?: number
}

type ReportRows = {
  rows?: {
    dimensionValues: { value: string }[]
    metricValues: { value: string }[]
  }[]
  rowCount?: number
  metadata?: { subjectToThresholding?: boolean; dataLossFromOtherRow?: boolean }
}

export async function runAnalyticsRows(
  input: AnalyticsRowsInput,
  google: GoogleFetch,
  options: { signIn: string; call: (offset: number) => string },
): Promise<CommandResult> {
  const range = dateWindow(input, 28)
  const offset = input.offset ?? 0
  const limit = Math.min(1000, offset + PAGE_SIZE)
  const data = await runAnalyticsReport<ReportRows>(
    google,
    input.property,
    {
      dateRanges: [range],
      dimensions: [{ name: 'landingPage' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'engagedSessions' },
        { name: 'keyEvents' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionDefaultChannelGroup',
          stringFilter: { value: 'Organic Search' },
        },
      },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit,
    },
    options,
  )
  const notes = ['Sessions in the Organic Search default channel group.']
  if (data.metadata?.subjectToThresholding) {
    notes.push(
      'Google Analytics applied thresholding; small rows can be hidden.',
    )
  }
  if (data.metadata?.dataLossFromOtherRow) {
    notes.push('Some rows were grouped into (other) by Google Analytics.')
  }
  if ((data.rowCount ?? 0) > limit) {
    notes.push(`${data.rowCount} landing pages in total; ${limit} read.`)
  }
  const rows = (data.rows ?? []).map((row) => ({
    page: row.dimensionValues[0]?.value ?? '',
    sessions: Number(row.metricValues[0]?.value ?? 0),
    users: Number(row.metricValues[1]?.value ?? 0),
    engaged_sessions: Number(row.metricValues[2]?.value ?? 0),
    key_events: Number(row.metricValues[3]?.value ?? 0),
  }))
  return {
    text: rowsText({
      title: `Google Analytics property ${input.property}: search landing pages, ${range.startDate} to ${range.endDate}.`,
      rows,
      offset,
      limit: PAGE_SIZE,
      detail: input.detail ?? 'summary',
      notes,
      more: options.call,
    }),
    data: {
      range,
      total: rows.length,
      offset,
      rows: rows.slice(offset, offset + PAGE_SIZE),
    },
  }
}
