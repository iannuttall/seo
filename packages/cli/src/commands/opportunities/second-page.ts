import { secondPage } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  fetchRateArg,
  jsonFlag,
  numberArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson } from '../../utils.js'
import {
  formatCount,
  formatPosition,
  printActionDetails,
  printLimitedTable,
} from '../output.js'
import { formatContentCheck, formatFetchDiagnostics } from '../shared.js'

export const secondPageCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    limit: { type: 'string' },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    'verify-content': {
      type: 'boolean',
      default: false,
      description:
        'Verify top opportunities against page title, meta, and content.',
    },
    'verify-limit': {
      type: 'string',
      description: 'Maximum opportunity URLs to verify. Defaults to 5.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for verified pages.',
    },
    'fetch-concurrency': {
      type: 'string',
      description: 'Maximum concurrent page fetches per host. Defaults to 4.',
    },
    'fetch-interval-cap': {
      type: 'string',
      description: 'Maximum page fetches per interval per host. Defaults to 4.',
    },
    'fetch-interval-ms': {
      type: 'string',
      description: 'Fetch rate interval in milliseconds. Defaults to 1000.',
    },
    json: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
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
    const report = await secondPage({
      site: selection.site,
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
        item.recommendations[0]?.action ?? 'No recommendation',
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
