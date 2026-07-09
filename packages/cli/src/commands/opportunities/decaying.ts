import { decayingReport, SeoError } from '@seo/core'
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
    ...cliReportArgs(['days', 'limit', 'includeBrand', 'refresh']),
    comparison: {
      type: 'string',
      description: 'Comparison: previous-period or year-over-year.',
    },
    'brand-terms': {
      type: 'string',
      description: 'Comma-separated brand terms to exclude.',
    },
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
    const refresh = booleanArg(args.refresh)
    const comparison = stringArg(args.comparison)
    const days = strictNumberArg(args.days, '--days')
    const limit = strictNumberArg(args.limit, '--limit')
    const minDropPct = strictNumberArg(args['min-drop-pct'], '--min-drop-pct')
    const minPreviousClicks = strictNumberArg(
      args['min-previous-clicks'],
      '--min-previous-clicks',
    )
    const minClickLoss = strictNumberArg(
      args['min-click-loss'],
      '--min-click-loss',
    )
    if (
      comparison !== undefined &&
      comparison !== 'previous-period' &&
      comparison !== 'year-over-year'
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        '--comparison must be previous-period or year-over-year.',
      )
    }
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh },
    })
    const report = await decayingReport({
      site: selection.site,
      days,
      limit,
      comparison,
      brandTerms: [
        ...(selection.client?.brandTerms ?? []),
        ...(csvArg(args['brand-terms']) ?? []),
      ],
      includeBrand: booleanArg(args['include-brand']),
      minDropPct,
      minPreviousClicks,
      minClickLoss,
      refresh,
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Status', report.dataStatus],
      ['Comparison', report.comparison],
      [
        'Observed query/page declines',
        formatCount(report.summary.returnedRows),
      ],
      ['Eligible declines', formatCount(report.summary.eligibleRows)],
      ['Decay clusters', formatCount(report.summary.groups)],
      [
        'Eligible observed click decline',
        formatCount(report.summary.observedRetainedQueryClickLoss),
      ],
      [
        'Returned observed click decline',
        formatCount(report.summary.returnedObservedRetainedQueryClickLoss),
      ],
      ['Brand queries', report.summary.brandFiltering],
      ['Min drop', `${report.filters.minDropPct}%`],
      ['Min previous clicks', formatCount(report.filters.minPreviousClicks)],
      ['GSC completeness', report.source.completeness],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'This report compares retained query/page rows and only counts declines observed in both windows.',
      'Position, CTR, and impression movements are signals for investigation, not proof of cause.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)
    printNotes('Warnings', report.warnings)

    if (!report.items.length) {
      return
    }

    if (report.groups.length) {
      printLimitedTable(
        ['Cluster', 'Rows', 'Observed loss', 'Drop', 'Sample query', 'Action'],
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
          context: `${formatCount(group.count)} retained rows, ${formatCount(group.totalClickLoss)} observed click decline`,
          action: group.recommendation,
        })),
      )
    }

    printLimitedTable(
      [
        'Query',
        'Template',
        'URL',
        'Signals',
        'Decline',
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
        item.signals.join(', '),
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
        context: `${item.template.label}, ${formatCount(item.clickLoss)} fewer observed clicks`,
        action: item.recommendation.action,
      })),
    )
  },
})
