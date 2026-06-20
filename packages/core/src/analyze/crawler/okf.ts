import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { CrawlReport } from './report.js'

export type OkfFile = {
  path: string
  content: string
}

export type OkfBundle = {
  reportId: string
  rootTitle: string
  files: OkfFile[]
  conceptCount: number
  caveats: string[]
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

function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 80) || 'page'
}

function frontmatter(values: Record<string, unknown>): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${JSON.stringify(item)}`)
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`)
    }
  }
  lines.push('---', '')
  return lines.join('\n')
}

function pageTitle(page: CrawlPageSnapshot): string {
  return (
    page.title ?? page.h1 ?? (new URL(page.finalUrl).pathname || page.finalUrl)
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
    page.metaDescription ? `Summary: ${page.metaDescription}` : undefined,
    page.contentSample ? `Extract: ${page.contentSample}` : undefined,
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
    `- [Source page](${page.finalUrl})`,
    '',
  ].filter((line): line is string => line !== undefined)

  return {
    path: `concepts/${slug(page.finalUrl)}.md`,
    content: body.join('\n'),
  }
}

export function buildOkfBundle(
  report: CrawlReport,
  options: { maxConcepts?: number; title?: string } = {},
): OkfBundle {
  const title =
    options.title ?? new URL(report.config.url).hostname.replace(/^www\./, '')
  const pages = report.pages
    .filter((page) => page.indexable && page.status < 400)
    .sort(
      (a, b) =>
        (b.internalLinkAuthorityScore ?? 0) -
          (a.internalLinkAuthorityScore ?? 0) ||
        a.finalUrl.localeCompare(b.finalUrl),
    )
    .slice(0, options.maxConcepts ?? 500)
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
        `- ${new Date().toISOString()}: Generated OKF bundle from crawl report ${report.id}.`,
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
        frontmatter({ type: 'inventory', title: 'Crawled pages' }),
        '# Crawled Pages',
        '',
        '| URL | Status | Indexable | Title |',
        '| --- | ---: | --- | --- |',
        ...report.pages.map(
          (page) =>
            `| ${page.finalUrl} | ${page.status} | ${page.indexable ? 'yes' : 'no'} | ${(page.title ?? '').replace(/\|/g, '\\|')} |`,
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
        ...report.pages.flatMap((page) => [
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
        ...(report.caveats.length
          ? report.caveats
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
    reportId: report.id,
    rootTitle: title,
    files,
    conceptCount: concepts.length,
    caveats: report.caveats,
  }
}

function hasFrontmatter(content: string): boolean {
  return /^---\n[\s\S]+?\n---\n/.test(content)
}

function frontmatterHasType(content: string): boolean {
  const match = content.match(/^---\n([\s\S]+?)\n---\n/)
  return Boolean(match?.[1]?.match(/^type:\s*.+$/m))
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
  const byPath = new Map(files.map((file) => [file.path, file]))
  if (!byPath.has('index.md')) {
    issues.push({
      path: 'index.md',
      severity: 'error',
      message: 'Root index.md is required.',
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
      if (!/\n# Citations\n/i.test(file.content)) {
        issues.push({
          path: file.path,
          severity: 'warning',
          message: 'Files with claims should include a # Citations section.',
        })
      }
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
      ? `This OKF bundle is valid with ${validation.concepts} concept files.`
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
