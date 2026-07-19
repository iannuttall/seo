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
import { printJson, printTable } from '../../utils.js'
import { printNotes, printReportSummary, truncate } from '../output.js'

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

    printReportSummary({
      title: 'Index coverage',
      target: report.site,
      status:
        report.sources.crawl.completeness === 'complete' &&
        report.sources.searchConsole.completeness === 'complete'
          ? report.summary.crawlableCandidatesWithoutRetainedSearchVisibility >
            0
            ? 'warning'
            : 'pass'
          : 'unknown',
      summary: `${report.summary.crawlableCandidatesWithoutRetainedSearchVisibility} crawlable pages need URL Inspection review.`,
      metrics: [
        { label: 'Crawl report', value: report.input.crawlReport.id },
        { label: 'Crawl evidence', value: report.sources.crawl.completeness },
        {
          label: 'Sitemap evidence',
          value: report.sources.sitemap.completeness,
        },
        {
          label: 'Search evidence',
          value: report.sources.searchConsole.completeness,
        },
        {
          label: 'Search window',
          value: `${report.sources.searchConsole.startDate} to ${report.sources.searchConsole.endDate}`,
        },
        {
          label: 'Search-visible pages',
          value: report.summary.retainedSearchVisibleUrls,
        },
        {
          label: 'Blocked/non-indexable',
          value: report.summary.blockedOrNonIndexableCrawlUrls,
        },
        { label: 'Sitemap only', value: report.summary.sitemapOnlyUrls },
        {
          label: 'Search Console only',
          value: report.summary.searchConsoleOnlyUrls,
        },
      ],
    })

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

    printNotes('How to read this report', report.caveats)
  },
})
