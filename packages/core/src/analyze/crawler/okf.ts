import { createHash } from 'node:crypto'
import { SeoError } from '../../errors.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { CrawlReport } from './report.js'

export const OKF_DEFAULT_CONCEPTS = 500
export const OKF_MAX_CONCEPTS = 5_000

export type OkfFile = {
  path: string
  content: string
}

export type OkfBundle = {
  schemaVersion: 1
  reportId: string
  sourceUrl: string
  generatedAt: string
  crawlStatus: CrawlReport['status']
  rootTitle: string
  files: OkfFile[]
  conceptCount: number
  selection: {
    sourcePages: number
    eligiblePages: number
    duplicateFinalUrls: number
    selectedPages: number
    limitedPages: number
    limit: number
    order: 'search-clicks-impressions-internal-authority-inlinks-url'
  }
  caveats: string[]
  warnings: string[]
}

export type OkfValidationIssue = {
  path: string
  severity: 'error' | 'warning'
  message: string
}

export type OkfValidationReport = {
  valid: boolean
  files: number
  concepts: number
  issues: OkfValidationIssue[]
}

export type OkfExplainReport = {
  title: string
  valid: boolean
  summary: string
  files: number
  concepts: number
  errors: number
  warnings: number
  nextActions: string[]
}

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

