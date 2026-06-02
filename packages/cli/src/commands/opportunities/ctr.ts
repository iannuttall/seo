import { ctrUnderperformersReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  formatPosition,
  printActionDetails,
  printLimitedTable,
  truncate,
} from '../output.js'

export const ctrUnderperformersCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await ctrUnderperformersReport({
      site: selection.site,
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Underperformers', formatCount(report.items.length)],
      [
        'Brand queries',
        booleanArg(args['include-brand']) ? 'included' : 'excluded',
      ],
    ])
    printLimitedTable(
      ['Query', 'URL', 'Pos', 'Impr', 'CTR', 'Expected', 'Action'],
      report.items.map((item) => [
        truncate(item.query, 36),
        truncate(item.url, 48),
        formatPosition(item.position),
        formatCount(item.impressions),
        formatPercent(item.actualCtr),
        formatPercent(item.expectedCtr),
        truncate(item.recommendation.action, 72),
      ]),
    )
    printActionDetails(
      'Top CTR actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${formatCount(item.impressions)} impressions, ${formatPercent(item.actualCtr)} CTR`,
        action: item.recommendation.action,
      })),
    )
  },
})
