import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  type CrawlOutputFormat,
  crawlSite,
  renderCrawlCsv,
  renderCrawlHtml,
  renderCrawlJunit,
  renderCrawlMarkdownTickets,
  renderCrawlPagesCsv,
  renderCrawlPretty,
  reviewObservations,
  saveCrawlReport,
  topFixes,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  fetchRateArg,
  jsonFlag,
  negatedBooleanArg,
  numberArg,
  projectArg,
  renderingModeArg,
  stringArg,
} from '../args.js'
import { writeJsonOutput } from '../json-output.js'
import { printCrawlHuman } from '../presentation/crawl-report.js'
import { resolveClientSelection } from '../selection.js'
import { printKeyValue } from '../utils.js'
import { startUrlForSite } from './shared.js'

type Severity = 'low' | 'medium' | 'high'

const severityRank: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

export const crawlCommand = defineCommand({
  meta: {
    name: 'crawl',
    description: 'Run a fast sitemap health pass or a full technical crawl',
  },
  args: {
    crawlUrl: {
      type: 'positional',
      required: false,
      description: 'Site start URL. Optional with --sitemap-url.',
    },
    url: {
      type: 'string',
      description:
        'Start URL to crawl. Optional when --project has a saved crawl URL.',
    },
    site: {
      type: 'string',
      description: 'GSC property URL for joining page metrics.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
    },
    'google-analytics-property': {
      type: 'string',
      description:
        'Google Analytics property ID for landing-page sessions. Defaults from --project when saved.',
    },
    mode: {
      type: 'string',
      description:
        'Crawl mode: site, page, list, or sitemap. Start with sitemap --health for large sites.',
    },
    health: {
      type: 'boolean',
      default: false,
      description:
        'Run the uncached sitemap status and redirect pass before a full audit. No page-body analysis.',
    },
    'sitemap-url': {
      type: 'string',
      description:
        'Explicit sitemap URL. Selects sitemap mode when --mode is omitted.',
    },
    urls: {
      type: 'string',
      description: 'Comma-separated URLs for list mode.',
    },
    'urls-file': {
      type: 'string',
      description: 'File with one URL per line for list mode.',
    },
    'max-pages': {
      type: 'string',
      description: 'Maximum pages to crawl, up to 10,000. Defaults to 500.',
    },
    'max-depth': {
      type: 'string',
      description: 'Maximum click depth, up to 64. Defaults to 16.',
    },
    concurrency: {
      type: 'string',
      description:
        'Parallel page fetches, up to 16. Defaults to 8, or progressively up to 4 with --health.',
    },
    'fetch-interval-cap': {
      type: 'string',
      description: 'Maximum page fetches per interval per host.',
    },
    'fetch-interval-ms': {
      type: 'string',
      description: 'Fetch rate interval in milliseconds.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local HTTP cache and fetch fresh pages.',
    },
    include: {
      type: 'string',
      description: 'Comma-separated URL patterns to include.',
    },
    exclude: {
      type: 'string',
      description: 'Comma-separated URL patterns to exclude.',
    },
    'no-sitemap': {
      type: 'boolean',
      default: false,
      description: 'Do not seed URLs from sitemap.xml.',
    },
    'no-robots': {
      type: 'boolean',
      default: false,
      description: 'Do not skip URLs disallowed by robots.txt.',
    },
    'no-external': {
      type: 'boolean',
      default: false,
      description:
        'Do not check external links. Reserved for full link checks.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Legacy alias for --rendering on.',
    },
    rendering: {
      type: 'string',
      description:
        'JavaScript rendering mode: auto, on, or off. Defaults to auto.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON. Alias for --format json.',
    },
    format: {
      type: 'string',
      description:
        'Output format: pretty, json, csv, html, markdown, or junit. JUnit requires --health.',
    },
    output: {
      type: 'string',
      description: 'Write output to this path instead of stdout.',
    },
    csv: {
      type: 'string',
      description: 'CSV table to render: issues or pages. Defaults to issues.',
    },
    save: {
      type: 'boolean',
      default: false,
      description: 'Save the crawl report locally.',
    },
    severity: {
      type: 'string',
      description: 'Only show top fixes at this severity.',
    },
    'fail-on': {
      type: 'string',
      description: 'Exit non-zero when issues exist at this severity or above.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const format = crawlFormatArg(args.format, json)
    const output = stringArg(args.output)
    const csv = crawlCsvArg(args.csv)
    const severity = severityArg(args.severity)
    const failOn = severityArg(args['fail-on'])
    const project = projectArg(args)
    const urls = await urlListArgs(args)
    const explicitUrl = crawlUrlArg(args)
    const sitemapUrl = stringArg(args['sitemap-url'])
    const health = booleanArg(args.health)
    const explicitMode = crawlModeArg(args.mode)
    if (format === 'junit' && !health) {
      throw new Error('--format junit requires --health.')
    }
    if ((health || sitemapUrl) && explicitMode && explicitMode !== 'sitemap') {
      throw new Error('--health and --sitemap-url require sitemap mode.')
    }
    if (health && negatedBooleanArg(args, 'sitemap')) {
      throw new Error('--health cannot be combined with --no-sitemap.')
    }
    if ((health || sitemapUrl) && urls.length) {
      throw new Error(
        '--health and --sitemap-url cannot be combined with URL list input.',
      )
    }
    const selection =
      stringArg(args.site) ||
      project ||
      (!explicitUrl && !urls.length && !sitemapUrl)
        ? await resolveClientSelection({
            client: project,
            site: stringArg(args.site),
            options: { json },
          })
        : undefined
    const crawlUrl =
      explicitUrl ??
      selection?.client?.startUrl ??
      (selection?.site ? startUrlForSite(selection.site) : undefined) ??
      (sitemapUrl ? new URL('/', sitemapUrl).toString() : undefined) ??
      urls[0]
    if (!crawlUrl) {
      throw new Error(
        'No crawl URL selected. Pass a URL, --url, or use --project with a saved crawl URL.',
      )
    }

    const report = await crawlSite({
      url: crawlUrl,
      projectId: selection?.client?.id,
      site: selection?.site,
      mode:
        explicitMode ??
        (health || sitemapUrl ? 'sitemap' : urls.length ? 'list' : undefined),
      strategy: health ? 'health' : 'full',
      sitemapUrl,
      urls,
      maxPages: numberArg(args['max-pages']),
      maxDepth: numberArg(args['max-depth']),
      concurrency: numberArg(args.concurrency),
      refresh: booleanArg(args.refresh),
      fetchRate: fetchRateArg({
        ...args,
        'fetch-concurrency': args.concurrency,
      }),
      include: csvArg(args.include),
      exclude: csvArg(args.exclude),
      googleAnalyticsPropertyId:
        stringArg(args['google-analytics-property']) ??
        selection?.client?.analytics.google?.propertyId,
      useSitemap: !negatedBooleanArg(args, 'sitemap'),
      respectRobots: !negatedBooleanArg(args, 'robots'),
      checkExternal: !negatedBooleanArg(args, 'external'),
      js: renderingModeArg(args),
    })
    const saved = booleanArg(args.save) ? saveCrawlReport(report) : undefined
    const rankedFixes = topFixes(report, { severity })
    const failedThreshold = failOn
      ? report.issues.some(
          (issue) => severityRank[issue.severity] >= severityRank[failOn],
        )
      : false
    const failedRun = report.status === 'failed'

    const payload = {
      ...report,
      topFixes: rankedFixes,
      reviewObservations: reviewObservations(report, { severity }),
      ...(failOn ? { failOn, failedThreshold } : {}),
      ...(saved ? { saved } : {}),
    }

    if (format === 'json') {
      await writeJsonOutput(output, payload)
      if (failedRun || failedThreshold) process.exitCode = 1
      return
    }

    if (format === 'csv') {
      await writeOrPrint(
        output,
        csv === 'pages' ? renderCrawlPagesCsv(report) : renderCrawlCsv(report),
      )
      if (failedRun || failedThreshold) process.exitCode = 1
      return
    }

    if (format === 'html') {
      await writeOrPrint(output, renderCrawlHtml(report, rankedFixes))
      if (failedRun || failedThreshold) process.exitCode = 1
      return
    }

    if (format === 'junit') {
      await writeOrPrint(output, renderCrawlJunit(report))
      if (failedRun || failedThreshold) process.exitCode = 1
      return
    }

    if (format === 'markdown') {
      await writeOrPrint(
        output,
        renderCrawlMarkdownTickets(report, rankedFixes),
      )
      if (failedRun || failedThreshold) process.exitCode = 1
      return
    }

    if (output) {
      await writeOrPrint(output, renderCrawlPretty(report, rankedFixes))
      if (failedRun || failedThreshold) process.exitCode = 1
      return
    }

    printCrawlHuman(report, rankedFixes)
    if (saved || failOn) {
      process.stdout.write('\nRun metadata\n')
      printKeyValue([
        ['Saved report', saved?.id ?? 'no'],
        ['Fail threshold', failOn ?? 'off'],
      ])
    }
    if (failedRun || failedThreshold) {
      process.exitCode = 1
    }
  },
})

function crawlModeArg(value: unknown) {
  const mode = stringArg(value)
  if (!mode) return undefined
  if (['site', 'page', 'list', 'sitemap'].includes(mode)) {
    return mode as 'site' | 'page' | 'list' | 'sitemap'
  }
  throw new Error('Mode must be one of: site, page, list, sitemap.')
}

function severityArg(value: unknown): Severity | undefined {
  const severity = stringArg(value)
  if (!severity) return undefined
  if (['low', 'medium', 'high'].includes(severity)) {
    return severity as Severity
  }
  throw new Error('Severity must be one of: low, medium, high.')
}

function crawlUrlArg(args: Record<string, unknown>): string | undefined {
  const positional = stringArg(args.crawlUrl)
  const flag = stringArg(args.url)
  if (positional && flag && positional !== flag) {
    throw new Error('Use either a URL argument or --url, not both.')
  }
  return positional ?? flag
}

function crawlFormatArg(value: unknown, json: boolean): CrawlOutputFormat {
  const format = stringArg(value)
  if (json && format && format !== 'json') {
    throw new Error('Use either --json or --format, not both.')
  }
  if (!format) return json ? 'json' : 'pretty'
  if (['pretty', 'json', 'csv', 'html', 'markdown', 'junit'].includes(format)) {
    return format as CrawlOutputFormat
  }
  throw new Error(
    'Format must be one of: pretty, json, csv, html, markdown, junit.',
  )
}

function crawlCsvArg(value: unknown): 'issues' | 'pages' {
  const csv = stringArg(value)
  if (!csv) return 'issues'
  if (['issues', 'pages'].includes(csv)) return csv as 'issues' | 'pages'
  throw new Error('CSV table must be one of: issues, pages.')
}

async function urlListArgs(args: Record<string, unknown>): Promise<string[]> {
  const urls = csvArg(args.urls) ?? []
  const file = stringArg(args['urls-file'])
  if (file) {
    urls.push(...parseUrlList(await readFile(file, 'utf8')))
  }
  return [...new Set(urls)]
}

function parseUrlList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith('#'))
}

async function writeOrPrint(path: string | undefined, content: string) {
  if (!path) {
    process.stdout.write(content)
    return
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  process.stdout.write(`Wrote ${path}\n`)
}
