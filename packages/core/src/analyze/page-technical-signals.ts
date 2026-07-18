import {
  hasMetaRobotsDirective,
  hasXRobotsDirective,
} from '../robots-directives.js'
import type {
  ExtractedPage,
  PageFetchDiagnostics,
  QueryContentSignal,
} from '../types.js'

export type PageTechnicalSignal = Extract<
  QueryContentSignal,
  | 'http-non-2xx'
  | 'http-no-content'
  | 'blocked'
  | 'fetch-incomplete'
  | 'redirected'
  | 'meta-noindex'
  | 'x-robots-noindex'
  | 'canonical-mismatch'
>

export function normalizePageUrl(value: string): string {
  try {
    const parsed = new URL(value)
    parsed.hash = ''
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/$/, '')
    }
    return parsed.toString()
  } catch {
    return value.trim().replace(/\/$/, '')
  }
}

export function samePageUrl(left: string, right: string): boolean {
  return normalizePageUrl(left) === normalizePageUrl(right)
}

function absoluteUrl(value: string, base: string): string {
  try {
    return new URL(value, base).toString()
  } catch {
    return value
  }
}

export function pageTechnicalSignals(input: {
  url: string
  page?: ExtractedPage
  fetchDiagnostics?: PageFetchDiagnostics
  httpStatus?: number
}): PageTechnicalSignal[] {
  const signals: PageTechnicalSignal[] = []
  if (
    input.httpStatus !== undefined &&
    (input.httpStatus < 200 || input.httpStatus > 299)
  ) {
    signals.push('http-non-2xx')
  }
  if (input.httpStatus === 204 || input.httpStatus === 205) {
    signals.push('http-no-content')
  }
  if (input.fetchDiagnostics?.blocked) signals.push('blocked')
  if (
    input.fetchDiagnostics &&
    !input.fetchDiagnostics.fetched &&
    input.fetchDiagnostics.source !== 'cache'
  ) {
    signals.push('fetch-incomplete')
  }
  if (
    (input.fetchDiagnostics?.redirectChain?.length ?? 0) > 0 ||
    (input.page && !samePageUrl(input.url, input.page.finalUrl))
  ) {
    signals.push('redirected')
  }
  if (hasMetaRobotsDirective(input.page?.metaRobots, 'noindex')) {
    signals.push('meta-noindex')
  }
  if (hasXRobotsDirective(input.page?.xRobotsTag, 'noindex')) {
    signals.push('x-robots-noindex')
  }
  if (
    input.page?.canonical &&
    !samePageUrl(
      input.page.finalUrl,
      absoluteUrl(input.page.canonical, input.page.finalUrl),
    )
  ) {
    signals.push('canonical-mismatch')
  }
  return signals
}
