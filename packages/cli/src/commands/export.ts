import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  type CsvFile,
  diagnoseCsvFiles,
  diagnoseProperty,
  pseoAuditReport,
  pseoCsvFiles,
  renderCsv,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  fetchRateArg,
  numberArg,
  stringArg,
} from '../args.js'
import { createProgressReporter } from '../progress.js'
import { resolveClientSelection } from '../selection.js'

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/^sc-domain:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function defaultOutDir(input: {
  report: string
  clientId?: string
  site: string
}) {
  const day = new Date().toISOString().slice(0, 10)
  const id = slug(input.clientId ?? input.site)
  return resolve(process.cwd(), 'seo-export', `${id}-${input.report}-${day}`)
}

async function writeCsvFiles(outDir: string, files: CsvFile[]) {
  await mkdir(outDir, { recursive: true })
  const written: string[] = []
  for (const file of files) {
    const path = resolve(outDir, file.filename)
    await writeFile(path, renderCsv(file.rows), 'utf8')
    written.push(path)
  }
  return written
}

function printWritten(outDir: string, files: string[]) {
  process.stdout.write(`Wrote ${files.length} CSV file(s) to ${outDir}\n`)
  for (const file of files) {
    process.stdout.write(`- ${file}\n`)
  }
}

export const exportCommand = defineCommand({
  meta: {
    name: 'export',
    description: 'Export full report data to CSV files',
  },
  subCommands: {
    diagnose: defineCommand({
      meta: {
        name: 'diagnose',
        description:
          'Export diagnosis tables: priorities, anomalies, movement, decay, cannibalisation, striking-distance, and quick wins.',
      },
      args: {
        client: {
          type: 'string',
          description: 'Saved client id. Defaults to the configured default.',
        },
        site: {
          type: 'string',
          description: 'GSC property URL/id when not using a saved client.',
        },
        out: {
          type: 'string',
          description:
            'Output folder. Defaults to ./seo-export/<client>-diagnose-YYYY-MM-DD.',
        },
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
          description:
            'Maximum concurrent page fetches per host. Defaults to 4.',
        },
        'fetch-interval-cap': {
          type: 'string',
          description:
            'Maximum page fetches per interval per host. Defaults to 4.',
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
          client: stringArg(args.client),
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
    }),
    pseo: defineCommand({
      meta: {
        name: 'pseo',
        description:
          'Export pSEO audit tables: templates, demand patterns, top queries, sample coverage, crawl samples, and inspection samples.',
      },
      args: {
        client: {
          type: 'string',
          description: 'Saved client id. Defaults to the configured default.',
        },
        site: {
          type: 'string',
          description: 'GSC property URL/id when not using a saved client.',
        },
        out: {
          type: 'string',
          description:
            'Output folder. Defaults to ./seo-export/<client>-pseo-YYYY-MM-DD.',
        },
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
          description:
            'Maximum concurrent page fetches per host. Defaults to 4.',
        },
        'fetch-interval-cap': {
          type: 'string',
          description:
            'Maximum page fetches per interval per host. Defaults to 4.',
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
          client: stringArg(args.client),
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
    }),
  },
})
