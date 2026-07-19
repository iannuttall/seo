import { strikingDistance } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  fetchRateArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  formatPosition,
  printActionDetails,
  printLimitedTable,
  printNotes,
  printReportSummary,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { formatContentCheck, formatFetchDiagnostics } from '../shared.js'

function rowCountLabel(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'row' : 'rows'}`
}

export const strikingDistanceCommand = defineCommand({
  meta: {
    name: 'striking-distance',
    description: 'Find query/page rows averaging positions above 10 through 20',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
    },
    ...cliReportArgs([
      'days',
      'minImpressions',
      'limit',
      'includeBrand',
      'verifyContent',
      'verifyLimit',
      'js',
      'fetchConcurrency',
      'fetchIntervalCap',
      'fetchIntervalMs',
      'refresh',
    ]),
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const verifyLimit = numberArg(args['verify-limit'])
    const verifyContent =
      booleanArg(args['verify-content']) === true || verifyLimit !== undefined
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await strikingDistance({
      site: selection.site,
      days: numberArg(args.days),
      minImpressions: numberArg(args['min-impressions']),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      verifyContent,
      verifyLimit,
      js: booleanArg(args.js) ? true : undefined,
      rate: fetchRateArg(args),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printReportSummary({
      title: 'Striking-distance opportunities',
      target: report.site,
      status: report.source.possiblyTruncated ? 'unknown' : 'info',
      summary: report.summary.verdict,
      metrics: [
        {
          label: 'Eligible rows',
          value: formatCount(report.summary.eligibleRows),
        },
        {
          label: 'Returned rows',
          value: formatCount(report.summary.returnedRows),
        },
        { label: 'Template groups', value: formatCount(report.summary.groups) },
        {
          label: 'Impressions',
          value: formatCount(report.summary.eligibleImpressions),
        },
        { label: 'Brand queries', value: report.summary.brandFiltering },
        {
          label: 'Verification',
          value: report.verification.requested ? 'Requested' : 'Off',
        },
        { label: 'Evidence', value: report.dataStatus },
      ],
    })
    printNotes('Why this matters', [
      'These rows have a GSC average position above 10 and at most 20. Treat them as candidates for investigation, not guaranteed page-two rankings.',
      'Groups use all eligible rows. A shared-template label is only a candidate until recurring evidence is verified across distinct URLs.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)

    if (report.groups.length) {
      printLimitedTable(
        ['Group', 'Rows', 'URLs', 'Impr', 'Avg pos', 'Scope', 'Action'],
        report.groups.map((group) => [
          truncate(group.label, 36),
          formatCount(group.rowCount),
          formatCount(group.uniqueUrls),
          formatCount(group.totalImpressions),
          formatPosition(group.impressionWeightedPosition),
          group.actionScope,
          truncate(group.recommendation.action, 72),
        ]),
      )
      printActionDetails(
        'Top striking-distance group actions',
        report.groups.map((group) => ({
          label: group.label,
          context: `${rowCountLabel(group.rowCount)}, ${formatCount(group.totalImpressions)} impressions`,
          action: group.recommendation.action,
        })),
      )
    }

    if (!report.items.length) {
      process.stdout.write(
        'No striking-distance opportunities matched these filters.\n',
      )
      return
    }

    printLimitedTable(
      [
        'Query',
        'Template',
        'URL',
        'Impr',
        'CTR',
        'Pos',
        'Score',
        'Fetch',
        'Check',
        'Action',
      ],
      report.items.map((item) => [
        truncate(item.query, 36),
        truncate(item.template.label, 24),
        truncate(item.url, 48),
        formatCount(item.impressions),
        formatPercent(item.ctr),
        formatPosition(item.position),
        item.priority.score,
        formatFetchDiagnostics(item.contentVerification?.fetchDiagnostics),
        formatContentCheck(item.contentVerification?.classification),
        truncate(item.recommendation.action, 72),
      ]),
    )
    printActionDetails(
      'Top striking-distance actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${item.template.label}, pos ${formatPosition(item.position)}, ${formatCount(item.impressions)} impressions`,
        action: item.recommendation.action,
      })),
    )
  },
})
