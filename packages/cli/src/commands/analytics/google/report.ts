import {
  ga4RowsToObjects,
  googleAnalyticsPropertyId,
  runGa4Report,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  jsonBodyArg,
  jsonFlag,
  projectArg,
  stringArg,
} from '../../../args.js'
import {
  resolveClient,
  resolveGoogleAnalyticsProperty,
} from '../../../selection.js'
import { printJson, printKeyValue, printTable } from '../../../utils.js'

type GoogleAnalyticsPropertySelectionDependencies = {
  resolveClient: typeof resolveClient
  resolveGoogleAnalyticsProperty: typeof resolveGoogleAnalyticsProperty
}

export async function resolveGoogleAnalyticsReportProperty(
  input: {
    property?: string
    project?: string
    options?: { json?: boolean }
  },
  dependencies: GoogleAnalyticsPropertySelectionDependencies = {
    resolveClient,
    resolveGoogleAnalyticsProperty,
  },
): Promise<string> {
  if (input.property) {
    return dependencies.resolveGoogleAnalyticsProperty({
      property: input.property,
      options: input.options,
    })
  }

  const client = await dependencies.resolveClient({
    client: input.project,
    options: input.options,
  })
  return dependencies.resolveGoogleAnalyticsProperty({
    property: googleAnalyticsPropertyId(client),
    options: input.options,
  })
}

export const googleAnalyticsReportCommand = defineCommand({
  meta: {
    name: 'report',
    description: 'Run a Google Analytics report',
  },
  args: {
    property: {
      type: 'string',
      description:
        'Google Analytics property ID. If omitted in a terminal, choose one.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description:
        'Saved project id or name with an optional Google Analytics property.',
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
    const property = await resolveGoogleAnalyticsReportProperty({
      property: stringArg(args.property),
      project: projectArg(args),
      options: { json },
    })
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
    })
    if (json) {
      printJson(result)
      return
    }
    const rows = ga4RowsToObjects(result)
    printKeyValue([
      ['Property', property],
      ['Rows', String(result.rowCount ?? rows.length)],
    ])
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
