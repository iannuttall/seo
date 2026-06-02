import { technicalWatchWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  listArg,
  numberArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printTable } from '../../utils.js'
import { formatCount, truncate } from '../output.js'
import { startUrlForSite } from '../shared.js'
import { printWorkflow } from './output.js'

export const technicalWatchCommand = defineCommand({
  meta: {
    name: 'technical-watch',
    description: 'Agent workflow for crawl-diff and index-watch monitoring',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    client: {
      type: 'string',
      description: 'Saved client id or name.',
    },
    url: {
      type: 'string',
      description:
        'Start URL to crawl. Defaults from the GSC property when possible.',
    },
    urls: {
      type: 'string',
      description: 'Comma-separated URLs to inspect with URL Inspection.',
    },
    limit: {
      type: 'string',
      description: 'Maximum pages to crawl. Defaults to 50.',
    },
    language: {
      type: 'string',
      description: 'Optional URL Inspection language code.',
    },
    'recover-links': {
      type: 'boolean',
      default: true,
      description:
        'Check search-value GSC pages for broken, blocked, or poorly redirected URLs. Defaults to true.',
    },
    'recover-days': {
      type: 'string',
      description: 'GSC lookback window for link recovery. Defaults to 90.',
    },
    'recover-limit': {
      type: 'string',
      description:
        'Maximum search-value pages to check for link recovery. Defaults to 10.',
    },
    'recover-min-clicks': {
      type: 'string',
      description:
        'Minimum clicks for link recovery candidates. Defaults to 1.',
    },
    'recover-min-impressions': {
      type: 'string',
      description:
        'Minimum impressions for link recovery candidates. Defaults to 100.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local HTTP/GSC cache where supported.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering when Playwright is installed.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const watchUrls = listArg(args.urls)
    const startUrl =
      stringArg(args.url) ??
      selection.client?.startUrl ??
      startUrlForSite(selection.site)
    const report = await technicalWatchWorkflow({
      site: selection.site,
      startUrl,
      urls: watchUrls.length ? watchUrls : selection.client?.watchUrls,
      limit: numberArg(args.limit),
      languageCode: stringArg(args.language),
      refresh: booleanArg(args.refresh),
      js: booleanArg(args.js) ? true : 'auto',
      recoverLinks: booleanArg(args['recover-links']),
      recoverDays: numberArg(args['recover-days']),
      recoverLimit: numberArg(args['recover-limit']),
      recoverMinClicks: numberArg(args['recover-min-clicks']),
      recoverMinImpressions: numberArg(args['recover-min-impressions']),
    })
    if (json) {
      printJson(report)
      return
    }
    printWorkflow(report)
    if (report.output.recovery?.items.length) {
      process.stdout.write('\nRecoverable URLs\n')
      printTable(
        ['Severity', 'Issue', 'Clicks', 'Impr', 'URL', 'Action'],
        report.output.recovery.items
          .slice(0, 10)
          .map((item) => [
            item.severity,
            item.issue,
            formatCount(item.clicks),
            formatCount(item.impressions),
            truncate(item.url, 56),
            truncate(item.recommendation.action, 72),
          ]),
      )
    }
  },
})
