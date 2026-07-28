import { createHash } from 'node:crypto'
import { SeoError } from '../../errors.js'
import { SEO_VERSION } from '../../version.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { OkfBundle, OkfFile } from './okf-types.js'
import type { CrawlReport } from './report.js'

export type {
  OkfBundle,
  OkfExplainReport,
  OkfFile,
  OkfFreshnessSummary,
  OkfGenerationSummary,
  OkfLifecycleSummary,
  OkfProvenanceSummary,
  OkfTrustSummary,
  OkfValidationIssue,
  OkfValidationOptions,
  OkfValidationProfile,
  OkfValidationReport,
} from './okf-types.js'
export {
  explainOkfValidation,
  OKF_MAX_FILE_BYTES,
  OKF_MAX_FILES,
  OKF_MAX_TOTAL_BYTES,
  OKF_MAX_VALIDATION_ISSUES,
  validateOkfFiles,
} from './okf-validation.js'

export const OKF_DEFAULT_CONCEPTS = 500
export const OKF_MAX_CONCEPTS = 5_000
export const OKF_VERSION = '0.2' as const

function compareText(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0) ?? 0)
  const rightPoints = [...right].map((value) => value.codePointAt(0) ?? 0)
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index++
  ) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0)
    if (difference) return difference
  }
  return leftPoints.length - rightPoints.length
}

function conceptPath(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const readable = cleaned.slice(0, 62) || 'page'
  const identity = createHash('sha256').update(value).digest('hex').slice(0, 12)
  return `concepts/${readable}-${identity}.md`
}

function frontmatter(values: Record<string, unknown>): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      if (!value.length) continue
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${JSON.stringify(item)}`)
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`)
    }
  }
  lines.push('---', '')
  return lines.join('\n')
}

