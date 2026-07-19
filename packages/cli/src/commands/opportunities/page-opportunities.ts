import { pageOpportunitiesReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  defaultTrueBooleanArg,
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
  printActionDetails,
  printLimitedTable,
  printNotes,
  printReportSummary,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { formatFetchDiagnostics } from '../shared.js'

export const pageOpportunitiesCommand = defineCommand({
  meta: {
    name: 'page-opportunities',
    description: 'Find first-party traffic growth opportunities for one URL',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    url: { type: 'string', required: true },
    ...cliReportArgs(
      ['days', 'limit', 'minImpressions', 'includeBrand', 'js', 'refresh'],
      {
        limit: {
          description: 'Maximum page queries to inspect. Defaults to 25.',
        },
        minImpressions: {
          description: 'Minimum query impressions. Defaults to 10.',
        },
        includeBrand: {
          description: 'Include branded queries in page opportunity reports.',
        },
        js: {
          description: 'Force JavaScript rendering for page extraction.',
        },
        refresh: {
          description: 'Bypass local GSC and HTTP cache.',
        },
      },
    ),
    'verify-content': defaultTrueBooleanArg(
      'Fetch the page for title/H1/body checks. Defaults to true.',
      'Skip fetching the page for title/H1/body checks.',
    ),
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await pageOpportunitiesReport({
      site: selection.site,
      url: stringArg(args.url) ?? '',
      days: numberArg(args.days),
      limit: numberArg(args.limit),
      minImpressions: numberArg(args['min-impressions']),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      verifyContent: booleanArg(args['verify-content']) !== false,
      js: booleanArg(args.js) ? true : 'auto',
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }

    printReportSummary({
      title: 'Page opportunities',
      target: report.url,
      status: report.verification.status === 'failed' ? 'unknown' : 'info',
      summary: report.summary.verdict,
      metrics: [
        { label: 'Title', value: report.page?.title ?? 'Not fetched' },
        {
          label: 'Fetch',
          value: formatFetchDiagnostics(report.page?.fetchDiagnostics),
        },
        { label: 'Verification', value: report.verification.status },
        {
          label: 'Rows',
          value: `${formatCount(report.selection.returnedRows)} returned / ${formatCount(report.selection.eligibleRows)} eligible / ${formatCount(report.selection.sourceRows)} source`,
        },
        { label: 'Queries', value: formatCount(report.summary.queries) },
        {
          label: 'Impressions',
          value: formatCount(report.summary.impressions),
        },
        {
          label: 'Opportunities',
          value: formatCount(report.summary.opportunities),
        },
        {
          label: 'CTR shortfall',
          value: formatCount(report.summary.estimatedCtrClickShortfall),
        },
        { label: 'Focus', value: report.summary.focus },
        { label: 'Evidence', value: report.dataStatus },
      ],
    })
    printNotes('Why this matters', [
      'This report starts from queries where this exact URL already has impressions, so recommendations stay tied to first-party demand.',
      'Content verification separates body gaps from title/meta framing issues, which helps avoid adding copy when the page already covers the query.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)

    if (!report.items.length) {
      process.stdout.write(
        report.dataStatus === 'empty'
          ? 'No GSC query rows found for this exact URL.\n'
          : 'GSC rows were found, but none met the report criteria.\n',
      )
      return
    }

    printLimitedTable(
      [
        'Type',
        'Query',
        'Evidence',
        'Pos',
        'CTR',
        'Expected',
        'Impr',
        'Shortfall',
        'Action',
      ],
      report.items.map((item) => [
        item.opportunityType,
        truncate(item.query, 38),
        item.verification.signals.length
          ? item.verification.signals.join(', ')
          : item.verification.status,
        item.position.toFixed(1),
        formatPercent(item.ctr),
        item.expectedCtr === undefined
          ? 'n/a'
          : formatPercent(item.expectedCtr),
        formatCount(item.impressions),
        item.estimatedCtrClickShortfall === undefined
          ? 'n/a'
          : formatCount(item.estimatedCtrClickShortfall),
        truncate(item.recommendation, 72),
      ]),
    )
    printActionDetails(
      'Top page actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${item.opportunityType}, ${formatCount(item.impressions)} impressions`,
        action: item.recommendation,
      })),
    )
  },
})
