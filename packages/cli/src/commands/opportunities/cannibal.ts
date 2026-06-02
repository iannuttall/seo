import { cannibalReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import { formatCount, printLimitedTable, truncate } from '../output.js'

export const cannibalCommand = defineCommand({
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
    const report = await cannibalReport({
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
      ['Clusters', formatCount(report.items.length)],
      [
        'Brand queries',
        booleanArg(args['include-brand']) ? 'included' : 'excluded',
      ],
    ])
    printLimitedTable(
      ['Query', 'URLs', 'HHI', 'Top URL', 'Action'],
      report.items.map((item) => {
        const topPage = [...item.pages].sort(
          (a, b) => a.position - b.position,
        )[0]
        return [
          truncate(item.query, 42),
          item.pages.length,
          item.hhi.toFixed(2),
          truncate(topPage?.url ?? '', 56),
          truncate(item.recommendation.action, 72),
        ]
      }),
    )
  },
})
