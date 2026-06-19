import { explainRule, type RuleId } from '../../rules.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { CrawlIssue } from './report.js'

function titlePixelWidth(title?: string): number {
  return Math.round((title ?? '').length * 9.2)
}

function hasNoIndex(value?: string): boolean {
  return /\bnoindex\b/i.test(value ?? '')
}

function sameUrl(a?: string, b?: string): boolean {
  if (!a || !b) return false
  try {
    const left = new URL(a)
    const right = new URL(b)
    left.hash = ''
    right.hash = ''
    return left.toString() === right.toString()
  } catch {
    return a === b
  }
}

const SLOW_RESPONSE_MS = 2_000
const DEEP_PAGE_DEPTH = 4
const WEAK_VALUABLE_INLINKS = 1

function issue(
  ruleId: RuleId,
  page: CrawlPageSnapshot,
  detail?: string,
  evidence?: Record<string, unknown>,
): CrawlIssue {
  const rule = explainRule(ruleId)
  if (!rule) {
    throw new Error(`Missing rule guidance for ${ruleId}`)
  }
  return {
    ruleId,
    title: rule.title,
    category: rule.category,
    severity: rule.defaultSeverity,
    url: page.url,
    detail,
    evidence,
    searchMetrics: page.searchMetrics,
  }
}

function isBrokenLinkStatus(status?: number): boolean {
  return (
    status === 0 || status === 404 || status === 410 || (status ?? 0) >= 500
  )
}

function isValuablePage(page: CrawlPageSnapshot): boolean {
  return (
    (page.searchMetrics?.clicks ?? 0) > 0 ||
    (page.searchMetrics?.impressions ?? 0) >= 100 ||
    (page.analytics?.sessions ?? 0) >= 25
  )
}

