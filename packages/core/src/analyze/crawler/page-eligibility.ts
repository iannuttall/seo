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

/**
 * Cloudflare serves its own endpoints under `/cdn-cgi/`, such as the email
 * obfuscation link `/cdn-cgi/l/email-protection`. They are not site pages.
 */
export function isCdnUtilityUrl(value: string): boolean {
  try {
    return new URL(value).pathname.startsWith('/cdn-cgi/')
  } catch {
    return false
  }
}

function globMatch(pattern: string, value: string): boolean {
  if (!pattern.includes('*')) return value.includes(pattern)
  const parts = pattern.split('*')
  let position = 0
  for (const part of parts) {
    if (!part) continue
    const found = value.slice(position).indexOf(part)
    if (found === -1) return false
    position += found + part.length
  }
  return true
}

export function passesFilters(
  url: string,
  include: string[],
  exclude: string[],
): boolean {
  return (
    (!include.length || include.some((pattern) => globMatch(pattern, url))) &&
    !exclude.some((pattern) => globMatch(pattern, url))
  )
}