function conceptFile(page: CrawlPageSnapshot): OkfFile {
  const title = pageTitle(page)
  const body = [
    frontmatter({
      type: pageType(page),
      title,
      url: page.finalUrl,
      status: page.status,
      indexable: page.indexable,
      canonical: page.canonical,
      schemaTypes: page.schemaTypes,
      sameAs: page.schemaSameAs,
    }),
    `# ${title}`,
    '',
    page.metaDescription
      ? `Summary: ${singleLine(page.metaDescription)}`
      : undefined,
    page.contentSample
      ? `Extract: ${singleLine(page.contentSample)}`
      : undefined,
    '',
    '## Signals',
    '',
    `- URL: ${page.finalUrl}`,
    `- Status: ${page.status}`,
    `- Indexable: ${page.indexable ? 'yes' : 'no'}`,
    `- Word count: ${page.wordCount}`,
    `- Structured data: ${(page.schemaTypes ?? []).join(', ') || 'none detected'}`,
    `- Internal inlinks: ${page.internalInlinkCount ?? 0}`,
    '',
    '# Citations',
    '',
    `- [Source page](<${page.finalUrl}>)`,
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
  const concepts = pages.map(conceptFile)
  const files: OkfFile[] = [
    {
      path: 'index.md',
      content: [
        frontmatter({ okf: '0.1', type: 'index', title }),
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
        '# Log',
        '',
        `- ${report.generatedAt}: Generated OKF bundle from crawl report ${report.id}.`,
        '',
      ].join('\n'),
    },
    {
      path: 'concepts/index.md',
      content: [
        '# Concepts',
        '',
        ...concepts.map(
          (file) =>
            `- [${file.path.replace(/^concepts\//, '')}](${file.path.replace(/^concepts\//, '')})`,
        ),
        '',
      ].join('\n'),
    },
    {
      path: 'inventory/pages.md',
      content: [
        frontmatter({ type: 'inventory', title: 'Selected concept pages' }),
        '# Selected Concept Pages',
        '',
        '| URL | Status | Indexable | Title |',
        '| --- | ---: | --- | --- |',
        ...pages.map(
          (page) =>
            `| ${page.finalUrl} | ${page.status} | ${page.indexable ? 'yes' : 'no'} | ${singleLine(page.title ?? '').replace(/\|/g, '\\|')} |`,
        ),
        '',
        '# Citations',
        '',
        `- [Crawl start URL](${report.config.url})`,
        '',
      ].join('\n'),
    },
    {
      path: 'graph/links.md',
      content: [
        frontmatter({ type: 'graph', title: 'Internal link graph' }),
        '# Internal Link Graph',
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
        '# Citations',
        '',
        `- [Crawl start URL](${report.config.url})`,
        '',
      ].join('\n'),
    },
    {
      path: 'caveats.md',
      content: [
        frontmatter({ type: 'caveats', title: 'Caveats' }),
        '# Caveats',
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
        '# Citations',
        '',
        `- [Crawl start URL](${report.config.url})`,
        '',
      ].join('\n'),
    },
    ...concepts,
  ]

  return {
    schemaVersion: 1,
    reportId: report.id,
    sourceUrl: report.config.url,
    generatedAt: report.generatedAt,
    crawlStatus: report.status,
    rootTitle: title,
    files,
    conceptCount: concepts.length,
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

function hasFrontmatter(content: string): boolean {
  return /^---\n[\s\S]+?\n---\n/.test(content)
}

function frontmatterHasType(content: string): boolean {
  const match = content.match(/^---\n([\s\S]+?)\n---\n/)
  return Boolean(match?.[1]?.match(/^type:\s*.+$/m))
}

function frontmatterString(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]
  if (!match) return undefined
  try {
    const value: unknown = JSON.parse(match)
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

function isReserved(path: string): boolean {
  return (
    path.endsWith('/index.md') ||
    path === 'index.md' ||
    path.endsWith('/log.md') ||
    path === 'log.md'
  )
}

export function validateOkfFiles(files: OkfFile[]): OkfValidationReport {
  const issues: OkfValidationIssue[] = []
  const pathCounts = new Map<string, number>()
  for (const file of files) {
    pathCounts.set(file.path, (pathCounts.get(file.path) ?? 0) + 1)
    if (
      !file.path ||
      file.path.startsWith('/') ||
      file.path.split('/').some((part) => part === '..' || part === '')
    ) {
      issues.push({
        path: file.path || '(empty)',
        severity: 'error',
        message: 'File paths must be safe relative paths.',
      })
    }
  }
  for (const [path, count] of pathCounts) {
    if (count > 1) {
      issues.push({
        path,
        severity: 'error',
        message: `File path is duplicated ${count} times.`,
      })
    }
  }
  const byPath = new Map(files.map((file) => [file.path, file]))
  const requiredPaths = [
    'index.md',
    'log.md',
    'concepts/index.md',
    'inventory/pages.md',
    'graph/links.md',
    'caveats.md',
  ]
  for (const path of requiredPaths) {
    if (byPath.has(path)) continue
    issues.push({
      path,
      severity: 'error',
      message: 'Required seo OKF bundle file is missing.',
    })
  }
  const root = byPath.get('index.md')
  if (
    root &&
    (frontmatterString(root.content, 'okf') !== '0.1' ||
      frontmatterString(root.content, 'type') !== 'index')
  ) {
    issues.push({
      path: 'index.md',
      severity: 'error',
      message: 'Root frontmatter must declare okf "0.1" and type "index".',
    })
  }
  for (const file of files.filter((item) => item.path.endsWith('.md'))) {
    if (!file.content.trim()) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: 'Markdown files must not be empty.',
      })
    }
    if (!isReserved(file.path)) {
      if (!hasFrontmatter(file.content)) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: 'Concept files need YAML frontmatter.',
        })
      } else if (!frontmatterHasType(file.content)) {
        issues.push({
          path: file.path,
          severity: 'error',
          message: 'Concept frontmatter needs a non-empty type field.',
        })
      }
      if (file.path.startsWith('concepts/')) {
        const url = frontmatterString(file.content, 'url')
        let validUrl = false
        try {
          validUrl = Boolean(
            url && ['http:', 'https:'].includes(new URL(url).protocol),
          )
        } catch {
          validUrl = false
        }
        if (!validUrl) {
          issues.push({
            path: file.path,
            severity: 'error',
            message: 'Concept frontmatter needs a valid HTTP(S) url.',
          })
        }
      }
      if (!/\n# Citations\n/i.test(file.content)) {
        issues.push({
          path: file.path,
          severity: 'warning',
          message: 'Files with claims should include a # Citations section.',
        })
      }
    }
  }
  const conceptIndex = byPath.get('concepts/index.md')?.content ?? ''
  for (const file of files.filter(
    (item) => item.path.startsWith('concepts/') && !isReserved(item.path),
  )) {
    const relative = file.path.replace(/^concepts\//, '')
    if (!conceptIndex.includes(`](${relative})`)) {
      issues.push({
        path: file.path,
        severity: 'error',
        message: 'Concept is missing from concepts/index.md.',
      })
    }
  }
  const concepts = files.filter(
    (file) => file.path.startsWith('concepts/') && !isReserved(file.path),
  ).length
  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    files: files.length,
    concepts,
    issues,
  }
}

export function explainOkfValidation(
  validation: OkfValidationReport,
): OkfExplainReport {
  const errors = validation.issues.filter((issue) => issue.severity === 'error')
  const warnings = validation.issues.filter(
    (issue) => issue.severity === 'warning',
  )
  return {
    title: 'OKF bundle',
    valid: validation.valid,
    summary: validation.valid
      ? `This bundle passes seo OKF checks with ${validation.concepts} concept files.`
      : `This OKF bundle has ${errors.length} validation error${errors.length === 1 ? '' : 's'}.`,
    files: validation.files,
    concepts: validation.concepts,
    errors: errors.length,
    warnings: warnings.length,
    nextActions: validation.valid
      ? [
          'Review concept quality and publish the bundle where agents can fetch it.',
        ]
      : errors.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`),
  }
}
