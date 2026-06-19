import { readFile } from 'node:fs/promises'
import { crawlSite, saveCrawlReport, topFixes } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { printNotes, truncate } from './output.js'
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
    description: 'Crawl a site and run technical SEO/GEO checks',
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
      description: 'Force JavaScript rendering when Playwright is installed.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
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
      include: csvArg(args.include),
      exclude: csvArg(args.exclude),
      ga4PropertyId:
        stringArg(args['ga4-property']) ?? selection?.client?.ga4PropertyId,
      useSitemap: !booleanArg(args['no-sitemap']),
      respectRobots: !booleanArg(args['no-robots']),
      checkExternal: !booleanArg(args['no-external']),
      js: Boolean(booleanArg(args.js)),
    })
    const saved = booleanArg(args.save) ? saveCrawlReport(report) : undefined
    const rankedFixes = topFixes(report, { severity })
    const failedThreshold = failOn
      ? report.issues.some(
          (issue) => severityRank[issue.severity] >= severityRank[failOn],
        )
      : false

    if (json) {
      printJson({
        ...report,
        topFixes: rankedFixes,
        ...(failOn ? { failOn, failedThreshold } : {}),
        ...(saved ? { saved } : {}),
      })
      if (failedThreshold) process.exitCode = 1
      return
    }

    printKeyValue([
      ['URL', report.config.url],
      ['Status', report.status],
      ['Pages', String(report.summary.totalPages)],
      ['Indexable', String(report.summary.indexablePages)],
      ['Issues', String(report.issues.length)],
      [
        'GSC pages',
        String(report.pages.filter((page) => page.searchMetrics).length),
      ],
      [
        'GA4 pages',
        String(report.pages.filter((page) => page.analytics).length),
      ],
      ['High', String(report.summary.highIssues)],
      ['Medium', String(report.summary.mediumIssues)],
      ['Low', String(report.summary.lowIssues)],
      ['Saved report', saved?.id ?? 'no'],
      ['Fail threshold', failOn ?? 'off'],
    ])

    if (rankedFixes.length) {
      process.stdout.write('\nTop fixes\n')
      printTable(
        ['Score', 'Severity', 'Rule', 'Count', 'Search', 'Sample URL'],
        rankedFixes.map((fix) => [
          fix.score,
          fix.severity,
          fix.ruleId,
          fix.count,
          `${fix.scoreFactors.clicks} clicks / ${fix.scoreFactors.impressions} impr.`,
          truncate(fix.sampleUrls[0] ?? '', 64),
        ]),
      )
    }

    printNotes('Warnings', report.warnings.slice(0, 10))
    printNotes('Caveats', report.caveats)
    if (failedThreshold) {
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
