import { crawlDiff } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'
import { printActionDetails, truncate } from '../output.js'

export const crawlDiffCommand = defineCommand({
  meta: {
    name: 'crawl-diff',
    description: 'Crawl a site and diff technical/page changes vs last run',
  },
  args: {
    url: {
      type: 'string',
      required: true,
      description: 'Start URL to crawl.',
    },
    site: {
      type: 'string',
      description: 'Optional GSC property to associate with the crawl.',
    },
    limit: {
      type: 'string',
      description: 'Maximum pages to crawl. Defaults to 50.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local HTTP cache.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering when Playwright is installed.',
    },
  },
  run: async ({ args }) => {
    const report = await crawlDiff({
      startUrl: stringArg(args.url) ?? '',
      site: stringArg(args.site),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
      js: booleanArg(args.js) ? true : 'auto',
    })
    if (jsonFlag(args)) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Run', report.run.id],
      ['Start URL', report.run.startUrl],
      ['Crawled', String(report.summary.crawled)],
      ['Previous run', report.previousRun?.id ?? 'none'],
      ['Added', String(report.summary.added)],
      ['Removed', String(report.summary.removed)],
      ['Changed', String(report.summary.changed)],
      ['New errors', String(report.summary.newErrors)],
      ['Indexability flips', String(report.summary.indexabilityFlips)],
      [
        'High-priority actions',
        String(report.summary.highPriorityRecommendations),
      ],
    ])
    if (report.recommendations.length) {
      process.stdout.write('\nRecommended actions\n')
      printTable(
        ['Severity', 'Category', 'URL', 'Action'],
        report.recommendations
          .slice(0, 10)
          .map((item) => [
            item.severity,
            item.category,
            truncate(item.url, 56),
            truncate(item.action, 72),
          ]),
      )
      printActionDetails(
        'Top crawl actions',
        report.recommendations.map((item) => ({
          label: item.category,
          context: `${item.severity}, ${truncate(item.url, 96)}`,
          action: item.action,
        })),
      )
    }
    if (report.items.length) {
      process.stdout.write('\nChanged URLs\n')
      printTable(
        ['Kind', 'URL', 'Changes', 'Recommendation'],
        report.items
          .slice(0, 50)
          .map((item) => [
            item.kind,
            truncate(item.url, 56),
            item.changes.join(', '),
            item.recommendation?.title ?? '-',
          ]),
      )
    }
    if (report.warnings.length) {
      process.stdout.write('\nWarnings\n')
      for (const warning of report.warnings.slice(0, 10)) {
        process.stdout.write(`- ${warning}\n`)
      }
    }
  },
})
