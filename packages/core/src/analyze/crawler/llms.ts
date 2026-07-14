import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { CrawlAgentDiscovery } from './agent-discovery.js'
import type { CrawlReport } from './report.js'

export type LlmsAuditIssue = {
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  plainEnglish: string
  action: string
  evidence?: Record<string, unknown>
}

export type LlmsAuditReport = {
  reportId: string
  url: string
  exists: boolean
  llmsTxtUrl: string
  status?: number
  optional: true
  googleSearchImpact: 'none'
  guidanceUrl: string
  headline: string
  issues: LlmsAuditIssue[]
  recommendedPages: Array<{
    url: string
    title?: string
    section: string
    reason: string
  }>
}

export type GenerateLlmsTxtOptions = {
  maxUrls?: number
  tokenBudget?: number
  exclude?: string[]
  title?: string
  description?: string
}

export type GeneratedLlmsTxt = {
  content: string
  includedUrls: number
  estimatedTokens: number
  sections: Record<string, number>
}

function estimatedTokens(value: string): number {
  return Math.ceil(value.length / 4)
}

function originHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

function cleanTitle(page: CrawlPageSnapshot): string {
  return (
    page.title ?? page.h1 ?? (new URL(page.finalUrl).pathname || page.finalUrl)
  )
}

function sectionForPage(page: CrawlPageSnapshot): string {
  const path = new URL(page.finalUrl).pathname.toLowerCase()
  if (/\/(docs|documentation|guide|guides|help|kb|learn)\b/.test(path)) {
    return 'Docs and guides'
  }
  if (/\/(blog|articles|news|resources)\b/.test(path)) return 'Articles'
  if (/\/(product|products|features|tools|solutions)\b/.test(path)) {
    return 'Products and tools'
  }
  if (/\/(pricing|plans)\b/.test(path)) return 'Pricing'
  if (/\/(about|company|team|contact)\b/.test(path)) return 'Company'
  return 'Core pages'
}

function defaultExclude(url: string): boolean {
  return /\/(login|logout|cart|checkout|account|admin|wp-admin|search|tag|privacy|terms|cookie|legal)\b/i.test(
    new URL(url).pathname,
  )
}

function matchesPattern(value: string, patterns: string[] = []): boolean {
  return patterns.some((pattern) => {
    if (!pattern.includes('*')) return value.includes(pattern)
    const parts = pattern.split('*')
    let cursor = 0
    for (const part of parts) {
      if (!part) continue
      const found = value.slice(cursor).indexOf(part)
      if (found === -1) return false
      cursor += found + part.length
    }
    return true
  })
}

function candidatePages(
  report: CrawlReport,
  options: Pick<GenerateLlmsTxtOptions, 'exclude'> = {},
): CrawlPageSnapshot[] {
  return report.pages
    .filter((page) => page.indexable && page.status < 400)
    .filter((page) => !defaultExclude(page.finalUrl))
    .filter((page) => !matchesPattern(page.finalUrl, options.exclude))
    .sort(
      (a, b) =>
        (b.internalLinkAuthorityScore ?? 0) -
          (a.internalLinkAuthorityScore ?? 0) ||
        (b.wordCount ?? 0) - (a.wordCount ?? 0) ||
        a.finalUrl.localeCompare(b.finalUrl),
    )
}

