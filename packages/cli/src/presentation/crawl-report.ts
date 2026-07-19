import {
  type CrawlReport,
  explainRule,
  reviewObservations,
  type TopFix,
  topFixes,
} from '@seo/core'
import { printSemanticReport } from '../utils.js'

function issueStatus(severity: TopFix['severity']): 'fail' | 'warning' {
  return severity === 'high' ? 'fail' : 'warning'
}

export function printCrawlHuman(
  report: CrawlReport,
  fixes: TopFix[] = topFixes(report),
): void {
  const reviews = reviewObservations(report)
  const status =
    report.status === 'failed' || report.summary.highIssues > 0
      ? 'fail'
      : report.status === 'partial'
        ? 'unknown'
        : report.summary.mediumIssues > 0 || report.summary.lowIssues > 0
          ? 'warning'
          : 'pass'
  const accessDiagnostics = report.access.samples.slice(0, 5).map((sample) => ({
    status: 'fail' as const,
    title: sample.evidence.guidance.summary,
    explanation: `${sample.evidence.provider} returned ${sample.evidence.kind} evidence for the crawler request.`,
    evidence: [sample.url],
    fix: sample.evidence.guidance.recommendedAction,
  }))
  const fixDiagnostics = fixes.slice(0, 10).map((fix) => ({
    status: issueStatus(fix.severity),
    title: `${fix.title} on ${fix.count} ${fix.count === 1 ? 'URL' : 'URLs'}`,
    explanation: explainRule(fix.ruleId)?.whyItMatters ?? fix.whyThisRanks,
    evidence: fix.sampleUrls.slice(0, 5),
    fix: fix.howToFix,
  }))
  const reviewDiagnostics = reviews.slice(0, 10).map((review) => ({
    status: 'warning' as const,
    title: `${review.title} on ${review.count} ${review.count === 1 ? 'URL' : 'URLs'}`,
    explanation:
      explainRule(review.ruleId)?.whyItMatters ?? review.whyThisRanks,
    evidence: review.sampleUrls.slice(0, 5),
    fix: review.howToFix,
  }))

  printSemanticReport({
    title:
      report.config.strategy === 'health'
        ? 'Sitemap health pass'
        : 'Site crawl',
    target: report.config.url,
    status,
    summary:
      report.status === 'partial'
        ? `Partial evidence from ${report.summary.totalPages} retained pages. Review the caveats before treating missing findings as an all-clear.`
        : `${report.summary.totalPages} pages retained with ${report.issues.length} findings.`,
    metrics: [
      { label: 'Pages', value: report.summary.totalPages },
      {
        label: 'High',
        value: report.summary.highIssues,
        status: 'fail',
      },
      {
        label: 'Medium',
        value: report.summary.mediumIssues,
        status: 'warning',
      },
      { label: 'Low', value: report.summary.lowIssues, status: 'info' },
      { label: 'Failed fetches', value: report.summary.failedUrls },
    ],
    sections: [
      { title: 'Access diagnostics', diagnostics: accessDiagnostics },
      { title: 'Prioritised fixes', diagnostics: fixDiagnostics },
      {
        title: 'Review before changing anything',
        diagnostics: reviewDiagnostics,
      },
      ...(!accessDiagnostics.length &&
      !fixDiagnostics.length &&
      !reviewDiagnostics.length
        ? [
            {
              title: 'Checks',
              diagnostics: [
                {
                  status: 'pass' as const,
                  title: 'No prioritised findings were observed',
                  explanation:
                    'The evaluated crawl evidence did not produce a prioritised fix or review item.',
                },
              ],
            },
          ]
        : []),
    ],
    notes: [
      `Strategy: ${report.config.strategy}. Data: ${report.status}. Report: ${report.id}.`,
      ...report.warnings,
      ...report.caveats,
    ],
  })
}
