import {
  hasMetaRobotsDirective,
  hasXRobotsDirective,
} from '../../robots-directives.js'
import { explainRule, type RuleId } from '../../rules.js'
import type {
  CrawlPageSnapshot,
  CrawlRequestObservation,
} from '../monitoring/types.js'
import { estimateSerpTitleWidth } from '../title-width.js'
import {
  isAuditableHtmlPage,
  isHtmlPage,
  isRedirectedPage,
} from './page-eligibility.js'
import type { CrawlIssue } from './report.js'

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
const LARGE_HTML_BYTES = 2 * 1024 * 1024
const COMPRESSION_MIN_BYTES = 4 * 1024
const DEEP_PAGE_DEPTH = 4
const WEAK_VALUABLE_INLINKS = 1
const QUERY_COVERAGE_MIN_IMPRESSIONS = 50
const QUERY_COVERAGE_MIN = 0.6
const OVERSIZED_IMAGE_CANDIDATE_LIMIT = 2000

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

function requestIssue(
  ruleId: RuleId,
  request: CrawlRequestObservation,
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
    url: request.requestedUrl,
    detail,
    evidence,
  }
}

function isBrokenLinkStatus(status?: number): boolean {
  return (
    status === 0 || status === 404 || status === 410 || (status ?? 0) >= 500
  )
}

function hasRecognizableHreflangFormat(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized === 'x-default' ||
    /^[a-z]{2}(?:-[a-z]{4})?(?:-[a-z]{2})?$/.test(normalized)
  )
}

function isValuablePage(page: CrawlPageSnapshot): boolean {
  return (
    (page.searchMetrics?.clicks ?? 0) > 0 ||
    (page.searchMetrics?.impressions ?? 0) >= 100 ||
    (page.analytics?.sessions ?? 0) >= 25
  )
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
    if (!isAuditableHtmlPage(page)) continue
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

function contentDuplicates(
  pages: CrawlPageSnapshot[],
): Map<string, { count: number; sampleUrls: string[] }> {
  const counts = new Map<string, { count: number; sampleUrls: string[] }>()
  for (const page of pages) {
    if (!isAuditableHtmlPage(page)) continue
    if (page.wordCount < 20 || !page.mainContentHash) continue
    const existing = counts.get(page.mainContentHash) ?? {
      count: 0,
      sampleUrls: [],
    }
    existing.count += 1
    if (existing.sampleUrls.length < 10) existing.sampleUrls.push(page.url)
    counts.set(page.mainContentHash, existing)
  }
  return new Map([...counts].filter(([, value]) => value.count > 1))
}

const QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'for',
  'from',
  'how',
  'in',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'what',
  'with',
])

function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 2 && !QUERY_STOP_WORDS.has(term)),
    ),
  ]
}