export function auditLlmsTxt(report: CrawlReport): LlmsAuditReport {
  const llmsTxt = report.ai?.llmsTxt
  const validation = (
    report as CrawlReport & { agentDiscovery?: CrawlAgentDiscovery }
  ).agentDiscovery?.llmsTxt
  const pages = candidatePages(report)
  const issues: LlmsAuditIssue[] = []

  if (
    validation?.exists &&
    !/^\s*(?:text\/plain|text\/markdown)\b/iu.test(validation.contentType ?? '')
  ) {
    issues.push({
      id: 'llms-content-type',
      severity: 'medium',
      title: 'llms.txt uses an unexpected content type',
      plainEnglish: `The file returned ${validation.contentType ?? 'no content type'} instead of plain text or Markdown.`,
      action:
        'Serve the deterministic text file as text/plain or text/markdown so consumers do not mistake it for HTML.',
      evidence: { contentType: validation.contentType },
    })
  }
  if (validation?.exists && validation.headingCount === 0) {
    issues.push({
      id: 'llms-structure',
      severity: 'medium',
      title: 'llms.txt has no useful heading structure',
      plainEnglish:
        'The fetched file did not contain a level-one or level-two Markdown heading.',
      action:
        'Start with one clear title, then group a short list of useful entry points under descriptive headings.',
    })
  }
  if (validation?.duplicateLinks.length) {
    issues.push({
      id: 'llms-duplicate-links',
      severity: 'low',
      title: 'llms.txt repeats the same link',
      plainEnglish: `${validation.duplicateLinks.length} URL${validation.duplicateLinks.length === 1 ? ' appears' : 's appear'} more than once.`,
      action:
        'Remove duplicate entries so the file remains short and deliberate.',
      evidence: { urls: validation.duplicateLinks },
    })
  }
  const brokenLinks =
    validation?.links.filter(
      (link) =>
        !link.status || link.status < 200 || link.status >= 400 || link.error,
    ) ?? []
  if (brokenLinks.length) {
    issues.push({
      id: 'llms-broken-links',
      severity: 'medium',
      title: 'llms.txt links did not resolve',
      plainEnglish: `${brokenLinks.length} declared link${brokenLinks.length === 1 ? '' : 's'} did not return a usable response during this audit.`,
      action:
        'Update or remove stale entries, then rerun the focused agent-readiness report.',
      evidence: { links: brokenLinks },
    })
  }
  if (validation?.missingCrawlRoutes.length) {
    issues.push({
      id: 'llms-outside-crawl',
      severity: 'low',
      title: 'llms.txt links fall outside the crawl inventory',
      plainEnglish: `${validation.missingCrawlRoutes.length} same-origin route${validation.missingCrawlRoutes.length === 1 ? ' was' : 's were'} not present in the retained crawl.`,
      action:
        'Confirm those routes are intentional and indexable, or remove stale declarations.',
      evidence: { urls: validation.missingCrawlRoutes },
    })
  }
  if (validation?.repeatedHashStable === false) {
    issues.push({
      id: 'llms-unstable-body',
      severity: 'medium',
      title: 'llms.txt changed between repeated requests',
      plainEnglish:
        'Two requests in the same audit returned different SHA-256 digests.',
      action:
        'Generate the file during the build and remove timestamps, random ordering, or runtime rewriting.',
    })
  }

  if (pages.length < 3) {
    issues.push({
      id: 'thin-llms-inventory',
      severity: 'low',
      title: 'The crawl has a small llms.txt inventory',
      plainEnglish:
        'There are very few indexable candidate pages to include in llms.txt.',
      action:
        'If you choose to generate the optional file, run a deeper crawl or sitemap crawl first.',
      evidence: { candidatePages: pages.length },
    })
  }

  return {
    reportId: report.id,
    url: report.config.url,
    exists: Boolean(llmsTxt?.exists),
    llmsTxtUrl:
      llmsTxt?.url ?? new URL('/llms.txt', report.config.url).toString(),
    status: llmsTxt?.status,
    optional: true,
    googleSearchImpact: 'none',
    guidanceUrl:
      'https://developers.google.com/search/updates#clarifying-guidance-on-llms-txt-files',
    headline: llmsTxt?.exists
      ? validation
        ? issues.length
          ? `The optional llms.txt file was validated and ${issues.length} content or link issue${issues.length === 1 ? ' needs' : 's need'} review. It has no Google Search visibility impact.`
          : `The optional llms.txt file was validated with ${validation.links.length} resolving link${validation.links.length === 1 ? '' : 's'} and a stable body. It has no Google Search visibility impact.`
        : 'An optional llms.txt file is present, but its body was not validated in this crawl. It has no Google Search visibility impact.'
      : 'No llms.txt file was found. This is not an SEO issue and requires no action.',
    issues,
    recommendedPages: pages.slice(0, 25).map((page) => ({
      url: page.finalUrl,
      title: page.title,
      section: sectionForPage(page),
      reason:
        (page.internalLinkAuthorityScore ?? 0) > 0
          ? 'High internal link authority in this crawl.'
          : 'Indexable page with useful content signals.',
    })),
  }
}

export function generateLlmsTxt(
  report: CrawlReport,
  options: GenerateLlmsTxtOptions = {},
): GeneratedLlmsTxt {
  const maxUrls = options.maxUrls ?? 250
  const tokenBudget = options.tokenBudget ?? 12_000
  const title = options.title ?? originHost(report.config.url)
  const description =
    options.description ??
    `Curated entry points for agents reading ${originHost(report.config.url)}.`
  const pages = candidatePages(report, options).slice(0, maxUrls)
  const sections = new Map<string, CrawlPageSnapshot[]>()
  for (const page of pages) {
    const section = sectionForPage(page)
    sections.set(section, [...(sections.get(section) ?? []), page])
  }

  const lines = [`# ${title}`, '', `> ${description}`, '']
  let includedUrls = 0
  const counts: Record<string, number> = {}

  for (const [sectionName, sectionPages] of sections) {
    const sectionLines = [`## ${sectionName}`, '']
    let sectionCount = 0
    for (const page of sectionPages) {
      const title = cleanTitle(page).replace(/\]/g, '\\]')
      const note = page.metaDescription
        ? ` - ${page.metaDescription.replace(/\s+/g, ' ').slice(0, 160)}`
        : ''
      const line = `- [${title}](${page.finalUrl})${note}`
      const projected = [...lines, ...sectionLines, line, ''].join('\n')
      if (estimatedTokens(projected) > tokenBudget && includedUrls > 0) break
      sectionLines.push(line)
      sectionCount += 1
      includedUrls += 1
    }
    if (!sectionCount) break
    sectionLines.push('')
    lines.push(...sectionLines)
    counts[sectionName] = sectionCount
    if (sectionCount < sectionPages.length) break
  }

  lines.push(
    '## Notes',
    '',
    '- Optional metadata for agents and services that explicitly support llms.txt.',
    '- [Google Search guidance](https://developers.google.com/search/updates#clarifying-guidance-on-llms-txt-files) says llms.txt does not affect visibility or rankings.',
    `- Generated from crawl report ${report.id}.`,
    `- Crawl generated at ${report.generatedAt}.`,
  )
  if (report.caveats.length) {
    lines.push(...report.caveats.map((caveat) => `- Caveat: ${caveat}`))
  }

  const content = `${lines.join('\n')}\n`
  return {
    content,
    includedUrls,
    estimatedTokens: estimatedTokens(content),
    sections: counts,
  }
}
