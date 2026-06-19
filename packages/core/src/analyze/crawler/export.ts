import { renderCsv } from '../../export/csv.js'
import { explainRule } from '../../rules.js'
import type { CrawlReport } from './report.js'
import { type TopFix, topFixes } from './top-fixes.js'

export type CrawlOutputFormat = 'pretty' | 'json' | 'csv' | 'html'

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

export function renderCrawlPretty(
  report: CrawlReport,
  fixes: TopFix[] = topFixes(report),
): string {
  const lines = [
    `Crawl report for ${report.config.url}`,
    '',
    `Status: ${report.status}`,
    `Pages: ${report.summary.totalPages}`,
    `Issues: ${report.issues.length} (${report.summary.highIssues} high, ${report.summary.mediumIssues} medium, ${report.summary.lowIssues} low)`,
    `Indexable pages: ${report.summary.indexablePages}`,
  ]

  if (fixes.length) {
    lines.push('', 'Top fixes')
    for (const fix of fixes.slice(0, 10)) {
      lines.push(
        `- ${fix.title} (${fix.severity}, ${fix.count} URL${fix.count === 1 ? '' : 's'}): ${fix.howToFix}`,
      )
      if (fix.sampleUrls[0]) lines.push(`  First URL: ${fix.sampleUrls[0]}`)
      lines.push(`  Verify: ${fix.howToVerify}`)
    }
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
        `<li><strong>${escapeHtml(fix.title)}</strong><br>${escapeHtml(fix.howToFix)}<br><span>Verify: ${escapeHtml(fix.howToVerify)}</span></li>`,
    )
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
    <div class="metric"><span>Pages</span><strong>${report.summary.totalPages}</strong></div>
    <div class="metric"><span>Issues</span><strong>${report.issues.length}</strong></div>
    <div class="metric"><span>High</span><strong>${report.summary.highIssues}</strong></div>
  </section>
  <h2>Top fixes</h2>
  <ol>${fixItems}</ol>
  <h2>Issue groups</h2>
  <table>
    <thead><tr><th>Severity</th><th>Issue</th><th>URLs</th><th>Fix</th><th>Sample URL</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>
</body>
</html>
`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
