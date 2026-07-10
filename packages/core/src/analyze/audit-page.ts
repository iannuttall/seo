import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { queryPageMetrics } from '../gsc/client.js'
import type { RuleId } from '../rules.js'
import type { AuditPageReport, Recommendation } from '../types.js'
import { samePageUrl } from './page-technical-signals.js'
import { estimateSerpTitleWidth } from './title-width.js'

export const AUDIT_PAGE_RULE_IDS = [
  'missing_title',
  'title_too_wide',
  'h1_missing',
  'canonical_invalid',
  'canonical_conflict',
  'canonical_multiple',
  'canonical_outside_head',
  'canonical_mismatch',
] as const satisfies readonly RuleId[]

export type AuditPageDependencies = {
  fetchPage: typeof fetchPage
  queryPageMetrics: typeof queryPageMetrics
  now: () => Date
}

const defaultDependencies: AuditPageDependencies = {
  fetchPage,
  queryPageMetrics,
  now: () => new Date(),
}

function buildRecommendations(report: AuditPageReport): Recommendation[] {
  const recommendations: Recommendation[] = []
  const page = report.page

  if (!page.title) {
    recommendations.push({
      principle: 'C.2',
      evidenceRef: 'The HTML document has no title element.',
      action: 'Add a concise, descriptive title that identifies this page.',
      effort: 'S',
      confidence: 'high',
    })
  }

  if (page.headings.every((heading) => heading.level !== 1)) {
    recommendations.push({
      principle: 'C.4',
      evidenceRef: 'The extracted document has no H1 heading.',
      action: 'Add a descriptive H1 for the page’s main visible topic.',
      effort: 'S',
      confidence: 'high',
    })
  }

  if (
    !page.canonical &&
    (!page.canonicalEvidence || page.canonicalEvidence.status === 'missing')
  ) {
    recommendations.push({
      principle: 'C.7',
      evidenceRef: 'No canonical link tag detected.',
      action:
        'If duplicate or parameter variants exist, declare the preferred canonical URL consistently; otherwise no change is required.',
      effort: 'S',
      confidence: 'medium',
    })
  }

  return recommendations
}

export async function auditPage(
  input: {
    url: string
    site?: string
    js?: boolean | 'auto'
    refresh?: boolean
    extractor?: 'defuddle' | 'readability'
  },
  dependencies: AuditPageDependencies = defaultDependencies,
): Promise<AuditPageReport> {
  const fetched = await dependencies.fetchPage(input.url, {
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

  if (page.title) {
    const titleWidth = estimateSerpTitleWidth(page.title)
    if (titleWidth.status === 'over-reference') {
      issues.push({
        code: 'title_too_wide',
        title: 'Title may truncate on some devices',
        detail: `Estimated title width ${titleWidth.estimatedPixels}px exceeds the ${titleWidth.referencePixels}px review reference.`,
        principle: 'C.3',
        evidenceRef: `Title width estimate: ${titleWidth.estimatedPixels}px using ${titleWidth.profile.id} (${titleWidth.confidence} confidence).`,
        severity: 'low',
      })
    }
  }

  if (h1s.length === 0) {
    issues.push({
      code: 'h1_missing',
      title: 'Missing H1',
      detail: 'No H1 element was found.',
      principle: 'C.4',
      evidenceRef: 'Detected 0 H1 elements.',
      severity: 'low',
    })
  }

  const canonicalEvidence = page.canonicalEvidence
  if (canonicalEvidence?.status === 'conflicting') {
    const targets = [
      ...new Set(
        canonicalEvidence.candidates.flatMap((candidate) =>
          candidate.resolved && !candidate.ignoredReason
            ? [candidate.resolved]
            : [],
        ),
      ),
    ]
    issues.push({
      code: 'canonical_conflict',
      title: 'Canonical declarations conflict',
      detail: `Canonical declarations identify ${targets.length} different targets.`,
      principle: 'C.7',
      evidenceRef: `Canonical targets: ${targets.join(', ')}.`,
      severity: 'high',
    })
  } else if (canonicalEvidence?.status === 'duplicate') {
    issues.push({
      code: 'canonical_multiple',
      title: 'Canonical is declared more than once',
      detail:
        'Multiple eligible declarations identify the same target; keep one canonical method.',
      principle: 'C.7',
      evidenceRef: `${canonicalEvidence.candidates.length} canonical declarations were found for ${canonicalEvidence.selectedUrl}.`,
      severity: 'low',
    })
  } else if (canonicalEvidence?.status === 'outside-head-only') {
    issues.push({
      code: 'canonical_outside_head',
      title: 'Canonical appears outside the document head',
      detail: 'Google only accepts HTML canonical link elements in the head.',
      principle: 'C.7',
      evidenceRef: `Ignored canonical value ${canonicalEvidence.candidates[0]?.raw ?? '(empty)'}.`,
      severity: 'medium',
    })
  } else if (canonicalEvidence?.status === 'invalid') {
    const raw = canonicalEvidence.candidates[0]?.raw ?? '(empty)'
    issues.push({
      code: 'canonical_invalid',
      title: 'Canonical URL is invalid',
      detail: 'The canonical link does not resolve to an HTTP or HTTPS URL.',
      principle: 'C.7',
      evidenceRef: `Canonical value ${raw} is not a valid HTTP or HTTPS URL.`,
      severity: 'high',
    })
  } else if (page.canonical) {
    let canonicalUrl: string | undefined
    try {
      const resolved = new URL(page.canonical, page.finalUrl)
      if (['http:', 'https:'].includes(resolved.protocol)) {
        canonicalUrl = resolved.toString()
      }
    } catch {
      // Report invalid canonical evidence below.
    }
    if (!canonicalUrl) {
      issues.push({
        code: 'canonical_invalid',
        title: 'Canonical URL is invalid',
        detail: 'The canonical link does not resolve to an HTTP or HTTPS URL.',
        principle: 'C.7',
        evidenceRef: `Canonical value ${page.canonical} is not a valid HTTP or HTTPS URL.`,
        severity: 'high',
      })
    } else if (!samePageUrl(canonicalUrl, page.finalUrl)) {
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
    ? await dependencies.queryPageMetrics(input.site, input.url)
    : undefined

  const report: AuditPageReport = {
    url: input.url,
    fetchedAt: dependencies.now().toISOString(),
    page,
    fetchDiagnostics: fetched.diagnostics,
    metrics,
    issues,
    recommendations: [],
    warnings: page.warnings,
  }

  report.recommendations = buildRecommendations(report)
  return report
}
