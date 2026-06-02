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
  truncate,
} from '../output.js'
import { formatFetchDiagnostics } from '../shared.js'

export const pageOpportunitiesCommand = defineCommand({
  meta: {
    name: 'page-opportunities',
    description: 'Find first-party traffic growth opportunities for one URL',
  },
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    url: { type: 'string', required: true },
    days: {
      type: 'string',
      description: 'GSC lookback window. Defaults to 28.',
    },
    limit: {
      type: 'string',
      description: 'Maximum page queries to inspect. Defaults to 25.',
    },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in page opportunity reports.',
    },
    'no-verify-content': {
      type: 'boolean',
      default: false,
      description: 'Skip fetching the page for title/H1/body checks.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for page extraction.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local GSC and HTTP cache.',
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
    ])

    if (!report.items.length) {
      process.stdout.write('No GSC query rows found for this exact URL.\n')
      return
    }

    printLimitedTable(
      ['Type', 'Query', 'Pos', 'CTR', 'Impr', 'Lift', 'Action'],
      report.items.map((item) => [
        item.opportunityType,
        truncate(item.query, 38),
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
