export const reportCategories = [
  'ai-search',
  'crawl',
  'diagnosis',
  'experiments',
  'monitoring',
  'opportunities',
  'reporting',
  'setup',
  'workflows',
] as const

export type ReportCategory = (typeof reportCategories)[number]

export type ReportSourceKey =
  | 'ai-features'
  | 'ai-mention-provider'
  | 'ai-prompt-provider'
  | 'bing-webmaster'
  | 'canonical'
  | 'core-web-vitals'
  | 'crawlable-links'
  | 'domain-provider-competitors'
  | 'domain-provider-keywords'
  | 'domain-provider-overview'
  | 'domain-provider-pages'
  | 'google-analytics-acquisition'
  | 'google-updates'
  | 'javascript'
  | 'keyword-provider-discovery'
  | 'keyword-provider-metrics'
  | 'redirects'
  | 'robots'
  | 'robots-meta'
  | 'search-analytics'
  | 'server-logs'
  | 'serp-provider-results'
  | 'sitemaps'
  | 'structured-data'
  | 'url-inspection'

export type ReportEditorial = {
  id: string
  name: string
  category: ReportCategory
  summary: string
  question: string
  useWhen: readonly [string, ...string[]]
  avoidWhen: readonly [string, ...string[]]
  evidence: readonly [string, ...string[]]
  methodology: readonly [string, ...string[]]
  exampleParams: Readonly<Record<string, unknown>>
  interpretation: readonly [string, ...string[]]
  caveats: readonly [string, ...string[]]
  nextSteps: readonly [string, ...string[]]
  related: readonly string[]
  sources: readonly ReportSourceKey[]
}

export type ReportSource = {
  key: ReportSourceKey
  label: string
  url: string
}
