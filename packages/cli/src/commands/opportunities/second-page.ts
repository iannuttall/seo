import { secondPage } from '@seo/core'
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
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  formatPosition,
  printActionDetails,
  printLimitedTable,
  printNotes,
  verificationSummary,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { formatContentCheck, formatFetchDiagnostics } from '../shared.js'

export const secondPageCommand = defineCommand({
  meta: {
    name: 'second-page',
    description: 'Find URLs averaging positions above 10 through 20 in GSC',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    ...cliReportArgs([
      'range',
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
    const report = await secondPage({
      site: selection.site,
      range: numberArg(args.days),
      minImpressions: numberArg(args['min-impressions']),
      limit: stringArg(args.limit) ? Number(stringArg(args.limit)) : 10,
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
      ['Eligible pages', formatCount(report.summary.eligiblePages)],
      ['Returned pages', formatCount(report.summary.returnedPages)],
      ['Eligible queries', formatCount(report.summary.eligibleQueries)],
      ['Eligible impressions', formatCount(report.summary.eligibleImpressions)],
      ['Content issues', formatCount(report.summary.contentIssues)],
      ['Technical issues', formatCount(report.summary.technicalIssues)],
      ['Fetch failures', formatCount(report.summary.fetchFailures)],
      ['Brand queries', report.summary.brandFiltering],
      ['Verification', verificationSummary(report)],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)
    if (!report.items.length) {
      process.stdout.write(
        'No average-position candidates matched this report.\n',
      )
      process.stdout.write(`${report.ledgerSummary}\n`)
      return
    }
    printLimitedTable(
      [
        'Query',
        'Template',
        'Pos',
        'Impr',
        'CTR',
        'Queries',
        'Fetch',
        'Check',
        'Action',
      ],
      report.items.map((item) => [
        item.primaryQuery,
        item.template.label,
        item.position.toFixed(1),
        Math.round(item.impressions),
        item.ctr.toFixed(3),
        formatCount(item.queryCount),
        formatFetchDiagnostics(item.fetchDiagnostics),
        formatContentCheck(item.contentVerification?.classification),
        item.recommendation.action,
      ]),
    )
    printActionDetails(
      'Top second-page actions',
      report.items.map((item) => ({
        label: item.primaryQuery,
        context: `${item.template.label}, pos ${formatPosition(item.position)}, ${formatCount(item.impressions)} impressions`,
        action: item.recommendation.action,
      })),
    )
    process.stdout.write(`${report.ledgerSummary}\n`)
  },
})
