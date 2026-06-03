import { strikingDistance } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  fetchRateArg,
  jsonFlag,
  numberArg,
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
import { formatContentCheck, formatFetchDiagnostics } from '../shared.js'

function rowCountLabel(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'row' : 'rows'}`
}

export const strikingDistanceCommand = defineCommand({
  meta: {
    name: 'striking-distance',
    description: 'Find position 11-20 query/page opportunities',
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
      client: stringArg(args.client),
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
    printKeyValue([
      ['Site', report.site],
      ['Opportunities', formatCount(report.summary.opportunities)],
      ['Template groups', formatCount(report.summary.groups)],
      ['Impressions', formatCount(report.summary.totalImpressions)],
      ['Brand queries', report.summary.brandFiltering],
      ['Verification', report.verification.requested ? 'requested' : 'off'],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'These rows already rank in positions 11-20, so small relevance and internal-link improvements can move them onto page one.',
      'Grouped actions show whether the work is a one-page edit or a shared template/internal-link fix.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)

    if (report.groups.length) {
      printLimitedTable(
        ['Group', 'Rows', 'Impr', 'Best pos', 'Avg pos', 'Action'],
        report.groups.map((group) => [
          truncate(group.label, 36),
          formatCount(group.count),
          formatCount(group.totalImpressions),
          formatPosition(group.bestPosition),
          formatPosition(group.averagePosition),
          truncate(group.recommendation, 72),
        ]),
      )
      printActionDetails(
        'Top striking-distance group actions',
        report.groups.map((group) => ({
          label: group.label,
          context: `${rowCountLabel(group.count)}, ${formatCount(group.totalImpressions)} impressions`,
          action: group.recommendation,
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
        item.opportunityScore,
        formatFetchDiagnostics(item.contentVerification?.fetchDiagnostics),
        formatContentCheck(item.contentVerification?.classification),
        truncate(item.action, 72),
      ]),
    )
    printActionDetails(
      'Top striking-distance actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${item.template.label}, pos ${formatPosition(item.position)}, ${formatCount(item.impressions)} impressions`,
        action: item.action,
      })),
    )
  },
})
