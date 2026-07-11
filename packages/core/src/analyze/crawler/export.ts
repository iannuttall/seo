import { renderCsv } from '../../export/csv.js'
import { explainRule } from '../../rules.js'
import type { CrawlReport } from './report.js'
import { type TopFix, topFixes } from './top-fixes.js'

export type CrawlOutputFormat = 'pretty' | 'json' | 'csv' | 'html' | 'markdown'

const issueHeaders = [
  'rule_id',
  'title',
  'category',
  'severity',
  'url',
  'detail',
  'clicks',
  'impressions',
  'position',
]

const pageHeaders = [
  'url',
  'final_url',
  'status',
  'indexable',
  'title',
  'meta_description',
  'canonical',
  'word_count',
  'content_extractor',
  'content_extractor_type',
  'content_extraction_fallback',
  'word_count_source',
  'internal_links',
  'internal_inlinks',
  'internal_authority_score',
  'external_links',
  'images_total',
  'images_missing_alt',
  'oversized_image_candidates',
  'schema_types',
  'clicks',
  'impressions',
  'sessions',
]

export function renderCrawlCsv(report: CrawlReport): string {
  return renderCsv(
    report.issues.map((issue) => ({
      rule_id: issue.ruleId,
      title: issue.title,
      category: issue.category,
      severity: issue.severity,
      url: issue.url,
      detail: issue.detail,
      clicks: issue.searchMetrics?.clicks,
      impressions: issue.searchMetrics?.impressions,
      position: issue.searchMetrics?.position,
    })),
    issueHeaders,
  )
}

export function renderCrawlPagesCsv(report: CrawlReport): string {
  return renderCsv(
    report.pages.map((page) => ({
      url: page.url,
      final_url: page.finalUrl,
      status: page.status,
      indexable: page.indexable,
      title: page.title,
      meta_description: page.metaDescription,
      canonical: page.canonical,
      word_count: page.wordCount,
      content_extractor: page.contentExtraction?.used,
      content_extractor_type: page.contentExtraction?.extractorType,
      content_extraction_fallback: page.contentExtraction?.fallback,
      word_count_source: page.contentExtraction?.wordCountSource,
      internal_links: page.outgoingInternalCount,
      internal_inlinks: page.internalInlinkCount,
      internal_authority_score: page.internalLinkAuthorityScore,
      external_links: page.outgoingExternalCount,
      images_total: page.imagesTotal,
      images_missing_alt: page.imagesMissingAlt,
      oversized_image_candidates: page.oversizedImageCandidates?.length ?? 0,
      schema_types: page.schemaTypes?.join('|'),
      clicks: page.searchMetrics?.clicks,
      impressions: page.searchMetrics?.impressions,
      sessions: page.analytics?.sessions,
    })),
    pageHeaders,
  )
}

export function renderCrawlPretty(
  report: CrawlReport,
  fixes: TopFix[] = topFixes(report),
): string {
  const requestSummary =
    report.requestEvidenceStatus === 'available'
      ? `${report.requests.length} requests`
      : report.requestEvidenceStatus === 'partial'
        ? `${report.requests.length} observed requests; some started requests were still in flight when the crawl stopped`
        : 'request evidence unavailable for this legacy report'
  const lines = [
    `Crawl report for ${report.config.url}`,
    '',
    `Status: ${report.status}`,
    `Documents: ${report.summary.totalPages} retained; ${requestSummary}, ${report.summary.discoveredUrls} URLs discovered, ${report.summary.failedUrls} failed, ${report.summary.skippedUrls} skipped`,
    `Issues: ${report.issues.length} (${report.summary.highIssues} high, ${report.summary.mediumIssues} medium, ${report.summary.lowIssues} low)`,
  ]

  if (fixes.length) {
    lines.push('', 'Top fixes')
    for (const fix of fixes.slice(0, 5)) {
      lines.push(
        `- ${fix.title} (${fix.severity}, ${fix.count} URL${fix.count === 1 ? '' : 's'}): ${fix.howToFix}`,
      )
      if (fix.sampleUrls[0]) lines.push(`  First URL: ${fix.sampleUrls[0]}`)
    }
  }

  lines.push('', 'Next commands', `- seo crawl ${report.config.url} --json`)
  for (const command of [
    ...new Set(fixes.slice(0, 3).map((fix) => fix.verification.command)),
  ]) {
    lines.push(`- ${command}`)
  }

  if (report.warnings.length) {
    lines.push('', 'Warnings', ...report.warnings.map((item) => `- ${item}`))
  }
  if (report.caveats.length) {
    lines.push('', 'Caveats', ...report.caveats.map((item) => `- ${item}`))
  }

  return `${lines.join('\n')}\n`
}

