import type { ReportSource, ReportSourceKey } from './types'

export const reportSources = {
  'ai-features': {
    key: 'ai-features',
    label: 'Google guidance for AI features and websites',
    url: 'https://developers.google.com/search/docs/appearance/ai-features',
  },
  'bing-webmaster': {
    key: 'bing-webmaster',
    label: 'Bing Webmaster API guidance',
    url: 'https://learn.microsoft.com/en-us/bingwebmaster/getting-access',
  },
  canonical: {
    key: 'canonical',
    label: 'Google canonical URL guidance',
    url: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
  },
  'core-web-vitals': {
    key: 'core-web-vitals',
    label: 'Core Web Vitals metrics and thresholds',
    url: 'https://web.dev/articles/vitals',
  },
  'crawlable-links': {
    key: 'crawlable-links',
    label: 'Google guidance for crawlable links',
    url: 'https://developers.google.com/search/docs/crawling-indexing/links-crawlable',
  },
  'google-analytics-acquisition': {
    key: 'google-analytics-acquisition',
    label: 'Google Analytics traffic acquisition guidance',
    url: 'https://support.google.com/analytics/answer/12923437',
  },
  'google-updates': {
    key: 'google-updates',
    label: 'Google Search Status Dashboard',
    url: 'https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history',
  },
  javascript: {
    key: 'javascript',
    label: 'Google JavaScript SEO guidance',
    url: 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics',
  },
  'keyword-provider-discovery': {
    key: 'keyword-provider-discovery',
    label: 'DataForSEO keyword ideas API reference',
    url: 'https://docs.dataforseo.com/v3/dataforseo_labs-google-keyword_ideas-live/',
  },
  'keyword-provider-metrics': {
    key: 'keyword-provider-metrics',
    label: 'DataForSEO keyword overview API reference',
    url: 'https://docs.dataforseo.com/v3/dataforseo_labs-google-keyword_overview-live/',
  },
  redirects: {
    key: 'redirects',
    label: 'Google guidance for redirects',
    url: 'https://developers.google.com/search/docs/crawling-indexing/301-redirects',
  },
  robots: {
    key: 'robots',
    label: 'Google robots.txt guidance',
    url: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro',
  },
  'robots-meta': {
    key: 'robots-meta',
    label: 'Google robots meta and snippet controls',
    url: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag',
  },
  'search-analytics': {
    key: 'search-analytics',
    label: 'Search Console Search Analytics API guidance',
    url: 'https://developers.google.com/webmaster-tools/v1/how-tos/search_analytics',
  },
  'server-logs': {
    key: 'server-logs',
    label: 'NGINX access log format reference',
    url: 'https://nginx.org/en/docs/http/ngx_http_log_module.html',
  },
  'serp-provider-results': {
    key: 'serp-provider-results',
    label: 'DataForSEO live Google SERP API reference',
    url: 'https://docs.dataforseo.com/v3/serp-google-organic-live-advanced/',
  },
  sitemaps: {
    key: 'sitemaps',
    label: 'Google sitemap guidance',
    url: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview',
  },
  'structured-data': {
    key: 'structured-data',
    label: 'Google structured data guidance',
    url: 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data',
  },
  'url-inspection': {
    key: 'url-inspection',
    label: 'Search Console URL Inspection API reference',
    url: 'https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect',
  },
} as const satisfies Record<ReportSourceKey, ReportSource>
