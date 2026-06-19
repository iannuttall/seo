import { crawlSite } from '@seo/core'
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

export const crawlCommand = defineCommand({
  meta: {
    name: 'crawl',
    description: 'Crawl a site and run technical SEO/GEO checks',
  },
  args: {
    url: {
      type: 'string',
      required: true,
      description: 'Start URL to crawl.',
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
    mode: {
      type: 'string',
      description:
        'Crawl mode: site, page, list, or sitemap. Defaults to site.',
    },
    urls: {
      type: 'string',
      description: 'Comma-separated URLs for list mode.',
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
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const project = projectArg(args)
    const selection =
      stringArg(args.site) || project
        ? await resolveClientSelection({
            client: project,
            site: stringArg(args.site),
            options: { json },
          })
        : undefined
    const report = await crawlSite({
      url: stringArg(args.url) ?? '',
      site: selection?.site,
      mode: crawlModeArg(args.mode),
      urls: csvArg(args.urls),
      maxPages: numberArg(args['max-pages']),
      maxDepth: numberArg(args['max-depth']),
      concurrency: numberArg(args.concurrency),
      include: csvArg(args.include),
      exclude: csvArg(args.exclude),
      useSitemap: !booleanArg(args['no-sitemap']),
      respectRobots: !booleanArg(args['no-robots']),
      checkExternal: !booleanArg(args['no-external']),
      js: booleanArg(args.js) ? true : false,
    })

    if (json) {
      printJson(report)
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
      ['High', String(report.summary.highIssues)],
      ['Medium', String(report.summary.mediumIssues)],
      ['Low', String(report.summary.lowIssues)],
    ])

    if (report.issueGroups.length) {
      process.stdout.write('\nTop issues\n')
      printTable(
        ['Severity', 'Rule', 'Count', 'Sample URL'],
        report.issueGroups
          .slice(0, 10)
          .map((group) => [
            group.severity,
            group.ruleId,
            group.count,
            truncate(group.sampleUrls[0] ?? '', 64),
          ]),
      )
    }

    printNotes('Warnings', report.warnings.slice(0, 10))
    printNotes('Caveats', report.caveats)
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
