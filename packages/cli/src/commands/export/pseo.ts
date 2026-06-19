import { pseoAuditReport, pseoCsvFiles } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
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

export const exportPseoCommand = defineCommand({
  meta: {
    name: 'pseo',
    description:
      'Export pSEO audit tables: templates, demand patterns, top queries, sample coverage, crawl samples, and inspection samples.',
  },
  args: {
    ...exportSelectionArgs,
    out: outArg('pseo'),
    days: {
      type: 'string',
      description: 'GSC lookback window. Defaults to 28.',
    },
    limit: {
      type: 'string',
      description: 'Maximum pSEO templates to export.',
    },
    sitemap: {
      type: 'string',
      description: 'Comma-separated sitemap URLs. Can be passed once.',
    },
    'crawl-samples': {
      type: 'string',
      description:
        'Number of representative URLs to fetch per template. Defaults to 0.',
    },
    'inspect-samples': {
      type: 'string',
      description:
        'Number of representative URLs to inspect in GSC per template. Defaults to 0.',
    },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in pSEO demand analysis.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for crawled samples.',
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
    const report = await pseoAuditReport({
      site: selection.site,
      days: numberArg(args.days),
      templateLimit: numberArg(args.limit),
      sitemaps: csvArg(args.sitemap),
      crawlSamples: numberArg(args['crawl-samples']),
      inspectSamples: numberArg(args['inspect-samples']),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      js: booleanArg(args.js) ? true : 'auto',
      rate: fetchRateArg(args),
      refresh: booleanArg(args.refresh),
      progress: createProgressReporter(true),
    })
    const outDir =
      stringArg(args.out) ??
      defaultOutDir({
        report: 'pseo',
        clientId: selection.client?.id,
        site: selection.site,
      })
    const written = await writeCsvFiles(outDir, pseoCsvFiles(report))
    printWritten(outDir, written)
  },
})
