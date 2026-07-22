import type { ReportSource, ReportSourceKey } from './types'

export const reportSources = {
  'ai-features': {
    key: 'ai-features',
    label: 'Google guidance for AI features and websites',
    url: 'https://developers.google.com/search/docs/appearance/ai-features',
  },
  'ai-mention-provider': {
    key: 'ai-mention-provider',
    label: 'DataForSEO LLM Mentions API reference',
    url: 'https://docs.dataforseo.com/v3/ai_optimization/llm_mentions/search_mentions/live/',
  },
  'ai-prompt-provider': {
    key: 'ai-prompt-provider',
    label: 'DataForSEO AI Optimization API reference',
    url: 'https://docs.dataforseo.com/v3/ai_optimization/overview/',
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
  'domain-provider-competitors': {
    key: 'domain-provider-competitors',
    label: 'DataForSEO SERP competitors API reference',
    url: 'https://docs.dataforseo.com/v3/dataforseo_labs-google-serp_competitors-live/',
  },
  'domain-provider-keywords': {
    key: 'domain-provider-keywords',
    label: 'DataForSEO ranked keywords API reference',
    url: 'https://docs.dataforseo.com/v3/dataforseo_labs-google-ranked_keywords-live/',
  },
  'domain-provider-overview': {
    key: 'domain-provider-overview',
    label: 'DataForSEO domain rank overview API reference',
    url: 'https://docs.dataforseo.com/v3/dataforseo_labs-google-domain_rank_overview-live/',
  },
  'domain-provider-pages': {
    key: 'domain-provider-pages',
    label: 'DataForSEO relevant pages API reference',
    url: 'https://docs.dataforseo.com/v3/dataforseo_labs-google-relevant_pages-live/',
  },
  'google-analytics-acquisition': {
    key: 'google-analytics-acquisition',
    label: 'Google Analytics traffic acquisition guidance',
    url: 'https://support.google.com/analytics/answer/12923437',
  },
  'google-analytics-geography': {
    key: 'google-analytics-geography',
    label: 'Google Analytics dimensions and metrics reference',
    url: 'https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema',
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
  'local-research-files': {
    key: 'local-research-files',
    label: 'Local provider export format and evidence limits',
    url: '/docs/research-providers#use-ranked-keyword-exports-without-api-access',
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
