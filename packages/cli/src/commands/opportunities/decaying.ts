import { decayingReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  formatPosition,
  printLimitedTable,
  truncate,
} from '../output.js'

export const decayingCommand = defineCommand({
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
    const report = await decayingReport({
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
      ['Decaying queries', formatCount(report.items.length)],
      [
        'Brand queries',
        booleanArg(args['include-brand']) ? 'included' : 'excluded',
      ],
    ])
    printLimitedTable(
      ['Query', 'Cause', 'Clicks', 'Impr', 'CTR', 'Pos', 'Action'],
      report.items.map((item) => [
        truncate(item.query, 42),
        item.diagnosis.replaceAll('_', ' '),
        `${formatCount(item.previous.clicks)} -> ${formatCount(item.current.clicks)}`,
        `${formatCount(item.previous.impressions)} -> ${formatCount(item.current.impressions)}`,
        `${formatPercent(item.previous.ctr)} -> ${formatPercent(item.current.ctr)}`,
        `${formatPosition(item.previous.position)} -> ${formatPosition(item.current.position)}`,
        truncate(item.recommendation.action, 72),
      ]),
    )
  },
})
