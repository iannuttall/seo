import type {
  PageFetchDiagnostics,
  QueryContentClassification,
} from '@seo/core'

// A crawl's start URL from a site: a URL as given, a domain property's
// https home page, or https:// before a bare host such as example.com.
export function startUrlForSite(site: string): string | undefined {
  const value = site.trim()
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('sc-domain:')) return `https://${value.slice(10)}/`
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(value)) {
    return `https://${value.includes('/') ? value : `${value}/`}`
  }
  return undefined
}

export function formatFetchDiagnostics(
  diagnostics?: PageFetchDiagnostics,
): string {
  if (!diagnostics) return '-'
  if (diagnostics.backpressure?.status === 'stopped') {
    return `stopped: ${diagnostics.backpressure.reason ?? 'origin cooldown'}`
  }
  if (diagnostics.backpressure?.status === 'slowed') {
    return `slowed ${diagnostics.backpressure.delayMs}ms`
  }
  if (diagnostics.rendering?.status === 'unavailable') {
    return 'raw HTML; rendering unavailable'
  }
  if (diagnostics.rendering?.status === 'failed') {
    return 'raw HTML; rendering failed'
  }
  if (diagnostics.blocked) return 'blocked'
  if (diagnostics.rendered) return 'rendered'
  if (diagnostics.cache === 'hit') return 'cached'
  if (diagnostics.fetched) return 'fetched'
  return diagnostics.source
}

export function formatContentCheck(
  classification?: QueryContentClassification,
): string {
  if (!classification) return '-'
  if (classification === 'serp-framing') return 'wording gap'
  if (classification === 'content-gap') return 'content gap'
  if (classification === 'technical-check') return 'technical check'
  return 'covered'
}