function queryCoverage(page: CrawlPageSnapshot):
  | {
      query: string
      matchedTerms: string[]
      missingTerms: string[]
      coverage: number
    }
  | undefined {
  const query = page.topQuery?.query
  if (
    !query ||
    (page.topQuery?.impressions ?? 0) < QUERY_COVERAGE_MIN_IMPRESSIONS
  ) {
    return undefined
  }
  const terms = queryTerms(query)
  if (!terms.length) return undefined
  const haystack = [
    page.title,
    page.metaDescription,
    page.h1,
    page.contentSample,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const matchedTerms = terms.filter((term) => haystack.includes(term))
  const missingTerms = terms.filter((term) => !haystack.includes(term))
  return {
    query,
    matchedTerms,
    missingTerms,
    coverage: matchedTerms.length / terms.length,
  }
}

export function auditCrawlRequests(
  requests: CrawlRequestObservation[],
): CrawlIssue[] {
  const issues: CrawlIssue[] = []
  for (const request of requests) {
    if (request.outcome === 'failure') {
      if (request.failureKind === 'aborted') continue
      issues.push(
        requestIssue('connection_error', request, request.error, {
          outcome: request.outcome,
          failureKind: request.failureKind,
          durationMs: request.durationMs,
          error: request.error,
        }),
      )
      continue
    }
    if (request.outcome === 'skipped') continue

    const redirectChain = request.redirectChain ?? []
    const redirected =
      redirectChain.length > 0 ||
      !sameUrl(request.requestedUrl, request.finalUrl)
    if (redirected) {
      issues.push(
        requestIssue(
          'redirected_url',
          request,
          request.finalUrl ? `Final URL: ${request.finalUrl}` : undefined,
          {
            requestedUrl: request.requestedUrl,
            finalUrl: request.finalUrl,
            status: redirectChain[0]?.status,
            finalStatus: request.status,
          },
        ),
      )
    }
    if (redirectChain.length > 1) {
      issues.push(
        requestIssue(
          'redirect_chain',
          request,
          `${redirectChain.length} hops`,
          {
            redirectChain,
            hops: redirectChain.length,
          },
        ),
      )
    }
  }
  return issues
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
  const duplicateContent = contentDuplicates(pages)
  const pageByUrl = new Map<string, CrawlPageSnapshot>()
  for (const page of pages) {
    if (!isAuditableHtmlPage(page)) continue
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

    const redirected = isRedirectedPage(page)
    if (redirected) {
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
    if (redirected) continue

    if (isHtmlPage(page) && (page.sizeBytes ?? 0) > LARGE_HTML_BYTES) {
      issues.push(
        issue(
          'large_html',
          page,
          `${Math.round((page.sizeBytes ?? 0) / 1024)} KB`,
          {
            sizeBytes: page.sizeBytes,
            thresholdBytes: LARGE_HTML_BYTES,
          },
        ),
      )
    }
    if (
      isHtmlPage(page) &&
      !page.compression &&
      (page.sizeBytes ?? 0) > COMPRESSION_MIN_BYTES
    ) {
      issues.push(
        issue('no_compression', page, undefined, {
          sizeBytes: page.sizeBytes,
          thresholdBytes: COMPRESSION_MIN_BYTES,
          compression: page.compression,
        }),
      )
    }
    if (page.isHttps === false) {
      issues.push(
        issue('http_not_secure', page, undefined, {
          finalUrl: page.finalUrl,
        }),
      )
    } else if (page.isHttps === true) {
      if ((page.mixedContentCount ?? 0) > 0) {
        issues.push(
          issue(
            'mixed_content',
            page,
            `${page.mixedContentCount} insecure resources`,
            {
              mixedContentCount: page.mixedContentCount,
              mixedContentSamples: page.mixedContentSamples,
            },
          ),
        )
      }
      if (page.hasHsts === false) {
        issues.push(
          issue('hsts_missing', page, undefined, {
            header: 'strict-transport-security',
          }),
        )
      }
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

    if (page.robotsTxt?.allowed === false) {
      issues.push(
        issue('robots_blocked', page, page.robotsTxt.matchedLine, {
          robotsTxt: page.robotsTxt,
        }),
      )
    }
    const xRobotsNoindex = hasXRobotsDirective(page.xRobotsTag, 'noindex')
    if (xRobotsNoindex) {
      issues.push(
        issue('x_robots_noindex', page, page.xRobotsTag, {
          xRobotsTag: page.xRobotsTag,
        }),
      )
    }
    const xRobotsNofollow = hasXRobotsDirective(page.xRobotsTag, 'nofollow')
    if (xRobotsNofollow) {
      issues.push(
        issue('nofollow', page, page.xRobotsTag, {
          xRobotsTag: page.xRobotsTag,
        }),
      )
    }
    if (!isAuditableHtmlPage(page)) continue

    const title = page.title?.trim()
    const titleWidth = title ? estimateSerpTitleWidth(title) : undefined
    const duplicateTitle = duplicateTitles.get(normalizedMetadata(title) ?? '')
    if (!title) {
      issues.push(issue('missing_title', page))
    } else if (titleWidth?.status === 'over-reference') {
      issues.push(
        issue('title_too_wide', page, `${titleWidth.estimatedPixels}px`, {
          title,
          ...titleWidth,
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
    const duplicateDescription = duplicateDescriptions.get(
      normalizedMetadata(metaDescription) ?? '',
    )
    if (!metaDescription) {
      issues.push(issue('missing_meta_description', page))
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
    }
    if (page.canonicalStatus === 'conflicting') {
      issues.push(
        issue('canonical_conflict', page, undefined, {
          candidates: page.canonicalCandidates,
        }),
      )
    } else if (page.canonicalStatus === 'duplicate') {
      issues.push(
        issue('canonical_multiple', page, page.canonical, {
          canonical: page.canonical,
          candidates: page.canonicalCandidates,
        }),
      )
    } else if (page.canonicalStatus === 'outside-head-only') {
      issues.push(
        issue('canonical_outside_head', page, page.canonicalRaw, {
          candidates: page.canonicalCandidates,
        }),
      )
    }

    if (
      !page.canonical &&
      !['conflicting', 'outside-head-only'].includes(page.canonicalStatus ?? '')
    ) {
      issues.push(
        page.canonicalRaw
          ? issue('canonical_invalid', page, page.canonicalRaw, {
              canonicalRaw: page.canonicalRaw,
            })
          : issue('canonical_missing', page),
      )
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
    const metaNoindex = hasMetaRobotsDirective(page.metaRobots, 'noindex')
    if (metaNoindex) {
      issues.push(
        issue('noindex', page, page.indexability, {
          metaRobots: page.metaRobots,
        }),
      )
    }
    if (
      hasMetaRobotsDirective(page.metaRobots, 'nofollow') &&
      !xRobotsNofollow
    ) {
      issues.push(
        issue('nofollow', page, page.metaRobots, {
          metaRobots: page.metaRobots,
        }),
      )
    }
    const canonicalized =
      page.canonical &&
      !sameUrl(page.canonical, page.finalUrl) &&
      (page.declaredIndexability === 'canonical-hint-other' ||
        (page.declaredIndexability === undefined &&
          /canonical/i.test(page.indexability ?? '')))
    if (canonicalized) {
      issues.push(
        issue('canonicalized_page', page, page.canonical, {
          canonical: page.canonical,
          finalUrl: page.finalUrl,
          indexability: page.indexability,
        }),
      )
    } else if (page.canonical && !sameUrl(page.canonical, page.finalUrl)) {
      issues.push(
        issue('canonical_mismatch', page, page.canonical, {
          canonical: page.canonical,
          finalUrl: page.finalUrl,
        }),
      )
    }

    const contentDuplicate = page.mainContentHash
      ? duplicateContent.get(page.mainContentHash)
      : undefined
    if (contentDuplicate) {
      issues.push(
        issue('duplicate_content', page, 'Duplicate main content', {
          mainContentHash: page.mainContentHash,
          duplicateCount: contentDuplicate.count,
          sampleUrls: contentDuplicate.sampleUrls,
        }),
      )
    }
    const coverage = queryCoverage(page)
    if (coverage && coverage.coverage < QUERY_COVERAGE_MIN) {
      issues.push(
        issue('query_coverage_missing', page, coverage.query, {
          query: coverage.query,
          impressions: page.topQuery?.impressions,
          matchedTerms: coverage.matchedTerms,
          missingTerms: coverage.missingTerms,
          coverage: coverage.coverage,
          threshold: QUERY_COVERAGE_MIN,
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
    if (page.oversizedImageCandidates?.length) {
      issues.push(
        issue(
          'image_oversized_candidate',
          page,
          `${page.oversizedImageCandidates.length} image candidate${page.oversizedImageCandidates.length === 1 ? '' : 's'}`,
          {
            thresholdPx: OVERSIZED_IMAGE_CANDIDATE_LIMIT,
            candidates: page.oversizedImageCandidates.slice(0, 10),
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
    const hreflang = page.hreflang ?? []
    if (hreflang.length) {
      const malformed = hreflang.filter(
        (item) => !hasRecognizableHreflangFormat(item.hreflang),
      )
      if (malformed.length) {
        issues.push(
          issue('hreflang_invalid', page, `${malformed.length} malformed`, {
            malformed,
          }),
        )
      }
      const duplicateCodes = [
        ...new Set(
          hreflang
            .map((item) => item.hreflang.trim().toLowerCase())
            .filter((code, index, values) => values.indexOf(code) !== index),
        ),
      ]
      if (duplicateCodes.length) {
        issues.push(
          issue('hreflang_duplicate', page, duplicateCodes.join(', '), {
            duplicateCodes,
          }),
        )
      }
      const hasSelfReference = hreflang.some((item) =>
        sameUrl(item.href, page.finalUrl),
      )
      if (!hasSelfReference) {
        issues.push(
          issue('hreflang_incomplete', page, page.lang, {
            lang: page.lang,
            finalUrl: page.finalUrl,
            hreflang,
          }),
        )
      }
    }
    if ((page.invalidJsonLdCount ?? 0) > 0) {
      issues.push(
        issue('jsonld_invalid', page, `${page.invalidJsonLdCount} invalid`, {
          invalidJsonLdCount: page.invalidJsonLdCount,
          invalidJsonLdSamples: page.invalidJsonLdSamples,
        }),
      )
    }
    const incompleteRichResults = (page.googleRichResults ?? []).filter(
      (assessment) => assessment.status === 'missing-required-properties',
    )
    const selectedIncompleteCount =
      page.googleRichResultsSelection?.eligibleByStatus[
        'missing-required-properties'
      ] ?? 0
    const incompleteRichResultCount = Math.max(
      incompleteRichResults.length,
      selectedIncompleteCount,
    )
    if (incompleteRichResultCount) {
      const details = incompleteRichResults.map(
        (assessment) =>
          `${assessment.schemaType}: ${assessment.missingRequiredProperties.join(', ')}`,
      )
      const omittedDetails = incompleteRichResultCount - details.length
      issues.push(
        issue(
          'rich_result_required_fields_missing',
          page,
          [
            ...details,
            ...(omittedDetails > 0
              ? [
                  `${omittedDetails} more incomplete assessment${omittedDetails === 1 ? '' : 's'} omitted from bounded detail`,
                ]
              : []),
          ].join('; '),
          {
            assessments: incompleteRichResults,
            ...(page.googleRichResultsSelection
              ? { selection: page.googleRichResultsSelection }
              : {}),
          },
        ),
      )
    }
    if (!page.openGraphTitle) {
      issues.push(issue('og_title_missing', page))
    }
    if (!page.openGraphDescription) {
      issues.push(issue('og_description_missing', page))
    }
    if (!page.openGraphImage) {
      issues.push(issue('og_image_missing', page))
    }
    if (!page.twitterCard) {
      issues.push(issue('twitter_card_missing', page))
    }
  }

  return issues
}
