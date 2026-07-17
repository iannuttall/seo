import { renderCsv } from '../../export/csv.js'
import { explainRule } from '../../rules.js'
import type { CrawlReport } from './report.js'
import { reviewObservations, type TopFix, topFixes } from './top-fixes.js'

export type CrawlOutputFormat =
  | 'pretty'
  | 'json'
  | 'csv'
  | 'html'
  | 'markdown'
  | 'junit'

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
  const reviews = reviewObservations(report)
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
    `Strategy: ${report.config.strategy === 'health' ? 'sitemap health pass' : 'full audit'}`,
    `Crawler: ${report.access.crawler.userAgent}`,
    `Documents: ${report.summary.totalPages} retained; ${requestSummary}, ${report.summary.discoveredUrls} URLs discovered, ${report.summary.failedUrls} failed, ${report.summary.skippedUrls} skipped`,
    `Issues: ${report.issues.length} (${report.summary.highIssues} high, ${report.summary.mediumIssues} medium, ${report.summary.lowIssues} low)`,
  ]
  if (report.externalLinkVerification) {
    const external = report.externalLinkVerification
    lines.push(
      `External links: ${external.fetchedUrls} fetched, ${external.failedUrls} request failure${external.failedUrls === 1 ? '' : 's'}, ${external.deferredUrls} deferred (${external.dataStatus})`,
    )
  }

  if (report.access.blockedRequests > 0) {
    lines.push('', `Access blocks: ${report.access.blockedRequests}`)
    for (const sample of report.access.samples.slice(0, 3)) {
      const requestId = sample.evidence.requestId
        ? `, request ID ${sample.evidence.requestId}`
        : ''
      lines.push(
        `- ${sample.url}: ${sample.evidence.guidance.summary} (${sample.evidence.provider}${requestId})`,
        `  Action: ${sample.evidence.guidance.recommendedAction}`,
        `  Security: ${sample.evidence.guidance.securityNote}`,
      )
      if (sample.evidence.guidance.documentationUrl) {
        lines.push(
          `  Provider docs: ${sample.evidence.guidance.documentationUrl}`,
        )
      }
    }
  }

  if (fixes.length) {
    lines.push('', 'Prioritised fixes')
    for (const fix of fixes.slice(0, 5)) {
      lines.push(
        `- ${fix.title} (${fix.severity}, ${fix.count} URL${fix.count === 1 ? '' : 's'}): ${fix.howToFix}`,
      )
      if (fix.sampleUrls[0]) lines.push(`  First URL: ${fix.sampleUrls[0]}`)
    }
  } else {
    lines.push('', 'No prioritised fixes found.')
  }

  if (reviews.length) {
    lines.push('', 'Review observations (check before scheduling work)')
    for (const observation of reviews.slice(0, 5)) {
      lines.push(
        `- ${observation.title} (${observation.severity}, ${observation.count} URL${observation.count === 1 ? '' : 's'}): ${observation.howToFix}`,
      )
      if (observation.sampleUrls[0]) {
        lines.push(`  First URL: ${observation.sampleUrls[0]}`)
      }
    }
  }

  lines.push(
    '',
    'Next commands',
    report.config.strategy === 'health'
      ? `- seo crawl ${report.config.url} --max-pages ${report.config.maxPages} --json`
      : `- seo crawl ${report.config.url} --json`,
  )
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

