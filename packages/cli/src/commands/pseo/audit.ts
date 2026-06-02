import { pseoAuditReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  printLimitedTable,
  truncate,
} from '../output.js'

function csv(value?: string): string[] | undefined {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatInspection(input: {
  indexed: number
  notIndexed: number
  warnings: number
}): string {
  const total = input.indexed + input.notIndexed + input.warnings
  if (!total) return '-'
  return `${input.indexed}/${total} indexed`
}

function formatCrawl(input: {
  samples: unknown[]
  blockedOrFailed: number
  medianWordCount?: number
}): string {
  if (!input.samples.length) return '-'
  const words =
    input.medianWordCount === undefined
      ? 'words ?'
      : `${formatCount(input.medianWordCount)} words`
  return `${words}; ${input.blockedOrFailed}/${input.samples.length} blocked/failed`
}

export const pseoAuditCommand = defineCommand({
  meta: {
    name: 'audit',
    description: 'Audit pSEO templates with GSC, crawl, and index evidence',
  },
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    days: {
      type: 'string',
      description: 'GSC lookback window. Defaults to 28.',
    },
    sitemap: {
      type: 'string',
      description:
        'Comma-separated sitemap URLs to include in template counts.',
    },
    limit: {
      type: 'string',
      description: 'Maximum templates to show. Defaults to 25.',
    },
    'crawl-samples': {
      type: 'string',
      description: 'Pages to fetch per template for content/fetch checks.',
    },
    'inspect-samples': {
      type: 'string',
      description: 'URLs to check per template with URL Inspection.',
    },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in template metrics.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for crawl samples.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local GSC and HTTP cache.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await pseoAuditReport({
      site: selection.site,
      days: numberArg(args.days),
      sitemaps: csv(stringArg(args.sitemap)),
      templateLimit: numberArg(args.limit),
      crawlSamples: numberArg(args['crawl-samples']),
      inspectSamples: numberArg(args['inspect-samples']),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      js: booleanArg(args.js) ? true : 'auto',
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Property', report.site],
      ['Templates', formatCount(report.summary.templates)],
      ['GSC pages', formatCount(report.summary.gscPages)],
      ['Sitemap URLs', formatCount(report.summary.sitemapUrls)],
      ['Clicks', formatCount(report.summary.clicks)],
      ['Impressions', formatCount(report.summary.impressions)],
      ['Crawled URLs', formatCount(report.summary.crawledUrls)],
      ['Inspected URLs', formatCount(report.summary.inspectedUrls)],
    ])

    if (!report.templates.length) {
      process.stdout.write('No pSEO templates found from GSC/sitemap data.\n')
      return
    }

    printLimitedTable(
      [
        'Verdict',
        'Template',
        'URLs',
        'Clicks',
        'Impr',
        'CTR',
        'Pos',
        'Index',
        'Crawl',
        'Action',
      ],
      report.templates.map((template) => [
        `${template.verdict} (${template.confidence})`,
        truncate(template.signature, 28),
        formatCount(template.urlCount),
        formatCount(template.metrics.clicks),
        formatCount(template.metrics.impressions),
        formatPercent(template.metrics.ctr),
        template.metrics.position.toFixed(1),
        formatInspection(template.inspection),
        formatCrawl(template.crawl),
        truncate(template.recommendation, 72),
      ]),
    )

    if (report.warnings.length) {
      process.stdout.write(`Warnings: ${report.warnings.join('; ')}\n`)
    }
  },
})
