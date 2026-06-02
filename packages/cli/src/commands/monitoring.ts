import { crawlDiff, indexWatch } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, listArg, numberArg, stringArg } from '../args.js'
import { resolveSite } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'

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
    ])
    if (report.items.length) {
      printTable(
        ['Kind', 'URL', 'Changes'],
        report.items
          .slice(0, 50)
          .map((item) => [item.kind, item.url, item.changes.join(', ')]),
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

export const indexWatchCommand = defineCommand({
  meta: {
    name: 'index-watch',
    description: 'Inspect URLs with GSC and alert on index status changes',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    urls: {
      type: 'string',
      required: true,
      description: 'Comma-separated URLs to inspect.',
    },
    language: {
      type: 'string',
      description: 'Optional URL Inspection language code.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const urls = listArg(args.urls)
    if (!urls.length) {
      throw new Error('Pass at least one URL with --urls.')
    }
    const report = await indexWatch({
      site: await resolveSite({
        site: stringArg(args.site),
        options: { json },
      }),
      urls,
      languageCode: stringArg(args.language),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Property', report.site],
      ['Inspected', String(report.summary.inspected)],
      ['Changed', String(report.summary.changed)],
      ['Alerts', String(report.summary.alerts)],
    ])
    printTable(
      ['Alert', 'Changed', 'Verdict', 'Coverage', 'URL'],
      report.items.map((item) => [
        item.alert ? 'yes' : 'no',
        item.changed ? 'yes' : 'no',
        item.verdict ?? 'unknown',
        item.coverageState ?? 'unknown',
        item.url,
      ]),
    )
  },
})
