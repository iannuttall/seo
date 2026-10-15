import { ga4RowsToObjects, runGa4Report } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  jsonBodyArg,
  jsonFlag,
  stringArg,
} from '../../../args.js'
import { requireGoogleAnalyticsProperty } from '../../../selection.js'
import { printJson, printTable } from '../../../utils.js'
import { printReportSummary } from '../../output.js'

export const googleAnalyticsReportCommand = defineCommand({
  meta: {
    name: 'report',
    description: 'Run a Google Analytics report',
  },
  args: {
    property: {
      type: 'string',
      description:
        'Numeric Google Analytics property ID. Run `seo analytics google properties` to list them.',
    },
    account: {
      type: 'string',
      description: 'Saved Google account email.',
    },
    'start-date': { type: 'string', default: '28daysAgo' },
    'end-date': { type: 'string', default: 'yesterday' },
    dimensions: { type: 'string', default: 'landingPage' },
    metrics: { type: 'string', default: 'sessions,totalUsers,eventCount' },
    limit: { type: 'string', default: '25' },
    body: { type: 'string' },
    'body-file': { type: 'string' },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass the local Google Analytics cache.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const property = requireGoogleAnalyticsProperty(stringArg(args.property))
    const body =
      (await jsonBodyArg(args.body, args['body-file'])) ??
      ({
        dateRanges: [
          {
            startDate: stringArg(args['start-date']),
            endDate: stringArg(args['end-date']),
          },
        ],
        dimensions: (csvArg(args.dimensions) ?? []).map((name) => ({ name })),
        metrics: (csvArg(args.metrics) ?? []).map((name) => ({ name })),
        limit: stringArg(args.limit),
      } as Record<string, unknown>)
    const result = await runGa4Report(property, body as never, {
      refresh: booleanArg(args.refresh),
      accountEmail: stringArg(args.account),
    })
    if (json) {
      printJson(result)
      return
    }
    const rows = ga4RowsToObjects(result)
    printReportSummary({
      title: 'Google Analytics report',
      target: property,
      status: 'info',
      summary: `${result.rowCount ?? rows.length} rows returned for the requested dimensions and metrics.`,
      metrics: [
        { label: 'Rows', value: result.rowCount ?? rows.length },
        { label: 'Displayed', value: Math.min(rows.length, 25) },
      ],
    })
    if (rows.length) {
      const headings = Object.keys(rows[0] ?? {})
      printTable(
        headings,
        rows
          .slice(0, 25)
          .map((row) => headings.map((heading) => row[heading] ?? '')),
      )
    }
  },
})
