import { readFile } from 'node:fs/promises'
import { crawlImplementationQueueWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  fetchRateArg,
  jsonFlag,
  negatedBooleanArg,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printTable } from '../../utils.js'
import { printActionDetails } from '../output.js'
import { startUrlForSite } from '../shared.js'
import { printWorkflow } from './output.js'

export const crawlQueueCommand = defineCommand({
  meta: {
    name: 'crawl-queue',
    description: 'Run a crawl and return a ranked implementation queue',
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
    limit: {
      type: 'string',
      description: 'Maximum queue items to print. Defaults to 25.',
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
      description: 'Do not check external links.',
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
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
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

    const report = await crawlImplementationQueueWorkflow({
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
      js: Boolean(booleanArg(args.js)),
      limit: numberArg(args.limit),
    })

    if (json) {
      printJson(report)
      return
    }

    printWorkflow(report)
    printTable(
      ['Rank', 'Score', 'Rule', 'Severity', 'Affected', 'Target', 'Action'],
      report.output.queue.map((item, index) => [
        index + 1,
        item.score,
        item.ruleId,
        item.severity,
        item.affectedUrls,
        item.target,
        item.action,
      ]),
    )
    printActionDetails(
      'Implementation queue details',
      report.output.queue.map((item) => ({
        label: `${item.ruleId} (${item.affectedUrls} URLs)`,
        context: `${item.severity}, score ${item.score}`,
        action: `${item.action} Verify with: ${item.verification.command}`,
      })),
    )
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
  if (file) urls.push(...parseUrlList(await readFile(file, 'utf8')))
  return [...new Set(urls)]
}

function parseUrlList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith('#'))
}