export function renderCrawlJunit(report: CrawlReport): string {
  const issuesByUrl = new Map<string, CrawlReport['issues']>()
  for (const issue of report.issues) {
    const existing = issuesByUrl.get(issue.url) ?? []
    existing.push(issue)
    issuesByUrl.set(issue.url, existing)
  }

  const sitemapCases = (report.sitemapDiscovery?.roots ?? []).flatMap(
    (root) => {
      const documents = root.documents.length
        ? root.documents
        : [
            {
              url: root.url,
              dataStatus: root.dataStatus,
              compression: 'none' as const,
              warning: root.warnings.join(' ') || undefined,
            },
          ]
      return documents.map((document) => {
        const failures = [
          ...(document.dataStatus !== 'complete'
            ? [
                document.warning ??
                  `Sitemap evidence is ${document.dataStatus}.`,
              ]
            : []),
          ...(document.redirected
            ? [
                `Sitemap redirected to ${document.finalUrl ?? 'an unknown URL'}.`,
              ]
            : []),
          ...(document.status !== undefined &&
          (document.status < 200 || document.status >= 300)
            ? [`Sitemap returned HTTP ${document.status}.`]
            : []),
        ]
        const output = [
          `dataStatus=${document.dataStatus}`,
          ...(document.status !== undefined
            ? [`status=${document.status}`]
            : []),
          ...(document.finalUrl ? [`finalUrl=${document.finalUrl}`] : []),
          ...(document.root ? [`root=${document.root}`] : []),
          ...(document.warning ? [`warning=${document.warning}`] : []),
        ].join('\n')
        return {
          xml: [
            `  <testcase classname="seo.sitemap-document" name="${escapeXml(document.url)}" time="0.000">`,
            ...(failures.length
              ? [
                  `    <failure message="${escapeXml(failures[0] ?? 'Sitemap check failed')}">${escapeXml(failures.join('\n'))}</failure>`,
                ]
              : []),
            `    <system-out>${escapeXml(output)}</system-out>`,
            '  </testcase>',
          ].join('\n'),
          failed: failures.length > 0,
        }
      })
    },
  )

  const requestCases = report.requests.map((request) => {
    const issues = issuesByUrl.get(request.requestedUrl) ?? []
    const failures = [
      ...issues.map(
        (issue) =>
          `${issue.severity}: ${issue.title}${issue.detail ? `: ${issue.detail}` : ''}`,
      ),
      ...(request.outcome === 'failure'
        ? [`${request.failureKind}: ${request.error}`]
        : []),
      ...(request.outcome === 'skipped'
        ? [
            request.reason === 'origin-backpressure'
              ? request.error
              : `${request.reason}: ${request.robotsTxt.matchedLine ?? request.robotsTxt.availability}`,
          ]
        : []),
    ]
    const output =
      request.outcome === 'response'
        ? [
            `status=${request.status}`,
            `finalUrl=${request.finalUrl}`,
            ...(request.robotsTxt
              ? [
                  `robotsUrl=${request.robotsTxt.url}`,
                  `robotsAllowed=${request.robotsTxt.allowed ?? 'unknown'}`,
                  `robotsAvailability=${request.robotsTxt.availability}`,
                  ...(request.robotsTxt.status !== undefined
                    ? [`robotsStatus=${request.robotsTxt.status}`]
                    : []),
                  ...(request.robotsTxt.matchedLine
                    ? [`robotsMatchedLine=${request.robotsTxt.matchedLine}`]
                    : []),
                  ...(request.robotsTxt.error
                    ? [`robotsError=${request.robotsTxt.error}`]
                    : []),
                ]
              : []),
            ...(request.accessBlock
              ? [
                  `accessProvider=${request.accessBlock.provider}`,
                  `crawler=${request.accessBlock.crawler.userAgent}`,
                  ...(request.accessBlock.requestId
                    ? [`requestId=${request.accessBlock.requestId}`]
                    : []),
                ]
              : []),
          ].join('\n')
        : request.outcome === 'failure'
          ? request.error
          : request.reason === 'origin-backpressure'
            ? `reason=${request.reason}\nerror=${request.error}`
            : [
                `reason=${request.reason}`,
                `robotsUrl=${request.robotsTxt.url}`,
                `robotsAllowed=${request.robotsTxt.allowed ?? 'unknown'}`,
                `robotsAvailability=${request.robotsTxt.availability}`,
                ...(request.robotsTxt.status !== undefined
                  ? [`robotsStatus=${request.robotsTxt.status}`]
                  : []),
                ...(request.robotsTxt.matchedLine
                  ? [`robotsMatchedLine=${request.robotsTxt.matchedLine}`]
                  : []),
                ...(request.robotsTxt.error
                  ? [`robotsError=${request.robotsTxt.error}`]
                  : []),
              ].join('\n')
    const duration = ((request.durationMs ?? 0) / 1000).toFixed(3)
    return {
      xml: [
        `  <testcase classname="seo.sitemap-health" name="${escapeXml(request.requestedUrl)}" time="${duration}">`,
        ...(failures.length
          ? [
              `    <failure message="${escapeXml(failures[0] ?? 'Health check failed')}">${escapeXml(failures.join('\n'))}</failure>`,
            ]
          : []),
        `    <system-out>${escapeXml(output)}</system-out>`,
        '  </testcase>',
      ].join('\n'),
      failed: failures.length > 0,
    }
  })
  const cases = [...sitemapCases, ...requestCases]
  const failures = cases.filter((item) => item.failed).length
  const elapsed = report.requests.reduce(
    (sum, request) => sum + (request.durationMs ?? 0),
    0,
  )
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="seo sitemap health" tests="${cases.length}" failures="${failures}" errors="0" skipped="0" time="${(elapsed / 1000).toFixed(3)}">`,
    '  <properties>',
    `    <property name="report.id" value="${escapeXml(report.id)}"/>`,
    `    <property name="report.status" value="${escapeXml(report.status)}"/>`,
    `    <property name="crawl.strategy" value="${escapeXml(report.config.strategy)}"/>`,
    `    <property name="crawler.userAgent" value="${escapeXml(report.access.crawler.userAgent)}"/>`,
    '  </properties>',
    ...cases.map((item) => item.xml),
    '</testsuite>',
    '',
  ].join('\n')
}

export function renderCrawlHtml(
  report: CrawlReport,
  fixes: TopFix[] = topFixes(report),
): string {
  const reviews = reviewObservations(report)
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
  const reviewItems = reviews
    .slice(0, 10)
    .map(
      (observation) =>
        `<li><strong>${escapeHtml(observation.title)}</strong><br>${escapeHtml(observation.howToFix)}<br><span>Check before scheduling work. ${escapeHtml(observation.howToVerify)}</span></li>`,
    )
    .join('\n')
  const caveatItems = report.caveats
    .map((caveat) => `<li>${escapeHtml(caveat)}</li>`)
    .join('\n')
  const warningItems = report.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join('\n')
  const accessItems = report.access.samples
    .map(
      (sample) =>
        `<li><strong>${escapeHtml(sample.url)}</strong><br>${escapeHtml(sample.evidence.guidance.summary)}<br>${escapeHtml(sample.evidence.guidance.recommendedAction)}<br><span>${escapeHtml(sample.evidence.guidance.securityNote)}</span></li>`,
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
  <p>Strategy: ${escapeHtml(report.config.strategy === 'health' ? 'sitemap health pass' : 'full audit')}<br>Crawler: <code>${escapeHtml(report.access.crawler.userAgent)}</code></p>
  <section class="summary">
    <div class="metric"><span>Status</span><strong>${escapeHtml(report.status)}</strong></div>
    <div class="metric"><span>Documents</span><strong>${report.summary.totalPages}</strong></div>
    <div class="metric"><span>Requests</span><strong>${report.requestEvidenceStatus === 'unavailable' ? 'n/a' : report.requests.length}${report.requestEvidenceStatus === 'partial' ? ' (partial)' : ''}</strong></div>
    <div class="metric"><span>Discovered</span><strong>${report.summary.discoveredUrls}</strong></div>
    <div class="metric"><span>Queued</span><strong>${report.summary.queuedUrls}</strong></div>
    <div class="metric"><span>Skipped</span><strong>${report.summary.skippedUrls}</strong></div>
    <div class="metric"><span>Failed fetches</span><strong>${report.summary.failedUrls}</strong></div>
    <div class="metric"><span>Observed internal links</span><strong>${report.summary.observedInternalLinks}</strong></div>
    <div class="metric"><span>Issues</span><strong>${report.issues.length}</strong></div>
    <div class="metric"><span>High</span><strong>${report.summary.highIssues}</strong></div>
  </section>
  ${accessItems ? `<h2>Access blocks</h2><ul>${accessItems}</ul>` : ''}
  <h2>Prioritised fixes</h2>
  ${fixItems ? `<ol>${fixItems}</ol>` : '<p>No prioritised fixes found.</p>'}
  ${
    reviewItems
      ? `<h2>Review observations</h2>
  <p>Check these before scheduling implementation work.</p>
  <ul>${reviewItems}</ul>`
      : ''
  }
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
  const reviews = reviewObservations(report)
  const lines = [
    `# Crawl Implementation Tickets`,
    '',
    `Source: ${report.config.url}`,
    `Report: ${report.id}`,
    `Status: ${report.status}`,
    `Strategy: ${report.config.strategy}`,
    `Crawler: ${report.access.crawler.userAgent}`,
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

  if (report.access.blockedRequests > 0) {
    lines.push(
      '## Access blocks',
      '',
      ...report.access.samples.flatMap((sample) => [
        `- ${sample.url}: ${sample.evidence.guidance.summary}`,
        `  - Action: ${sample.evidence.guidance.recommendedAction}`,
        `  - Security: ${sample.evidence.guidance.securityNote}`,
      ]),
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

  if (reviews.length) {
    lines.push(
      '## Review observations',
      '',
      'These are not implementation tickets. Check the evidence before deciding whether to work on them.',
      '',
      ...reviews
        .slice(0, 10)
        .flatMap((observation) => [
          `- ${observation.title} (${observation.severity}, ${observation.count} URL${observation.count === 1 ? '' : 's'}): ${observation.howToFix}`,
          `  - First URL: ${observation.sampleUrls[0] ?? 'No sample URL recorded'}`,
        ]),
      '',
    )
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

function escapeXml(value: string): string {
  return escapeHtml(value)
}
