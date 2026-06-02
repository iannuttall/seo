import { linkRecover } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  printActionDetails,
  printLimitedTable,
  truncate,
} from '../output.js'
import { selectedSiteOrThrow } from '../shared.js'

export const linkRecoverCommand = defineCommand({
  meta: {
    name: 'link-recover',
    description:
      'Find search-value URLs that are now broken, blocked, or poorly redirected',
  },
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    days: {
      type: 'string',
      description: 'GSC lookback window. Defaults to 90.',
    },
    limit: {
      type: 'string',
      description: 'Maximum GSC pages to check. Defaults to 50.',
    },
    'min-clicks': {
      type: 'string',
      description: 'Minimum clicks to check a page. Defaults to 1.',
    },
    'min-impressions': {
      type: 'string',
      description: 'Minimum impressions to check a page. Defaults to 100.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local GSC and HTTP caches.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for final page extraction.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await linkRecover({
      site: await selectedSiteOrThrow(
        { client: stringArg(args.client), site: stringArg(args.site) },
        { json },
      ),
      days: numberArg(args.days),
      limit: numberArg(args.limit),
      minClicks: numberArg(args['min-clicks']),
      minImpressions: numberArg(args['min-impressions']),
      refresh: booleanArg(args.refresh),
      js: booleanArg(args.js) ? true : 'auto',
    })
    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Site', report.site],
      ['Range', `${report.range.startDate} to ${report.range.endDate}`],
      ['Checked', formatCount(report.summary.checked)],
      ['Recoverable', formatCount(report.summary.recoverable)],
      ['High severity', formatCount(report.summary.high)],
      ['Clicks at risk', formatCount(report.summary.clicksAtRisk)],
      ['Impressions at risk', formatCount(report.summary.impressionsAtRisk)],
    ])
    if (report.items.length) {
      printLimitedTable(
        ['Severity', 'Issue', 'Clicks', 'Impr', 'URL', 'Action'],
        report.items.map((item) => [
          item.severity,
          item.issue,
          formatCount(item.clicks),
          formatCount(item.impressions),
          truncate(item.url, 56),
          truncate(item.recommendation.action, 72),
        ]),
      )
      printActionDetails(
        'Top recovery actions',
        report.items.map((item) => ({
          label: truncate(item.url, 96),
          context: `${item.severity}, ${formatCount(item.clicks)} clicks at risk`,
          action: item.recommendation.action,
        })),
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
