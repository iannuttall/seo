import { communityIntentReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  jsonFlag,
  projectArg,
  strictNumberArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  printActionDetails,
  printLimitedTable,
  printNotes,
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
    'start-date': {
      type: 'string',
      description: 'Exact GSC start date (YYYY-MM-DD). Use with --end-date.',
    },
    'end-date': {
      type: 'string',
      description: 'Exact GSC end date (YYYY-MM-DD). Use with --start-date.',
    },
    'max-rows': {
      type: 'string',
      description: 'Maximum retained GSC query rows. Defaults to 50000.',
    },
    'brand-terms': {
      type: 'string',
      description: 'Comma-separated brand terms to exclude.',
    },
    ...cliReportArgs(
      ['days', 'limit', 'minImpressions', 'includeBrand', 'refresh'],
      {
        days: {
          description: 'GSC lookback within the current 16-month retention.',
        },
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
      days: strictNumberArg(args.days, '--days'),
      startDate: stringArg(args['start-date']),
      endDate: stringArg(args['end-date']),
      limit: strictNumberArg(args.limit, '--limit'),
      minImpressions: strictNumberArg(
        args['min-impressions'],
        '--min-impressions',
      ),
      maxRows: strictNumberArg(args['max-rows'], '--max-rows'),
      brandTerms: [
        ...(selection.client?.brandTerms ?? []),
        ...(csvArg(args['brand-terms']) ?? []),
      ],
      includeBrand: booleanArg(args['include-brand']),
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Property', report.site],
      ['Status', report.dataStatus],
      ['Verdict', report.summary.verdict],
      ['Classified queries', formatCount(report.summary.classifiedQueries)],
      ['Returned queries', formatCount(report.summary.returnedQueries)],
      ['Returned impressions', formatCount(report.summary.returnedImpressions)],
      ['Returned clicks', formatCount(report.summary.returnedClicks)],
      ['GSC completeness', report.source.completeness],
    ])

    printLimitedTable(
      ['Intent', 'Query', 'Impr', 'Clicks', 'Confidence', 'Action'],
      report.items.map((item) => [
        item.intent,
        truncate(item.query, 42),
        formatCount(item.impressions),
        formatCount(item.clicks),
        item.confidence,
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
    printNotes('Report caveats', report.caveats)
    printNotes('Warnings', report.warnings)
  },
})
