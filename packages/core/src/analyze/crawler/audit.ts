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

export function auditCrawlPages(pages: CrawlPageSnapshot[]): CrawlIssue[] {
  const issues: CrawlIssue[] = []

  for (const page of pages) {
    if (page.status >= 500) {
      issues.push(
        issue('server_error', page, String(page.status), {
          status: page.status,
        }),
      )
      continue
    }
    if (page.status >= 400) {
      issues.push(
        issue('client_error', page, String(page.status), {
          status: page.status,
        }),
      )
      continue
    }
    if (page.status < 200 || page.status >= 300) continue

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
