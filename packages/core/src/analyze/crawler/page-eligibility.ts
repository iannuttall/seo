import type { CrawlPageSnapshot } from '../monitoring/types.js'

function comparableUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString()
  } catch {
    return value
  }
}

export function isRedirectedPage(page: CrawlPageSnapshot): boolean {
  if (page.metaRefresh) return true
  const requested = comparableUrl(page.url)
  const final = comparableUrl(page.finalUrl)
  return Boolean(requested && final && requested !== final)
}

export function isSuccessfulResponse(page: CrawlPageSnapshot): boolean {
  return page.status >= 200 && page.status < 300
}

export function isHtmlPage(page: CrawlPageSnapshot): boolean {
  return /^\s*(?:text\/html|application\/xhtml\+xml)\b/i.test(
    page.contentType ?? '',
  )
}

export function isAuditableHtmlPage(page: CrawlPageSnapshot): boolean {
  const contentAuditAllowed =
    page.contentAuditAllowed ??
    (!page.blocked && page.robotsTxt?.allowed !== false)
  return (
    isSuccessfulResponse(page) &&
    isHtmlPage(page) &&
    !isRedirectedPage(page) &&
    contentAuditAllowed
  )
}
