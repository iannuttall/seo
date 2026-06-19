import { decayingReport } from '@seo/core'
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

function formatMaybePosition(value: number): string {
  return value > 0 ? formatPosition(value) : 'n/a'
}

export const decayingCommand = defineCommand({
  meta: {
    name: 'decaying',
    description: 'Find query/page rows losing clicks between two GSC windows',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    ...cliReportArgs(['includeBrand']),
    'min-drop-pct': {
      type: 'string',
      description: 'Minimum click drop percentage. Defaults to 20.',
    },
    'min-previous-clicks': {
      type: 'string',
      description:
        'Minimum previous-window clicks for a query/page row. Defaults to 2.',
    },
    'min-click-loss': {
      type: 'string',
      description: 'Minimum absolute click loss. Defaults to 1.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await decayingReport({
      site: selection.site,
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      minDropPct: numberArg(args['min-drop-pct']),
      minPreviousClicks: numberArg(args['min-previous-clicks']),
      minClickLoss: numberArg(args['min-click-loss']),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Decaying query/page rows', formatCount(report.summary.rows)],
      ['Decay clusters', formatCount(report.summary.groups)],
      ['Lost clicks', formatCount(report.summary.totalClickLoss)],
      ['Brand queries', report.summary.brandFiltering],
      ['Min drop', `${report.filters.minDropPct}%`],
      ['Min previous clicks', formatCount(report.filters.minPreviousClicks)],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'Decay shows query/page rows that have already worked but are losing clicks, so recovery is usually faster than creating new content.',
      'The cause column separates CTR loss, ranking loss, visibility loss, and demand/impression loss so the action is not one-size-fits-all.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)

    if (!report.items.length) {
      return
    }

    if (report.groups.length) {
      printLimitedTable(
        ['Cluster', 'Rows', 'Lost clicks', 'Drop', 'Sample query', 'Action'],
        report.groups.map((group) => [
          truncate(group.label, 42),
          formatCount(group.count),
          formatCount(group.totalClickLoss),
          `${group.averageDropPct.toFixed(1)}%`,
          truncate(group.sampleQueries[0] ?? '-', 40),
          truncate(group.recommendation, 72),
        ]),
      )
      printActionDetails(
        'Top decay cluster actions',
        report.groups.map((group) => ({
          label: group.label,
          context: `${formatCount(group.count)} rows, ${formatCount(group.totalClickLoss)} lost clicks`,
          action: group.recommendation,
        })),
      )
    }

    printLimitedTable(
      [
        'Query',
        'Template',
        'URL',
        'Cause',
        'Lost',
        'Clicks',
        'Impr',
        'CTR',
        'Pos',
        'Action',
      ],
      report.items.map((item) => [
        truncate(item.query, 32),
        truncate(item.template.label, 26),
        truncate(item.url, 44),
        item.diagnosis.replaceAll('_', ' '),
        formatCount(item.clickLoss),
        `${formatCount(item.previous.clicks)} -> ${formatCount(item.current.clicks)}`,
        `${formatCount(item.previous.impressions)} -> ${formatCount(item.current.impressions)}`,
        `${formatPercent(item.previous.ctr)} -> ${formatPercent(item.current.ctr)}`,
        `${formatMaybePosition(item.previous.position)} -> ${formatMaybePosition(item.current.position)}`,
        truncate(item.recommendation.action, 64),
      ]),
    )
    printActionDetails(
      'Top decay actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${item.template.label}, ${formatCount(item.clickLoss)} lost clicks`,
        action: item.recommendation.action,
      })),
    )
  },
})
