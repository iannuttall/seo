import type { PageFetchResult } from '../../types.js'
import type { RobotsResult } from './types.js'

export function pageRobotsEvidence(
  robots: RobotsResult,
): NonNullable<PageFetchResult['robotsTxt']> {
  return {
    url: robots.url,
    allowed: robots.allowed,
    availability: robots.availability,
    status: robots.status,
    error: robots.error,
    matchedLine: robots.matchedLine,
  }
}

export function diagnosticRobotsEvidence(
  robots: RobotsResult,
): NonNullable<PageFetchResult['diagnostics']['robotsTxt']> {
  return {
    url: robots.url,
    cache: robots.cache,
    allowed: robots.allowed,
    availability: robots.availability,
    status: robots.status,
    error: robots.error,
  }
}

// Whether a 2xx robots.txt answer is a web page, such as a bot challenge or
// the site's HTML shell, rather than a robots.txt file. A real file never
// starts with markup; a text/html body counts only when it has no robots
// lines, so a real file sent with the wrong type is still read.
export function robotsTxtIsHtml(contentType: string, text: string): boolean {
  const body = text.replace(/^\uFEFF/, '').trimStart()
  return (
    body.startsWith('<') ||
    (/\btext\/html\b/i.test(contentType) &&
      !/^\s*(?:user-agent|allow|disallow|sitemap)\s*:/im.test(body))
  )
}

export const ROBOTS_TXT_HTML_ERROR =
  'robots.txt returned a web page, not a robots.txt file, so its rules are unknown.'
