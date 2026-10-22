import type { GscRow } from '../../types.js'

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

export type SearchAnalyticsOptions = {
  refresh?: boolean
  accountEmail?: string
}

export type SearchAnalyticsResult = {
  rows: GscRow[]
  calls: number
  rowsFetched: number
}

/**
 * Runs one Search Analytics query and follows pagination up to `maxRows`.
 * The local binding adds the token store and the response cache.
 */
export type SearchAnalyticsQuery = (
  site: string,
  body: SearchAnalyticsRequest,
  opts?: SearchAnalyticsOptions,
) => Promise<SearchAnalyticsResult>

export interface UrlInspectionRequest {
  siteUrl: string
  inspectionUrl: string
  accountEmail?: string
  languageCode?: string
  quotaLimit?: number
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
      sitemap?: string[]
      crawledAs?: string
    }
    mobileUsabilityResult?: unknown
    richResultsResult?: unknown
  }
}
