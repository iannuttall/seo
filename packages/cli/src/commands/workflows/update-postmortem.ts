import { updatePostmortemWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printTable } from '../../utils.js'
import { cliReportArgs } from '../report-options.js'
import { printWorkflow } from './output.js'

export const updatePostmortemCommand = defineCommand({
  meta: {
    name: 'update-postmortem',
    description: 'Agent workflow for Google update winner/loser analysis',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    client: {
      type: 'string',
      description: 'Saved client id or name.',
    },
    ...cliReportArgs(
      ['days', 'recentDays', 'limit', 'includeBrand', 'refresh'],
      {
        days: {
          description: 'Diagnosis window length in days. Defaults to 90.',
        },
        limit: {
          description: 'Maximum winners/losers per segment. Defaults to 20.',
        },
      },
    ),
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await updatePostmortemWorkflow({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printWorkflow(report)
    printTable(
      ['Direction', 'Page', 'Clicks'],
      [
        ...report.output.segments.page.winners.map((item) => [
          'winner',
          item.key,
          item.clickDelta,
        ]),
        ...report.output.segments.page.losers.map((item) => [
          'loser',
          item.key,
          item.clickDelta,
        ]),
      ],
    )
  },
})