function singleLine(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint < 32 || codePoint === 127 ? ' ' : character
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function pageTitle(page: CrawlPageSnapshot): string {
  return singleLine(
    page.title ?? page.h1 ?? (new URL(page.finalUrl).pathname || page.finalUrl),
  )
}

function pageType(page: CrawlPageSnapshot): string {
  const path = new URL(page.finalUrl).pathname.toLowerCase()
  if (
    page.schemaTypes?.includes('Article') ||
    /\/(blog|article|news)\b/.test(path)
  ) {
    return 'article'
  }
  if (
    page.schemaTypes?.some((type) =>
      /Product|Service|SoftwareApplication/i.test(type),
    )
  ) {
    return 'product'
  }
  if (/\/(about|company|team|contact)\b/.test(path)) return 'organization'
  return 'webpage'
}

function generated(report: CrawlReport) {
  return {
    by: `seo/${SEO_VERSION}`,
    at: report.generatedAt,
  }
}

function sourceLastModified(page: CrawlPageSnapshot): string | undefined {
  const header = Object.entries(page.responseHeaders ?? {}).find(
    ([key]) => key.toLowerCase() === 'last-modified',
  )?.[1]
  if (!header) return undefined
  const parsed = new Date(header)
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : undefined
}

function pageSource(page: CrawlPageSnapshot, title: string) {
  return {
    id: 'source-page',
    resource: page.finalUrl,
    title,
    last_modified: sourceLastModified(page),
  }
}

function crawlSource(report: CrawlReport) {
  return {
    id: 'crawl-report',
    resource: `crawl report ${report.id}`,
    title: `Crawl report for ${report.config.url}`,
  }
}

function markdownLabel(value: string): string {
  return value.replace(/[[\]]/g, '\\$&')
}

function conceptFile(page: CrawlPageSnapshot, report: CrawlReport): OkfFile {
  const title = pageTitle(page)
  const body = [
    frontmatter({
      type: pageType(page),
      title,
      description: page.metaDescription
        ? singleLine(page.metaDescription)
        : undefined,
      resource: page.finalUrl,
      generated: generated(report),
      sources: [pageSource(page, title)],
      http_status: page.status,
      indexable: page.indexable,
      canonical: page.canonical,
      schemaTypes: page.schemaTypes,
      sameAs: page.schemaSameAs,
    }),
    `# ${title}`,
    '',
    page.metaDescription
      ? `Summary: ${singleLine(page.metaDescription)}[^source-page]`
      : undefined,
    page.contentSample
      ? `Extract: ${singleLine(page.contentSample)}[^source-page]`
      : undefined,
    '',
    '## Signals',
    '',
    'These signals were observed during the crawl.[^source-page]',
    '',
    `- URL: ${page.finalUrl}`,
    `- Status: ${page.status}`,
    `- Indexable: ${page.indexable ? 'yes' : 'no'}`,
    `- Word count: ${page.wordCount}`,
    `- Structured data: ${(page.schemaTypes ?? []).join(', ') || 'none detected'}`,
    `- Internal inlinks: ${page.internalInlinkCount ?? 0}`,
    '',
    `[^source-page]: ${title}`,
    '',
  ].filter((line): line is string => line !== undefined)

  return {
    path: conceptPath(page.finalUrl),
    content: body.join('\n'),
  }
}

export function okfConceptLimit(value: number | undefined): number {
  if (value === undefined) return OKF_DEFAULT_CONCEPTS
  if (!Number.isInteger(value) || value < 1 || value > OKF_MAX_CONCEPTS) {
    throw new SeoError(
      'INVALID_INPUT',
      `maxConcepts must be a whole number between 1 and ${OKF_MAX_CONCEPTS}.`,
    )
  }
  return value
}

function okfTitle(value: string | undefined, report: CrawlReport): string {
  const title = singleLine(
    value ?? new URL(report.config.url).hostname.replace(/^www\./, ''),
  )
  if (!title || title.length > 200) {
    throw new SeoError(
      'INVALID_INPUT',
      'OKF title must contain 1 to 200 characters on one line.',
    )
  }
  return title
}

function selectedOkfPages(report: CrawlReport, requestedLimit?: number) {
  const limit = okfConceptLimit(requestedLimit)
  const eligible = report.pages
    .filter(
      (page) =>
        page.indexable &&
        page.status >= 200 &&
        page.status < 300 &&
        !page.blocked &&
        !page.error,
    )
    .sort(
      (left, right) =>
        (right.searchMetrics?.clicks ?? 0) -
          (left.searchMetrics?.clicks ?? 0) ||
        (right.searchMetrics?.impressions ?? 0) -
          (left.searchMetrics?.impressions ?? 0) ||
        (right.internalLinkAuthorityScore ?? 0) -
          (left.internalLinkAuthorityScore ?? 0) ||
        (right.internalInlinkCount ?? 0) - (left.internalInlinkCount ?? 0) ||
        compareText(left.finalUrl, right.finalUrl),
    )
  const unique = new Map<string, CrawlPageSnapshot>()
  for (const page of eligible) {
    if (!unique.has(page.finalUrl)) unique.set(page.finalUrl, page)
  }
  const uniquePages = [...unique.values()]
  return {
    pages: uniquePages.slice(0, limit),
    sourcePages: report.pages.length,
    eligiblePages: uniquePages.length,
    duplicateFinalUrls: eligible.length - uniquePages.length,
    limit,
  }
}

export function buildOkfBundle(
  report: CrawlReport,
  options: { maxConcepts?: number; title?: string } = {},
): OkfBundle {
  const title = okfTitle(options.title, report)
  const selected = selectedOkfPages(report, options.maxConcepts)
  const pages = selected.pages
  const generatedCaveats = [
    ...report.caveats,
    ...(report.status !== 'completed'
      ? [
          `Source crawl status is ${report.status}; the bundle may not represent the complete site inventory.`,
        ]
      : []),
    ...(selected.duplicateFinalUrls
      ? [
          `${selected.duplicateFinalUrls} duplicate final URL${selected.duplicateFinalUrls === 1 ? ' was' : 's were'} deduplicated before concept export.`,
        ]
      : []),
    ...(selected.eligiblePages > pages.length
      ? [
          `OKF selected ${pages.length} of ${selected.eligiblePages} eligible 2xx indexable pages using observed search clicks, impressions, internal authority, inlinks, and a stable URL tie-break.`,
        ]
      : []),
  ]
  const concepts = pages.map((page) => conceptFile(page, report))
  const crawlProvenance = {
    generated: generated(report),
    sources: [crawlSource(report)],
  }
  const files: OkfFile[] = [
    {
      path: 'index.md',
      content: [
        frontmatter({ okf_version: OKF_VERSION }),
        `# ${title}`,
        '',
        `Source crawl: ${report.id}`,
        `Generated from: ${report.config.url}`,
        '',
        '## Contents',
        '',
        '- [Concepts](concepts/index.md)',
        '- [Inventory](inventory/pages.md)',
        '- [Graph](graph/links.md)',
        '- [Caveats](caveats.md)',
        '- [Log](log.md)',
        '',
      ].join('\n'),
    },
    {
      path: 'log.md',
      content: [
        '# Bundle Update Log',
        '',
        `## ${report.generatedAt.slice(0, 10)}`,
        '',
        `* **Creation**: Generated the bundle from crawl report ${report.id}.`,
        '',
      ].join('\n'),
    },
    {
      path: 'concepts/index.md',
      content: [
        '# Concepts',
        '',
        ...concepts.map((file, index) => {
          const page = pages[index]
          const path = file.path.replace(/^concepts\//, '')
          const pageTitleValue = page ? pageTitle(page) : path
          const description = page?.metaDescription
            ? ` - ${singleLine(page.metaDescription)}`
            : ''
          return `- [${markdownLabel(pageTitleValue)}](${path})${description}`
        }),
        '',
      ].join('\n'),
    },
    {
      path: 'inventory/pages.md',
      content: [
        frontmatter({
          type: 'inventory',
          title: 'Selected concept pages',
          ...crawlProvenance,
        }),
        '# Selected Concept Pages',
        '',
        'This inventory was retained from the saved crawl.[^crawl-report]',
        '',
        '| URL | Status | Indexable | Title |',
        '| --- | ---: | --- | --- |',
        ...pages.map(
          (page) =>
            `| ${page.finalUrl} | ${page.status} | ${page.indexable ? 'yes' : 'no'} | ${singleLine(page.title ?? '').replace(/\|/g, '\\|')} |`,
        ),
        '',
        '[^crawl-report]: Saved crawl report',
        '',
      ].join('\n'),
    },
    {
      path: 'graph/links.md',
      content: [
        frontmatter({
          type: 'graph',
          title: 'Internal link graph',
          ...crawlProvenance,
        }),
        '# Internal Link Graph',
        '',
        'These retained link samples were observed during the saved crawl.[^crawl-report]',
        '',
        ...pages.flatMap((page) => [
          `## ${pageTitle(page)}`,
          '',
          `Source: ${page.finalUrl}`,
          '',
          ...(page.sampleInternalLinks ?? [])
            .slice(0, 25)
            .map((url) => `- ${url}`),
          '',
        ]),
        '[^crawl-report]: Saved crawl report',
        '',
      ].join('\n'),
    },
    {
      path: 'caveats.md',
      content: [
        frontmatter({
          type: 'caveats',
          title: 'Caveats',
          ...crawlProvenance,
        }),
        '# Caveats',
        '',
        'These caveats and warnings came from the saved crawl.[^crawl-report]',
        '',
        ...(generatedCaveats.length
          ? generatedCaveats
          : ['No crawl caveats were reported.']
        ).map((caveat) => `- ${caveat}`),
        ...(report.warnings.length
          ? [
              '',
              '## Warnings',
              '',
              ...report.warnings.map((warning) => `- ${warning}`),
            ]
          : []),
        '',
        '[^crawl-report]: Saved crawl report',
        '',
      ].join('\n'),
    },
    ...concepts,
  ]
  const conceptCount = files.filter(
    (file) =>
      file.path.endsWith('.md') && !/(^|\/)(?:index|log)\.md$/.test(file.path),
  ).length

  return {
    schemaVersion: 2,
    okfVersion: OKF_VERSION,
    reportId: report.id,
    sourceUrl: report.config.url,
    generatedAt: report.generatedAt,
    crawlStatus: report.status,
    rootTitle: title,
    files,
    conceptCount,
    pageConceptCount: concepts.length,
    selection: {
      sourcePages: selected.sourcePages,
      eligiblePages: selected.eligiblePages,
      duplicateFinalUrls: selected.duplicateFinalUrls,
      selectedPages: pages.length,
      limitedPages: selected.eligiblePages - pages.length,
      limit: selected.limit,
      order: 'search-clicks-impressions-internal-authority-inlinks-url',
    },
    caveats: generatedCaveats,
    warnings: report.warnings,
  }
}
