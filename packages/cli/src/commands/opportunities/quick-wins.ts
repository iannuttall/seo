import { quickWinsReport } from '@seo/core'
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
  printLimitedTable,
  truncate,
  verificationSummary,
} from '../output.js'
import { formatFetchDiagnostics } from '../shared.js'

export const quickWinsCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    'verify-content': {
      type: 'boolean',
      default: false,
      description:
        'Verify top quick wins against page title, meta, and content.',
    },
    'verify-limit': {
      type: 'string',
      description: 'Maximum quick-win URLs to verify. Defaults to 5.',
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
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await quickWinsReport({
      site: selection.site,
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      verifyContent: booleanArg(args['verify-content']),
      verifyLimit: numberArg(args['verify-limit']),
      js: booleanArg(args.js) ? true : undefined,
      rate: fetchRateArg(args),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Quick wins', formatCount(report.items.length)],
      [
        'Brand queries',
        booleanArg(args['include-brand']) ? 'included' : 'excluded',
      ],
      ['Verification', verificationSummary(report)],
    ])
    printLimitedTable(
      ['Query', 'URL', 'Pos', 'Impr', 'CTR', 'Lift', 'Fetch', 'Gap', 'Action'],
      report.items.map((item) => [
        truncate(item.query, 36),
        truncate(item.url, 48),
        formatPosition(item.position),
        formatCount(item.impressions),
        formatPercent(item.ctr),
        formatCount(item.estimatedClickLift),
        formatFetchDiagnostics(item.contentVerification?.fetchDiagnostics),
        item.contentVerification?.contentGapScore ?? '-',
        truncate(item.recommendation.action, 64),
      ]),
    )
  },
})
