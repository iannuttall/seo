import { diagnoseCsvFiles, diagnoseProperty } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  fetchRateArg,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { createProgressReporter } from '../../progress.js'
import { resolveClientSelection } from '../../selection.js'
import {
  defaultOutDir,
  exportSelectionArgs,
  outArg,
  printWritten,
  writeCsvFiles,
} from './shared.js'

export const exportDiagnoseCommand = defineCommand({
  meta: {
    name: 'diagnose',
    description:
      'Export diagnosis tables: priorities, anomalies, movement, decay, cannibalisation, striking-distance, and quick wins.',
  },
  args: {
    ...exportSelectionArgs,
    out: outArg('diagnose'),
    days: {
      type: 'string',
      description: 'GSC lookback window. Defaults to 90.',
    },
    recent: {
      type: 'string',
      description: 'Recent anomaly window in days.',
    },
    limit: {
      type: 'string',
      description: 'Maximum rows per movement/opportunity table.',
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
      description: 'Maximum opportunity URLs to verify.',
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
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh data.',
    },
  },
  run: async ({ args }) => {
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
    })
    const report = await diagnoseProperty({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      verifyContent: booleanArg(args['verify-content']),
      verifyLimit: numberArg(args['verify-limit']),
      js: booleanArg(args.js) ? true : 'auto',
      rate: fetchRateArg(args),
      refresh: booleanArg(args.refresh),
      progress: createProgressReporter(true),
    })
    const outDir =
      stringArg(args.out) ??
      defaultOutDir({
        report: 'diagnose',
        clientId: selection.client?.id,
        site: selection.site,
      })
    const written = await writeCsvFiles(outDir, diagnoseCsvFiles(report))
    printWritten(outDir, written)
  },
})
