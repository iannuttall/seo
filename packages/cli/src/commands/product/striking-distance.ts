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
import { printJson, printTable } from '../../utils.js'
import { formatFetchDiagnostics } from '../shared.js'

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
    days: {
      type: 'string',
      description: 'Recent window length in days. Defaults to 28.',
    },
    'min-impressions': {
      type: 'string',
      description:
        'Minimum impressions for a query/page pair. Defaults to 100.',
    },
    limit: {
      type: 'string',
      description: 'Maximum opportunities to print. Defaults to 25.',
    },
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
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh GSC data.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
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
      verifyContent: booleanArg(args['verify-content']),
      verifyLimit: numberArg(args['verify-limit']),
      js: booleanArg(args.js) ? true : undefined,
      rate: fetchRateArg(args),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printTable(
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
      ],
      report.items.map((item) => [
        item.query,
        item.template.label,
        item.url,
        item.impressions,
        item.ctr,
        item.position,
        item.opportunityScore,
        formatFetchDiagnostics(item.contentVerification?.fetchDiagnostics),
        item.contentVerification?.classification ?? '-',
      ]),
    )
  },
})