export function auditCrawlPages(
  pages: CrawlPageSnapshot[],
  opts: { startUrl?: string } = {},
): CrawlIssue[] {
  const issues: CrawlIssue[] = []

  for (const page of pages) {
    if (page.status === 0) {
      issues.push(
        issue('connection_error', page, page.error, {
          status: page.status,
          error: page.error,
        }),
      )
      continue
    }
    if (page.status >= 500) {
      issues.push(
        issue('server_error', page, String(page.status), {
          status: page.status,
        }),
      )
      if ((page.internalInlinkCount ?? 0) > 0) {
        issues.push(
          issue('broken_internal_link', page, String(page.status), {
            status: page.status,
            internalInlinkCount: page.internalInlinkCount,
          }),
        )
      }
      continue
    }
    if (page.status >= 400) {
      issues.push(
        issue('client_error', page, String(page.status), {
          status: page.status,
        }),
      )
      if (
        isBrokenLinkStatus(page.status) &&
        (page.internalInlinkCount ?? 0) > 0
      ) {
        issues.push(
          issue('broken_internal_link', page, String(page.status), {
            status: page.status,
            internalInlinkCount: page.internalInlinkCount,
          }),
        )
      }
      continue
    }
    if (page.status >= 300) {
      issues.push(
        issue('redirected_url', page, `Status ${page.status}`, {
          requestedUrl: page.url,
          finalUrl: page.finalUrl,
          status: page.status,
        }),
      )
      continue
    }
    if (page.status < 200) continue

    if (!sameUrl(page.url, page.finalUrl)) {
      issues.push(
        issue('redirected_url', page, `Final URL: ${page.finalUrl}`, {
          requestedUrl: page.url,
          finalUrl: page.finalUrl,
          status: page.status,
        }),
      )
    }
    const redirectChain = page.fetchDiagnostics?.redirectChain ?? []
    if (redirectChain.length > 1) {
      issues.push(
        issue('redirect_chain', page, `${redirectChain.length} hops`, {
          redirectChain,
          hops: redirectChain.length,
        }),
      )
    }
    if ((page.responseTimeMs ?? 0) > SLOW_RESPONSE_MS) {
      issues.push(
        issue('slow_response', page, `${page.responseTimeMs}ms`, {
          responseTimeMs: page.responseTimeMs,
          thresholdMs: SLOW_RESPONSE_MS,
        }),
      )
    }
    for (const link of page.externalLinkChecks ?? []) {
      if (!isBrokenLinkStatus(link.status)) continue
      issues.push(
        issue('broken_external_link', page, link.url, {
          url: link.url,
          status: link.status,
          error: link.error,
        }),
      )
    }
    if (
      page.indexable &&
      (page.internalInlinkCount ?? 0) === 0 &&
      !sameUrl(page.url, opts.startUrl)
    ) {
      issues.push(
        issue('orphan_page', page, 'No internal inlinks', {
          internalInlinkCount: page.internalInlinkCount ?? 0,
        }),
      )
    }
    if ((page.crawlDepth ?? 0) > DEEP_PAGE_DEPTH) {
      issues.push(
        issue('deep_page', page, `Depth ${page.crawlDepth}`, {
          crawlDepth: page.crawlDepth,
          threshold: DEEP_PAGE_DEPTH,
        }),
      )
    }
    if (
      page.indexable &&
      isValuablePage(page) &&
      (page.internalInlinkCount ?? 0) <= WEAK_VALUABLE_INLINKS
    ) {
      issues.push(
        issue(
          'weak_internal_links_to_valuable_page',
          page,
          `${page.internalInlinkCount ?? 0} internal inlinks`,
          {
            internalInlinkCount: page.internalInlinkCount ?? 0,
            searchMetrics: page.searchMetrics,
            analytics: page.analytics,
          },
        ),
      )
    }

    if (!page.title) {
      issues.push(issue('missing_title', page))
    } else if (titlePixelWidth(page.title) > 580) {
      issues.push(
        issue('title_too_wide', page, `${titlePixelWidth(page.title)}px`, {
          title: page.title,
          estimatedPixels: titlePixelWidth(page.title),
        }),
      )
    }

    if (!page.metaDescription) {
      issues.push(issue('missing_meta_description', page))
    }

    if ((page.h1Count ?? (page.h1 ? 1 : 0)) !== 1) {
      issues.push(
        issue('h1_count', page, `Found ${page.h1Count ?? 0} H1 elements`, {
          h1Count: page.h1Count ?? 0,
        }),
      )
    }

    if (!page.canonical) {
      issues.push(issue('canonical_missing', page))
    } else if (!sameUrl(page.canonical, page.finalUrl)) {
      issues.push(
        issue('canonical_mismatch', page, page.canonical, {
          canonical: page.canonical,
          finalUrl: page.finalUrl,
        }),
      )
    }

    if (hasNoIndex(page.metaRobots) || hasNoIndex(page.xRobotsTag)) {
      issues.push(
        issue('noindex', page, page.indexability, {
          metaRobots: page.metaRobots,
          xRobotsTag: page.xRobotsTag,
        }),
      )
    }

    if (page.wordCount < 300) {
      issues.push(
        issue('thin_content', page, `${page.wordCount} words`, {
          wordCount: page.wordCount,
        }),
      )
    }

    if ((page.imagesMissingAlt ?? 0) > 0) {
      issues.push(
        issue(
          'image_missing_alt',
          page,
          `${page.imagesMissingAlt} of ${page.imagesTotal ?? 0} images`,
          {
            imagesTotal: page.imagesTotal,
            imagesMissingAlt: page.imagesMissingAlt,
          },
        ),
      )
    }

    if (!page.hasViewport) {
      issues.push(issue('viewport_missing', page))
    }
    if (!page.lang) {
      issues.push(issue('lang_missing', page))
    }
    if (!page.schemaTypes?.length) {
      issues.push(issue('structured_data_missing', page))
    }
    if (!page.openGraphTitle) {
      issues.push(issue('og_title_missing', page))
    }
    if (!page.twitterCard) {
      issues.push(issue('twitter_card_missing', page))
    }

    if (page.wordCount > 50) {
      if (!page.geo?.structuredData) {
        issues.push(issue('geo_no_structured_data', page))
      }
      if (!page.geo?.answerable) {
        issues.push(issue('geo_not_answerable', page))
      }
      if (!page.geo?.hasAuthor) {
        issues.push(issue('geo_no_author', page))
      }
      if (!page.geo?.semanticHtml) {
        issues.push(issue('geo_no_semantic_html', page))
      }
    }
  }

  return issues
}
