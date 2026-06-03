import { pageOpportunitiesReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  printActionDetails,
  printLimitedTable,
  printNotes,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { formatContentCheck, formatFetchDiagnostics } from '../shared.js'

export const pageOpportunitiesCommand = defineCommand({
  meta: {
    name: 'page-opportunities',
    description: 'Find first-party traffic growth opportunities for one URL',
  },
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
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
    'no-verify-content': {
      type: 'boolean',
      default: false,
      description: 'Skip fetching the page for title/H1/body checks.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
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
      verifyContent: booleanArg(args['no-verify-content']) !== true,
      js: booleanArg(args.js) ? true : 'auto',
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Property', report.site],
      ['URL', report.url],
      ['Title', report.page?.title ?? 'not fetched'],
      ['Fetch', formatFetchDiagnostics(report.page?.fetchDiagnostics)],
      ['Queries', formatCount(report.summary.queries)],
      ['Impressions', formatCount(report.summary.impressions)],
      ['Opportunities', formatCount(report.summary.opportunities)],
      ['Estimated lift', formatCount(report.summary.estimatedClickLift)],
      ['Focus', report.summary.focus],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'This report starts from queries where this exact URL already has impressions, so recommendations stay tied to first-party demand.',
      'Content verification separates body gaps from title/meta framing issues, which helps avoid adding copy when the page already covers the query.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)

    if (!report.items.length) {
      process.stdout.write('No GSC query rows found for this exact URL.\n')
      return
    }

    printLimitedTable(
      ['Type', 'Query', 'Check', 'Pos', 'CTR', 'Impr', 'Lift', 'Action'],
      report.items.map((item) => [
        item.opportunityType,
        truncate(item.query, 38),
        formatContentCheck(item.coverage?.classification),
        item.position.toFixed(1),
        formatPercent(item.ctr),
        formatCount(item.impressions),
        formatCount(item.estimatedClickLift),
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
