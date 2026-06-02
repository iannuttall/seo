import { cannibalReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  printActionDetails,
  printLimitedTable,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'

export const cannibalCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    ...cliReportArgs(['includeBrand', 'minImpressions'], {
      minImpressions: {
        description: 'Minimum query impressions. Defaults to 50.',
      },
    }),
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
      minImpressions: numberArg(args['min-impressions']),
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
      ['Suppressed', formatCount(report.suppressed.length)],
      [
        'Brand queries',
        booleanArg(args['include-brand']) ? 'included' : 'excluded',
      ],
    ])
    printLimitedTable(
      ['Query', 'URLs', 'Template', 'HHI', 'Owner', 'Action'],
      report.items.map((item) => [
        truncate(item.query, 42),
        item.pages.length,
        truncate(item.template?.label ?? 'mixed', 24),
        item.hhi.toFixed(2),
        truncate(item.ownerUrl, 56),
        truncate(item.recommendation.action, 72),
      ]),
    )
    printActionDetails(
      'Top cannibalisation actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${item.pages.length} URLs, owner ${truncate(item.ownerUrl, 64)}`,
        action: item.recommendation.action,
      })),
    )
  },
})
