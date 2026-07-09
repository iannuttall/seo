import { defaultTrueBooleanArg } from '../../args.js'

export function monitoringRunArgs() {
  return {
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
        'Start URL to crawl. Defaults from the project or GSC property.',
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
      'Check search-value GSC pages for broken, blocked, or poorly redirected URLs.',
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
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  } as const
}

export function monitoringStatusArgs() {
  return {
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
    'stale-days': {
      type: 'string',
      description: 'Mark checks stale after this many days. Defaults to 8.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Refresh property selection data when prompting.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  } as const
}
