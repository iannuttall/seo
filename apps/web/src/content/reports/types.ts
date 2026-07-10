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
  | 'canonical'
  | 'core-web-vitals'
  | 'crawlable-links'
  | 'ga4-acquisition'
  | 'google-updates'
  | 'javascript'
  | 'redirects'
  | 'robots'
  | 'robots-meta'
  | 'search-analytics'
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
