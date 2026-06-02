import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { queryPageMetrics } from '../gsc/client.js'
import type { AuditPageReport, Recommendation } from '../types.js'
import { normalizeText } from './shared.js'

function titlePixelWidth(title?: string): number {
  return Math.round((title ?? '').length * 9.2)
}

function buildRecommendations(report: AuditPageReport): Recommendation[] {
  const recommendations: Recommendation[] = []
  const page = report.page

  if (
    !page.title ||
    page.headings.filter((heading) => heading.level === 1).length === 0
  ) {
    recommendations.push({
      principle: 'C.2',
      evidenceRef:
        'Primary document labels are incomplete: title or H1 is missing.',
      action:
        'Add a single clear H1 and align the title with the page’s primary query target.',
      effort: 'S',
      confidence: 'high',
    })
  }

  if ((page.wordCount ?? 0) < 300) {
    recommendations.push({
      principle: 'C.5',
      evidenceRef: `Main content extracted only ${page.wordCount} words.`,
      action:
        'Expand the page with missing subtopics that answer the query more completely.',
      effort: 'M',
      confidence: 'medium',
    })
  }

  if (!page.canonical) {
    recommendations.push({
      principle: 'C.7',
      evidenceRef: 'No canonical link tag detected.',
      action:
        'Declare the canonical URL explicitly to remove ambiguity around the preferred URL.',
      effort: 'S',
      confidence: 'medium',
    })
  }

  return recommendations
}

export async function auditPage(input: {
  url: string
  site?: string
  js?: boolean | 'auto'
  refresh?: boolean
  extractor?: 'defuddle' | 'readability'
}): Promise<AuditPageReport> {
  const fetched = await fetchPage(input.url, {
    js: input.js,
    refresh: input.refresh,
  })
  const page = await extractPage(fetched, input.extractor)
  const h1s = page.headings.filter((heading) => heading.level === 1)
  const issues: AuditPageReport['issues'] = []

  if (!page.title) {
    issues.push({
      code: 'missing_title',
      title: 'Title missing',
      detail: 'No <title> element was found.',
      principle: 'C.2',
      evidenceRef: 'HTML document has no <title> element.',
      severity: 'high',
    })
  }

  if (page.title && titlePixelWidth(page.title) > 580) {
    issues.push({
      code: 'title_too_wide',
      title: 'Title likely truncates',
      detail: `Estimated width ${titlePixelWidth(page.title)}px exceeds the usual SERP budget.`,
      principle: 'C.3',
      evidenceRef: `Title "${page.title}" is approximately ${titlePixelWidth(page.title)}px wide.`,
      severity: 'medium',
    })
  }

  if (h1s.length !== 1) {
    issues.push({
      code: 'h1_count',
      title: 'H1 structure issue',
      detail: `Expected one H1, found ${h1s.length}.`,
      principle: 'C.4',
      evidenceRef: `Detected ${h1s.length} H1 elements.`,
      severity: h1s.length === 0 ? 'high' : 'medium',
    })
  }

  if (page.canonical) {
    const canonicalUrl = new URL(page.canonical, page.finalUrl).toString()
    if (normalizeText(canonicalUrl) !== normalizeText(page.finalUrl)) {
      issues.push({
        code: 'canonical_mismatch',
        title: 'Canonical differs from final URL',
        detail: `Canonical points to ${canonicalUrl}, fetched final URL is ${page.finalUrl}.`,
        principle: 'C.7',
        evidenceRef: `Canonical ${canonicalUrl} differs from final URL ${page.finalUrl}.`,
        severity: 'medium',
      })
    }
  }

  const metrics = input.site
    ? await queryPageMetrics(input.site, input.url).catch(() => undefined)
    : undefined

  const report: AuditPageReport = {
    url: input.url,
    fetchedAt: new Date().toISOString(),
    page,
    fetchDiagnostics: fetched.diagnostics,
    metrics,
    issues,
    recommendations: [],
    warnings: fetched.warnings,
  }

  report.recommendations = buildRecommendations(report)
  return report
}
