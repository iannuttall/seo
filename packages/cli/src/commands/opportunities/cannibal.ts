import { cannibalReport } from '@seo/core'
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
import { printJson } from '../../utils.js'
import {
  formatCount,
  printActionDetails,
  printLimitedTable,
  printNotes,
  printReportSummary,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'

export const cannibalCommand = defineCommand({
  meta: {
    name: 'cannibal',
    description: 'Find queries with material exposure across multiple URLs',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    ...cliReportArgs(
      ['days', 'limit', 'includeBrand', 'minImpressions', 'refresh'],
      {
        minImpressions: {
          description: 'Minimum query impressions. Defaults to 50.',
        },
      },
    ),
    'brand-terms': {
      type: 'string',
      description: 'Comma-separated brand terms to exclude.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const refresh = booleanArg(args.refresh)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh },
    })
    const report = await cannibalReport({
      site: selection.site,
      days: strictNumberArg(args.days, '--days'),
      limit: strictNumberArg(args.limit, '--limit'),
      minImpressions: strictNumberArg(
        args['min-impressions'],
        '--min-impressions',
      ),
      brandTerms: [
        ...(selection.client?.brandTerms ?? []),
        ...(csvArg(args['brand-terms']) ?? []),
      ],
      includeBrand: booleanArg(args['include-brand']),
      refresh,
    })
    if (json) {
      printJson(report)
      return
    }
    printReportSummary({
      title: 'Cannibalisation report',
      target: report.site,
      status: report.dataStatus === 'complete' ? 'info' : 'unknown',
      summary: report.summary.verdict,
      metrics: [
        { label: 'Evidence', value: report.dataStatus },
        {
          label: 'Range',
          value: `${report.range.startDate} to ${report.range.endDate}`,
        },
        {
          label: 'Eligible',
          value: formatCount(report.summary.eligibleClusters),
        },
        {
          label: 'Returned',
          value: formatCount(report.summary.returnedClusters),
        },
        {
          label: 'Suppressed brand queries',
          value: formatCount(report.summary.suppressedQueries),
        },
        { label: 'GSC completeness', value: report.source.completeness },
        {
          label: 'Brand queries',
          value: booleanArg(args['include-brand']) ? 'included' : 'excluded',
        },
      ],
    })
    printLimitedTable(
      ['Query', 'URLs', 'Property impr', 'Exposure', 'HHI', 'Review first'],
      report.items.map((item) => [
        truncate(item.query, 42),
        item.pages.length,
        item.propertyImpressions === undefined
          ? 'n/a'
          : formatCount(item.propertyImpressions),
        formatCount(item.pageExposureImpressions),
        item.hhi.toFixed(2),
        truncate(item.suggestedOwnerUrl, 56),
      ]),
    )
    printActionDetails(
      'Top cannibalisation actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${item.pages.length} material URLs; first review ${truncate(item.suggestedOwnerUrl, 64)}`,
        action: item.recommendation.action,
      })),
    )
    printNotes('Report caveats', report.caveats)
    printNotes('Provider usage', [report.ledgerSummary])
  },
})
