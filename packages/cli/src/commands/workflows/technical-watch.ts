import { technicalWatchWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  defaultTrueBooleanArg,
  jsonFlag,
  listArg,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson } from '../../utils.js'
import { printMonitoringRun } from '../monitoring/output.js'
import { startUrlForSite } from '../shared.js'

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
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
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
    sitemaps: {
      type: 'string',
      description:
        'Comma-separated XML sitemap URLs for quota-aware index monitoring.',
    },
    properties: {
      type: 'string',
      description:
        'Comma-separated GSC properties for sitemap index monitoring.',
    },
    limit: {
      type: 'string',
      description: 'Maximum pages to crawl. Defaults to 50.',
    },
    'daily-limit': {
      type: 'string',
      description: 'URL Inspection daily limit per property. Defaults to 2000.',
    },
    'inspect-limit': {
      type: 'string',
      description:
        'Maximum sitemap URLs to inspect in this run. Defaults to 100.',
    },
    'max-urls': {
      type: 'string',
      description:
        'Maximum sitemap URLs to load for monitoring. Defaults to 50000.',
    },
    language: {
      type: 'string',
      description: 'Optional URL Inspection language code.',
    },
    'recover-links': defaultTrueBooleanArg(
      'Check search-value GSC pages for broken, blocked, or poorly redirected URLs. Defaults to true.',
      'Skip link recovery checks.',
    ),
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
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const watchUrls = listArg(args.urls)
    const sitemaps = listArg(args.sitemaps)
    const startUrl =
      stringArg(args.url) ??
      selection.client?.startUrl ??
      startUrlForSite(selection.site)
    const report = await technicalWatchWorkflow({
      site: selection.site,
      startUrl,
      urls: watchUrls.length ? watchUrls : selection.client?.watchUrls,
      sitemaps: sitemaps.length ? sitemaps : undefined,
      properties: listArg(args.properties).length
        ? listArg(args.properties)
        : undefined,
      limit: numberArg(args.limit),
      languageCode: stringArg(args.language),
      dailyLimit: numberArg(args['daily-limit']),
      inspectLimit: numberArg(args['inspect-limit']),
      maxUrls: numberArg(args['max-urls']),
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
    printMonitoringRun(report)
  },
})
