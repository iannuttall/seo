import { explainRule, type RuleId } from '../../rules.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { CrawlIssue } from './report.js'

function titlePixelWidth(title?: string): number {
  return Math.round((title ?? '').length * 9.2)
}

function hasNoIndex(value?: string): boolean {
  return /\bnoindex\b/i.test(value ?? '')
}

function hasNoFollow(value?: string): boolean {
  return /\bnofollow\b/i.test(value ?? '')
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

function absoluteHttpUrl(value?: string): boolean {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function urlKey(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

const SLOW_RESPONSE_MS = 2_000
const DEEP_PAGE_DEPTH = 4
const WEAK_VALUABLE_INLINKS = 1
const TITLE_MIN_CHARS = 30
const TITLE_MAX_PIXELS = 580
const META_DESCRIPTION_MIN_CHARS = 70
const META_DESCRIPTION_MAX_CHARS = 160
const HEADING_STRUCTURE_MIN_WORDS = 300

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

function metadataLength(value?: string): number {
  return Array.from(value?.trim() ?? '').length
}

function normalizedMetadata(value?: string): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ').toLowerCase()
  return normalized || undefined
}

function metadataDuplicates(
  pages: CrawlPageSnapshot[],
  read: (page: CrawlPageSnapshot) => string | undefined,
): Map<string, { count: number; sampleUrls: string[]; value: string }> {
  const counts = new Map<
    string,
    { count: number; sampleUrls: string[]; value: string }
  >()
  for (const page of pages) {
    if (page.status < 200 || page.status >= 300) continue
    const raw = read(page)?.trim()
    const key = normalizedMetadata(raw)
    if (!key || !raw) continue
    const existing = counts.get(key) ?? { count: 0, sampleUrls: [], value: raw }
    existing.count += 1
    if (existing.sampleUrls.length < 10) existing.sampleUrls.push(page.url)
    counts.set(key, existing)
  }
  return new Map([...counts].filter(([, value]) => value.count > 1))
}

export function auditCrawlPages(
  pages: CrawlPageSnapshot[],
  opts: { startUrl?: string } = {},
): CrawlIssue[] {
  const issues: CrawlIssue[] = []
  const duplicateTitles = metadataDuplicates(pages, (page) => page.title)
  const duplicateDescriptions = metadataDuplicates(
    pages,
    (page) => page.metaDescription,
  )
  const pageByUrl = new Map<string, CrawlPageSnapshot>()
  for (const page of pages) {
    for (const value of [page.url, page.finalUrl]) {
      const key = urlKey(value)
      if (key) pageByUrl.set(key, page)
    }
  }

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

    const title = page.title?.trim()
    const titleLength = metadataLength(title)
    const titleWidth = titlePixelWidth(title)
    const duplicateTitle = duplicateTitles.get(normalizedMetadata(title) ?? '')
    if (!title) {
      issues.push(issue('missing_title', page))
    } else if (titleLength < TITLE_MIN_CHARS) {
      issues.push(
        issue('title_too_short', page, `${titleLength} chars`, {
          title,
          length: titleLength,
          minLength: TITLE_MIN_CHARS,
        }),
      )
    } else if (titleWidth > TITLE_MAX_PIXELS) {
      issues.push(
        issue('title_too_wide', page, `${titleWidth}px`, {
          title,
          estimatedPixels: titleWidth,
          maxPixels: TITLE_MAX_PIXELS,
        }),
      )
    }
    if (title && duplicateTitle) {
      issues.push(
        issue('title_duplicate', page, duplicateTitle.value, {
          title,
          duplicateCount: duplicateTitle.count,
          sampleUrls: duplicateTitle.sampleUrls,
        }),
      )
    }

    const metaDescription = page.metaDescription?.trim()
    const metaDescriptionLength = metadataLength(metaDescription)
    const duplicateDescription = duplicateDescriptions.get(
      normalizedMetadata(metaDescription) ?? '',
    )
    if (!metaDescription) {
      issues.push(issue('missing_meta_description', page))
    } else if (metaDescriptionLength < META_DESCRIPTION_MIN_CHARS) {
      issues.push(
        issue(
          'meta_description_too_short',
          page,
          `${metaDescriptionLength} chars`,
          {
            metaDescription,
            length: metaDescriptionLength,
            minLength: META_DESCRIPTION_MIN_CHARS,
          },
        ),
      )
    } else if (metaDescriptionLength > META_DESCRIPTION_MAX_CHARS) {
      issues.push(
        issue(
          'meta_description_too_long',
          page,
          `${metaDescriptionLength} chars`,
          {
            metaDescription,
            length: metaDescriptionLength,
            maxLength: META_DESCRIPTION_MAX_CHARS,
          },
        ),
      )
    }
    if (metaDescription && duplicateDescription) {
      issues.push(
        issue('meta_description_duplicate', page, duplicateDescription.value, {
          metaDescription,
          duplicateCount: duplicateDescription.count,
          sampleUrls: duplicateDescription.sampleUrls,
        }),
      )
    }

    const h1Count = page.h1Count ?? (page.h1 ? 1 : 0)
    if (h1Count === 0) {
      issues.push(
        issue('h1_missing', page, 'No H1 found', {
          h1Count,
        }),
      )
    } else if (h1Count > 1) {
      issues.push(
        issue('multiple_h1', page, `Found ${h1Count} H1 elements`, {
          h1Count,
        }),
      )
    }
    if (
      page.indexable &&
      page.wordCount >= HEADING_STRUCTURE_MIN_WORDS &&
      (page.h2Count ?? 0) + (page.h3Count ?? 0) === 0
    ) {
      issues.push(
        issue(
          'heading_structure_weak',
          page,
          'No supporting H2 or H3 headings',
          {
            h2Count: page.h2Count ?? 0,
            h3Count: page.h3Count ?? 0,
            wordCount: page.wordCount,
            minWords: HEADING_STRUCTURE_MIN_WORDS,
          },
        ),
      )
    }

    if (!page.canonical) {
      issues.push(issue('canonical_missing', page))
    } else {
      if (page.canonicalRaw && !absoluteHttpUrl(page.canonicalRaw)) {
        issues.push(
          issue('canonical_non_absolute', page, page.canonicalRaw, {
            canonicalRaw: page.canonicalRaw,
            canonical: page.canonical,
          }),
        )
      }
      const canonicalTarget = pageByUrl.get(urlKey(page.canonical) ?? '')
      if (
        canonicalTarget?.canonical &&
        !sameUrl(canonicalTarget.canonical, page.canonical)
      ) {
        issues.push(
          issue('canonical_chain', page, page.canonical, {
            canonical: page.canonical,
            nextCanonical: canonicalTarget.canonical,
            chain: [page.finalUrl, page.canonical, canonicalTarget.canonical],
          }),
        )
      }
    }
    if (page.canonical && !sameUrl(page.canonical, page.finalUrl)) {
      issues.push(
        issue('canonical_mismatch', page, page.canonical, {
          canonical: page.canonical,
          finalUrl: page.finalUrl,
        }),
      )
    }

    if (page.robotsTxt?.allowed === false) {
      issues.push(
        issue('robots_blocked', page, page.robotsTxt.matchedLine, {
          robotsTxt: page.robotsTxt,
        }),
      )
    }

    const metaNoindex = hasNoIndex(page.metaRobots)
    const xRobotsNoindex = hasNoIndex(page.xRobotsTag)
    if (metaNoindex) {
      issues.push(
        issue('noindex', page, page.indexability, {
          metaRobots: page.metaRobots,
        }),
      )
    }
    if (!metaNoindex && xRobotsNoindex) {
      issues.push(
        issue('x_robots_noindex', page, page.xRobotsTag, {
          xRobotsTag: page.xRobotsTag,
        }),
      )
    }
    if (hasNoFollow(page.metaRobots) || hasNoFollow(page.xRobotsTag)) {
      issues.push(
        issue('nofollow', page, page.metaRobots ?? page.xRobotsTag, {
          metaRobots: page.metaRobots,
          xRobotsTag: page.xRobotsTag,
        }),
      )
    }
    if (
      page.canonical &&
      !sameUrl(page.canonical, page.finalUrl) &&
      (page.indexable === false || /canonical/i.test(page.indexability ?? ''))
    ) {
      issues.push(
        issue('canonicalized_page', page, page.canonical, {
          canonical: page.canonical,
          finalUrl: page.finalUrl,
          indexability: page.indexability,
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
