import { ctrUnderperformersReport } from '@seo/core'
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
  formatPercent,
  formatPosition,
  printActionDetails,
  printLimitedTable,
  printNotes,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'

export const ctrUnderperformersCommand = defineCommand({
  meta: {
    name: 'ctr-underperformers',
    description:
      'Find high-impression queries with weak CTR for their position',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    ...cliReportArgs(['includeBrand', 'minImpressions'], {
      minImpressions: {
        description: 'Minimum query impressions. Defaults to 200.',
      },
    }),
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await ctrUnderperformersReport({
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
      ['Underperformers', formatCount(report.summary.underperformers)],
      [
        'Estimated click gap',
        formatCount(report.summary.estimatedClickShortfall),
      ],
      ['Brand queries', report.summary.brandFiltering],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'These queries already have visibility; the fastest win is usually better SERP framing, not new content.',
      'Start with high-impression rows where actual CTR is far below the expected CTR for that ranking position.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)
    printLimitedTable(
      ['Query', 'URL', 'Pos', 'Impr', 'CTR', 'Expected', 'Gap', 'Action'],
      report.items.map((item) => [
        truncate(item.query, 36),
        truncate(item.url, 48),
        formatPosition(item.position),
        formatCount(item.impressions),
        formatPercent(item.actualCtr),
        formatPercent(item.expectedCtr),
        formatCount(item.clickShortfall),
        truncate(item.recommendation.action, 72),
      ]),
    )
    printActionDetails(
      'Top CTR actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${formatCount(item.clickShortfall)} click gap, ${formatPercent(item.actualCtr)} CTR`,
        action: item.recommendation.action,
      })),
    )
  },
})
