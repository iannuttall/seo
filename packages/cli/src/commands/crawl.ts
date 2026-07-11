import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  type CrawlOutputFormat,
  crawlSite,
  renderCrawlCsv,
  renderCrawlHtml,
  renderCrawlMarkdownTickets,
  renderCrawlPagesCsv,
  renderCrawlPretty,
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
    description: 'Crawl a site and run technical SEO checks',
  },
  args: {
    crawlUrl: {
      type: 'positional',
      required: false,
      description: 'Start URL to crawl.',
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
    'ga4-property': {
      type: 'string',
      description:
        'GA4 property ID for landing-page sessions. Defaults from --project when saved.',
    },
    mode: {
      type: 'string',
      description:
        'Crawl mode: site, page, list, or sitemap. Defaults to site.',
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
      description: 'Maximum pages to crawl. Defaults to 500.',
    },
    'max-depth': {
      type: 'string',
      description: 'Maximum click depth. Defaults to 16.',
    },
    concurrency: {
      type: 'string',
      description: 'Parallel page fetches. Defaults to 8.',
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
      description: 'Output format: pretty, json, csv, html, or markdown.',
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
    const selection =
      stringArg(args.site) || project || (!explicitUrl && !urls.length)
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
      mode: crawlModeArg(args.mode) ?? (urls.length ? 'list' : undefined),
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
      ga4PropertyId:
        stringArg(args['ga4-property']) ?? selection?.client?.ga4PropertyId,
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
      ...(failOn ? { failOn, failedThreshold } : {}),
      ...(saved ? { saved } : {}),
    }

    if (format === 'json') {
      await writeOrPrint(output, `${JSON.stringify(payload, null, 2)}\n`)
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

    process.stdout.write(renderCrawlPretty(report, rankedFixes))
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
  if (['pretty', 'json', 'csv', 'html', 'markdown'].includes(format)) {
    return format as CrawlOutputFormat
  }
  throw new Error('Format must be one of: pretty, json, csv, html, markdown.')
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
