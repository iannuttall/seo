import { indexCoverageSignals } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  listArg,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'
import { truncate } from '../output.js'

export const indexCoverageCommand = defineCommand({
  meta: {
    name: 'index-coverage',
    description:
      'Find crawlable pages that deserve a closer Google index check',
  },
  args: {
    project: {
      type: 'string',
      description: 'Saved project id or name.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    'crawl-report-id': {
      type: 'string',
      description:
        'Saved crawl report id. Defaults to the latest for the site.',
    },
    sitemaps: {
      type: 'string',
      description:
        'Comma-separated XML sitemap URLs. Defaults to declarations captured by the crawl.',
    },
    days: {
      type: 'string',
      description: 'Finalized Search Console date range. Defaults to 90 days.',
    },
    'row-limit': {
      type: 'string',
      description: 'Maximum Search Console page rows. Defaults to 100000.',
    },
    'max-sitemap-urls': {
      type: 'string',
      description: 'Maximum sitemap inventory URLs. Defaults to 100000.',
    },
    limit: {
      type: 'string',
      description:
        'Maximum URLs returned in each evidence group. Defaults to 100.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass the local Search Console cache.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const sitemapValues = listArg(args.sitemaps)
    const report = await indexCoverageSignals({
      site: selection.site,
      crawlReportId: stringArg(args['crawl-report-id']),
      sitemaps: sitemapValues.length ? sitemapValues : undefined,
      days: numberArg(args.days),
      rowLimit: numberArg(args['row-limit']),
      maxSitemapUrls: numberArg(args['max-sitemap-urls']),
      itemsPerSection: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Project site', report.site],
      ['Crawl report', report.input.crawlReport.id],
      ['Crawl evidence', report.sources.crawl.completeness],
      ['Sitemap evidence', report.sources.sitemap.completeness],
      [
        'Search Console window',
        `${report.sources.searchConsole.startDate} to ${report.sources.searchConsole.endDate}`,
      ],
      ['Search Console evidence', report.sources.searchConsole.completeness],
      [
        'Pages in returned Search Console data',
        String(report.summary.retainedSearchVisibleUrls),
      ],
      [
        'Crawlable pages to review',
        String(
          report.summary.crawlableCandidatesWithoutRetainedSearchVisibility,
        ),
      ],
      [
        'Blocked or non-indexable crawl pages',
        String(report.summary.blockedOrNonIndexableCrawlUrls),
      ],
      ['Sitemap-only pages', String(report.summary.sitemapOnlyUrls)],
      [
        'Search Console-only pages',
        String(report.summary.searchConsoleOnlyUrls),
      ],
    ])

    if (report.crawlableWithoutRetainedSearchVisibility.items.length) {
      process.stdout.write('\nRepresentative URL Inspection candidates\n')
      printTable(
        ['URL', 'Status', 'In sitemap'],
        report.crawlableWithoutRetainedSearchVisibility.items.map((item) => [
          truncate(item.url, 80),
          item.status,
          item.inSitemap ? 'yes' : 'no',
        ]),
      )
    }

    if (report.caveats.length) {
      process.stdout.write('\nHow to read this report\n')
      for (const caveat of report.caveats) {
        process.stdout.write(`- ${caveat}\n`)
      }
    }
  },
})
