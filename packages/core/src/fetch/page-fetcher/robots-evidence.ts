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
