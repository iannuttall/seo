export interface SearchAnalyticsRequest {
  startDate: string
  endDate: string
  dimensions?: string[]
  type?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews'
  dataState?: 'final' | 'all'
  rowLimit?: number
  maxRows?: number
  startRow?: number
  aggregationType?: 'auto' | 'byPage' | 'byProperty' | 'byNewsShowcasePanel'
  dimensionFilterGroups?: Array<{
    groupType?: 'and'
    filters: Array<{
      dimension: string
      operator:
        | 'equals'
        | 'contains'
        | 'notContains'
        | 'includingRegex'
        | 'excludingRegex'
        | 'notEquals'
      expression: string
    }>
  }>
}

export interface UrlInspectionRequest {
  siteUrl: string
  inspectionUrl: string
  languageCode?: string
}

export interface UrlInspectionResult {
  inspectionResult?: {
    inspectionResultLink?: string
    indexStatusResult?: {
      verdict?: string
      coverageState?: string
      robotsTxtState?: string
      indexingState?: string
      lastCrawlTime?: string
      pageFetchState?: string
      googleCanonical?: string
      userCanonical?: string
      referringUrls?: string[]
      crawledAs?: string
    }
    mobileUsabilityResult?: unknown
    richResultsResult?: unknown
  }
}
