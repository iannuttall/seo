import { secondPage } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  fetchRateArg,
  jsonFlag,
  numberArg,
  stringArg,
  projectArg,
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
    description:
      'Find position 11-20 URLs and check whether pages cover the query',
  },
  args: {
    site: { type: 'string' },
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
    json: { type: 'boolean', default: false },
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
      ['Opportunities', formatCount(report.summary.opportunities)],
      ['Templates', formatCount(report.summary.templates)],
      ['Impressions', formatCount(report.summary.impressions)],
      ['Content issues', formatCount(report.summary.contentIssues)],
      ['Brand queries', report.summary.brandFiltering],
      ['Verification', verificationSummary(report)],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)
    if (!report.items.length) {
      process.stdout.write(
        'No second-page opportunities matched this report.\n',
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
        'Coverage',
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
        `${item.coverage.inTitleExact ? 'T' : '-'}${item.coverage.inH1 ? 'H' : '-'}${item.coverage.inMeta ? 'M' : '-'}${item.coverage.inFirst100Words ? 'F' : '-'}`,
        formatFetchDiagnostics(item.fetchDiagnostics),
        formatContentCheck(item.contentVerification?.classification),
        item.recommendations[0]?.action ??
          'Review the ranking URL before creating a new page.',
      ]),
    )
    printActionDetails(
      'Top second-page actions',
      report.items.map((item) => ({
        label: item.primaryQuery,
        context: `${item.template.label}, pos ${formatPosition(item.position)}, ${formatCount(item.impressions)} impressions`,
        action: item.recommendations[0]?.action ?? '',
      })),
    )
    process.stdout.write(`${report.ledgerSummary}\n`)
  },
})