export function renderCrawlHtml(
  report: CrawlReport,
  fixes: TopFix[] = topFixes(report),
): string {
  const issueRows = report.issueGroups
    .map((group) => {
      const rule = explainRule(group.ruleId)
      return `<tr><td>${escapeHtml(group.severity)}</td><td>${escapeHtml(group.title)}</td><td>${group.count}</td><td>${escapeHtml(rule?.howToFix ?? '')}</td><td>${escapeHtml(group.sampleUrls[0] ?? '')}</td></tr>`
    })
    .join('\n')
  const fixItems = fixes
    .slice(0, 10)
    .map(
      (fix) =>
        `<li><strong>${escapeHtml(fix.title)}</strong><br>${escapeHtml(fix.howToFix)}<br><span>Verify: ${escapeHtml(fix.howToVerify)}</span><br><code>${escapeHtml(fix.verification.command)}</code></li>`,
    )
    .join('\n')
  const caveatItems = report.caveats
    .map((caveat) => `<li>${escapeHtml(caveat)}</li>`)
    .join('\n')
  const warningItems = report.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Crawl report for ${escapeHtml(report.config.url)}</title>
  <style>
    body { color: #17202a; font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; max-width: 1120px; }
    h1, h2 { line-height: 1.2; }
    .summary { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin: 24px 0; }
    .metric { border: 1px solid #d8dee4; border-radius: 8px; padding: 12px; }
    .metric strong { display: block; font-size: 24px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #d8dee4; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #f6f8fa; }
    li { margin: 0 0 12px; }
    span { color: #57606a; }
  </style>
</head>
<body>
  <h1>Crawl report</h1>
  <p>${escapeHtml(report.config.url)}</p>
  <section class="summary">
    <div class="metric"><span>Status</span><strong>${escapeHtml(report.status)}</strong></div>
    <div class="metric"><span>Documents</span><strong>${report.summary.totalPages}</strong></div>
    <div class="metric"><span>Requests</span><strong>${report.requestEvidenceStatus === 'unavailable' ? 'n/a' : report.requests.length}${report.requestEvidenceStatus === 'partial' ? ' (partial)' : ''}</strong></div>
    <div class="metric"><span>Discovered</span><strong>${report.summary.discoveredUrls}</strong></div>
    <div class="metric"><span>Queued</span><strong>${report.summary.queuedUrls}</strong></div>
    <div class="metric"><span>Skipped</span><strong>${report.summary.skippedUrls}</strong></div>
    <div class="metric"><span>Failed fetches</span><strong>${report.summary.failedUrls}</strong></div>
    <div class="metric"><span>Verified links</span><strong>${report.summary.verifiedLinks}</strong></div>
    <div class="metric"><span>Issues</span><strong>${report.issues.length}</strong></div>
    <div class="metric"><span>High</span><strong>${report.summary.highIssues}</strong></div>
  </section>
  <h2>Top fixes</h2>
  <ol>${fixItems}</ol>
  ${
    report.caveats.length
      ? `<h2>Caveats</h2>
  <ul>${caveatItems}</ul>`
      : ''
  }
  ${
    report.warnings.length
      ? `<h2>Warnings</h2>
  <ul>${warningItems}</ul>`
      : ''
  }
  <h2>Issue groups</h2>
  <table>
    <thead><tr><th>Severity</th><th>Issue</th><th>URLs</th><th>Fix</th><th>Sample URL</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>
</body>
</html>
`
}

export function renderCrawlMarkdownTickets(
  report: CrawlReport,
  fixes: TopFix[] = topFixes(report),
): string {
  const lines = [
    `# Crawl Implementation Tickets`,
    '',
    `Source: ${report.config.url}`,
    `Report: ${report.id}`,
    `Status: ${report.status}`,
    '',
  ]

  if (report.caveats.length) {
    lines.push(
      '## Caveats',
      '',
      ...report.caveats.map((item) => `- ${item}`),
      '',
    )
  }

  if (report.warnings.length) {
    lines.push(
      '## Warnings',
      '',
      ...report.warnings.map((item) => `- ${item}`),
      '',
    )
  }

  for (const [index, fix] of fixes.entries()) {
    lines.push(
      `## ${index + 1}. ${fix.title}`,
      '',
      `- [ ] Fix ${fix.count} affected URL${fix.count === 1 ? '' : 's'}`,
      `- Severity: ${fix.severity}`,
      `- Rule: ${fix.ruleId}`,
      `- Why this ranks: ${fix.whyThisRanks}`,
      `- Plain-English fix: ${fix.howToFix}`,
      `- Verify: ${fix.howToVerify}`,
      `- Command: ${fix.verification.command}`,
      '',
      `Affected URLs:`,
      ...fix.sampleUrls.slice(0, 10).map((url) => `- ${url}`),
      '',
    )
  }

  if (!fixes.length) {
    lines.push('No implementation tickets were generated.')
  }

  return `${lines.join('\n')}\n`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
