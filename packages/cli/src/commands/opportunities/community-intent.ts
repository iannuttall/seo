import { communityIntentReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  printActionDetails,
  printLimitedTable,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'

export const communityIntentCommand = defineCommand({
  meta: {
    name: 'community-intent',
    description: 'Find GSC queries with forum, review, and comparison intent',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    ...cliReportArgs(
      ['days', 'limit', 'minImpressions', 'includeBrand', 'refresh'],
      {
        limit: {
          description: 'Maximum intent queries to print. Defaults to 25.',
        },
        minImpressions: {
          description: 'Minimum query impressions. Defaults to 20.',
        },
        includeBrand: {
          description: 'Include branded queries in community-intent reports.',
        },
        refresh: { description: 'Bypass local GSC cache.' },
      },
    ),
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await communityIntentReport({
      site: selection.site,
      days: numberArg(args.days),
      limit: numberArg(args.limit),
      minImpressions: numberArg(args['min-impressions']),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Property', report.site],
      ['Intent queries', formatCount(report.summary.items)],
      ['Impressions', formatCount(report.summary.totalImpressions)],
      ['Clicks', formatCount(report.summary.totalClicks)],
    ])

    printLimitedTable(
      ['Intent', 'Query', 'Impr', 'Clicks', 'Action'],
      report.items.map((item) => [
        item.intent,
        truncate(item.query, 42),
        formatCount(item.impressions),
        formatCount(item.clicks),
        truncate(item.action, 76),
      ]),
    )
    printActionDetails(
      'Top community-intent actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${item.intent}, ${formatCount(item.impressions)} impressions`,
        action: item.action,
      })),
    )
  },
})
