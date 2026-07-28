import { posix } from 'node:path'
import { parseDocument } from 'yaml'
import { countLabel } from '../../phrasing.js'
import type {
  OkfExplainReport,
  OkfFile,
  OkfValidationIssue,
  OkfValidationOptions,
  OkfValidationReport,
  OkfValidationSeverity,
} from './okf-types.js'

export const OKF_MAX_FILES = 5_006
export const OKF_MAX_FILE_BYTES = 2_000_000
export const OKF_MAX_TOTAL_BYTES = 64 * 1_024 * 1_024
export const OKF_MAX_VALIDATION_ISSUES = 250

type Frontmatter = Record<string, unknown>

type ParsedMarkdown = {
  file: OkfFile
  frontmatter?: Frontmatter
  body: string
  hasFrontmatter: boolean
  parseError?: string
}

type IssueCollector = {
  add: (path: string, severity: OkfValidationSeverity, message: string) => void
  errors: number
  warnings: number
  issues: OkfValidationIssue[]
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

function issueCollector(): IssueCollector {
  const collector: IssueCollector = {
    errors: 0,
    warnings: 0,
    issues: [],
    add(path, severity, message) {
      if (severity === 'error') collector.errors++
      else collector.warnings++
      if (collector.issues.length < OKF_MAX_VALIDATION_ISSUES) {
        collector.issues.push({ path, severity, message })
      }
    },
  }
  return collector
}

function parseMarkdown(file: OkfFile): ParsedMarkdown {
  const match = file.content.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  )
  if (!match) {
    return {
      file,
      body: file.content,
      hasFrontmatter: false,
    }
  }
  const body = file.content.slice(match[0].length)
  const document = parseDocument(match[1] ?? '', {
    uniqueKeys: true,
  })
  if (document.errors.length) {
    return {
      file,
      body,
      hasFrontmatter: true,
      parseError:
        document.errors[0]?.message.split('\n')[0] ??
        'Frontmatter is not valid YAML.',
    }
  }
  let value: unknown
  try {
    value = document.toJS({ maxAliasCount: 100 })
  } catch (error) {
    return {
      file,
      body,
      hasFrontmatter: true,
      parseError:
        error instanceof Error
          ? error.message.split('\n')[0]
          : 'Frontmatter could not be read.',
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      file,
      body,
      hasFrontmatter: true,
      parseError: 'Frontmatter must be a YAML mapping.',
    }
  }
  return {
    file,
    frontmatter: value as Frontmatter,
    body,
    hasFrontmatter: true,
  }
}

function isReserved(filePath: string): boolean {
  const name = posix.basename(filePath)
  return name === 'index.md' || name === 'log.md'
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

function isDatetime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /T/.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}

function isActor(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value)) {
    return false
  }
  return (
    /^(?:human|process):[^:]+$/.test(value) || /^[^:/]+\/[^/]+$/.test(value)
  )
}

function mapping(value: unknown): Frontmatter | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Frontmatter)
    : undefined
}

function validateUsageWindow(
  value: unknown,
  path: string,
  collector: IssueCollector,
) {
  if (value === undefined) return
  const window = mapping(value)
  if (!window || !isDate(window.from) || !isDate(window.to)) {
    collector.add(
      path,
      'warning',
      'usage_window should contain YYYY-MM-DD from and to dates.',
    )
    return
  }
  if (window.from > window.to) {
    collector.add(
      path,
      'warning',
      'usage_window from must not be later than to.',
    )
  }
}

function sourceIds(
  document: ParsedMarkdown,
  collector: IssueCollector,
): Set<string> {
  const sources = document.frontmatter?.sources
  const ids = new Set<string>()
  if (sources === undefined) return ids
  if (!Array.isArray(sources) || !sources.length) {
    collector.add(
      document.file.path,
      'warning',
      'sources should be a non-empty list when present.',
    )
    return ids
  }
  for (const [index, value] of sources.entries()) {
    const source = mapping(value)
    if (!source) {
      collector.add(
        document.file.path,
        'warning',
        `sources[${index}] should be a mapping.`,
      )
      continue
    }
    if (typeof source.resource !== 'string' || !source.resource.trim()) {
      collector.add(
        document.file.path,
        'warning',
        `sources[${index}] needs a non-empty resource.`,
      )
    }
    if (source.id !== undefined) {
      if (typeof source.id !== 'string' || !source.id.trim()) {
        collector.add(
          document.file.path,
          'warning',
          `sources[${index}].id should be a non-empty string.`,
        )
      } else if (ids.has(source.id)) {
        collector.add(
          document.file.path,
          'warning',
          `Source id ${source.id} is duplicated.`,
        )
      } else {
        ids.add(source.id)
      }
    }
    if (
      source.usage_count !== undefined &&
      (typeof source.usage_count !== 'number' ||
        !Number.isInteger(source.usage_count) ||
        source.usage_count < 0)
    ) {
      collector.add(
        document.file.path,
        'warning',
        `sources[${index}].usage_count should be a non-negative whole number.`,
      )
    }
    if (source.last_modified !== undefined && !isDate(source.last_modified)) {
      collector.add(
        document.file.path,
        'warning',
        `sources[${index}].last_modified should use YYYY-MM-DD.`,
      )
    }
    validateUsageWindow(source.usage_window, document.file.path, collector)
  }
  validateUsageWindow(
    document.frontmatter?.usage_window,
    document.file.path,
    collector,
  )
  return ids
}

function validateSourceFootnotes(
  document: ParsedMarkdown,
  ids: Set<string>,
  collector: IssueCollector,
) {
  if (!ids.size) return
  const definitions = new Set<string>()
  const references = new Set<string>()
  for (const line of document.body.split(/\r?\n/)) {
    const definition = line.match(/^\[\^([^\]]+)\]:/)
    if (definition?.[1]) {
      definitions.add(definition[1])
      continue
    }
    for (const match of line.matchAll(/\[\^([^\]]+)\]/g)) {
      if (match[1]) references.add(match[1])
    }
  }
  for (const id of [...references].sort(compareText)) {
    if (!ids.has(id)) {
      collector.add(
        document.file.path,
        'warning',
        `Footnote ${id} has no matching sources id.`,
      )
    } else if (!definitions.has(id)) {
      collector.add(
        document.file.path,
        'warning',
        `Footnote ${id} needs a Markdown definition.`,
      )
    }
  }
}

function validateGenerated(
  document: ParsedMarkdown,
  collector: IssueCollector,
): boolean {
  const generated = document.frontmatter?.generated
  if (generated === undefined) return false
  const value = mapping(generated)
  if (!value) {
    collector.add(
      document.file.path,
      'warning',
      'generated should be a mapping with by and optional at fields.',
    )
    return true
  }
  if (!isActor(value.by)) {
    collector.add(
      document.file.path,
      'warning',
      'generated.by should identify a tool, human, or process actor.',
    )
  }
  if (value.at !== undefined && !isDatetime(value.at)) {
    collector.add(
      document.file.path,
      'warning',
      'generated.at should be an ISO 8601 datetime.',
    )
  }
  return true
}

function verifiedTier(
  document: ParsedMarkdown,
  collector: IssueCollector,
): keyof OkfValidationReport['trust'] {
  const verified = document.frontmatter?.verified
  if (verified === undefined) return 'unverified'
  const values = Array.isArray(verified) ? verified : [verified]
  if (!values.length) {
    collector.add(
      document.file.path,
      'warning',
      'verified should contain at least one verification event.',
    )
    return 'unverified'
  }
  let validEvents = 0
  let humanReviewed = false
  for (const [index, item] of values.entries()) {
    const event = mapping(item)
    if (!event) {
      collector.add(
        document.file.path,
        'warning',
        `verified[${index}] should be a mapping.`,
      )
      continue
    }
    const actorValid = isActor(event.by)
    const timeValid = isDatetime(event.at)
    if (!actorValid) {
      collector.add(
        document.file.path,
        'warning',
        `verified[${index}].by should identify a tool, human, or process actor.`,
      )
    }
    if (!timeValid) {
      collector.add(
        document.file.path,
        'warning',
        `verified[${index}].at should be an ISO 8601 datetime.`,
      )
    }
    if (actorValid && timeValid) {
      validEvents++
      if ((event.by as string).startsWith('human:')) humanReviewed = true
    }
  }
  if (!validEvents) return 'unverified'
  return humanReviewed ? 'humanReviewed' : 'machineConfirmed'
}

function validateReserved(
  document: ParsedMarkdown,
  collector: IssueCollector,
): string | null | undefined {
  const name = posix.basename(document.file.path)
  if (name === 'index.md') {
    if (document.hasFrontmatter) {
      if (document.parseError || !document.frontmatter) {
        collector.add(
          document.file.path,
          'error',
          document.parseError ?? 'Index frontmatter is not valid YAML.',
        )
      } else if (document.file.path !== 'index.md') {
        collector.add(
          document.file.path,
          'error',
          'Only the bundle-root index.md may contain frontmatter.',
        )
      } else {
        const keys = Object.keys(document.frontmatter)
        const extra = keys.filter((key) => key !== 'okf_version')
        if (extra.length) {
          collector.add(
            document.file.path,
            'error',
            `Root index frontmatter may only contain okf_version; found ${extra.join(', ')}.`,
          )
        }
        const version = document.frontmatter.okf_version
        if (
          version !== undefined &&
          (typeof version !== 'string' || !/^\d+\.\d+$/.test(version))
        ) {
          collector.add(
            document.file.path,
            'error',
            'okf_version should use a quoted major.minor value.',
          )
          return null
        }
        if (!/^#\s+\S+/m.test(document.body)) {
          collector.add(
            document.file.path,
            'error',
            'Index files need at least one section heading.',
          )
        }
        return typeof version === 'string' ? version : null
      }
    } else if (!/^#\s+\S+/m.test(document.body)) {
      collector.add(
        document.file.path,
        'error',
        'Index files need at least one section heading.',
      )
    }
    return document.file.path === 'index.md' ? null : undefined
  }
  if (name === 'log.md') {
    if (document.hasFrontmatter) {
      collector.add(
        document.file.path,
        'warning',
        document.parseError
          ? 'Log frontmatter could not be read and is ignored by the base OKF contract.'
          : 'Log frontmatter is ignored by the base OKF contract.',
      )
    }
    const headings = [...document.body.matchAll(/^##\s+(\S+)\s*$/gm)].map(
      (match) => match[1] ?? '',
    )
    if (!headings.length) {
      collector.add(
        document.file.path,
        'error',
        'Log files need date headings in YYYY-MM-DD form.',
      )
      return undefined
    }
    for (const heading of headings) {
      if (!isDate(heading)) {
        collector.add(
          document.file.path,
          'error',
          `Log heading ${heading} should use YYYY-MM-DD.`,
        )
      }
    }
    for (let index = 1; index < headings.length; index++) {
      const previous = headings[index - 1]
      const current = headings[index]
      if (previous && current && isDate(previous) && isDate(current)) {
        if (current >= previous) {
          collector.add(
            document.file.path,
            'error',
            'Log date headings must be unique and newest first.',
          )
          break
        }
      }
    }
  }
  return undefined
}

function markdownTargets(body: string): string[] {
  const targets = new Set<string>()
  for (const match of body.matchAll(/(?<!!)\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    let target = (match[1] ?? '').trim()
    if (target.startsWith('<')) {
      const close = target.indexOf('>')
      target = close >= 0 ? target.slice(1, close) : target
    } else {
      target = target.split(/\s+/)[0] ?? ''
    }
    if (target) targets.add(target)
  }
  return [...targets].sort(compareText)
}

function internalTarget(sourcePath: string, value: string): string | undefined {
  if (
    value.startsWith('#') ||
    value.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return undefined
  }
  const withoutFragment = value.split(/[?#]/, 1)[0] ?? ''
  if (!withoutFragment) return undefined
  const raw = withoutFragment.startsWith('/')
    ? withoutFragment.slice(1)
    : posix.join(posix.dirname(sourcePath), withoutFragment)
  return posix.normalize(raw)
}

function targetExists(target: string, paths: Set<string>): boolean {
  if (paths.has(target)) return true
  if (paths.has(`${target}.md`)) return true
  if (paths.has(posix.join(target, 'index.md'))) return true
  return false
}

function isMarkdownTarget(target: string): boolean {
  const extension = posix.extname(target).toLowerCase()
  return extension === '' || extension === '.md'
}

function evaluatedOn(value: Date | string | undefined): string {
  const date =
    value instanceof Date ? value : value ? new Date(value) : new Date()
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('OKF validation now must be a valid date.')
  }
  return date.toISOString().slice(0, 10)
}

function compatibility(
  version: string | null,
): OkfValidationReport['compatibility'] {
  if (version === '0.2') return 'v0.2'
  if (version === '0.1') return 'v0.1'
  if (version === null) return 'undeclared'
  return 'best-effort'
}

export function validateOkfFiles(
  inputFiles: OkfFile[],
  options: OkfValidationOptions = {},
): OkfValidationReport {
  const profile = options.profile ?? 'okf'
  const today = evaluatedOn(options.now)
  const collector = issueCollector()
  const files = [...inputFiles].sort(
    (left, right) =>
      compareText(left.path, right.path) ||
      compareText(left.content, right.content),
  )
  if (files.length > OKF_MAX_FILES) {
    collector.add(
      '(bundle)',
      'error',
      `OKF validation accepts at most ${OKF_MAX_FILES} files.`,
    )
  }

  let totalBytes = 0
  const pathCounts = new Map<string, number>()
  for (const file of files) {
    const bytes = Buffer.byteLength(file.content)
    totalBytes += bytes
    if (bytes > OKF_MAX_FILE_BYTES) {
      collector.add(
        file.path || '(empty)',
        'error',
        `Files must not exceed ${OKF_MAX_FILE_BYTES} bytes.`,
      )
    }
    pathCounts.set(file.path, (pathCounts.get(file.path) ?? 0) + 1)
    if (
      !file.path ||
      file.path.startsWith('/') ||
      file.path.split('/').some((part) => part === '..' || part === '')
    ) {
      collector.add(
        file.path || '(empty)',
        'error',
        'File paths must be safe relative paths.',
      )
    }
  }
  if (totalBytes > OKF_MAX_TOTAL_BYTES) {
    collector.add(
      '(bundle)',
      'error',
      `OKF files must not exceed ${OKF_MAX_TOTAL_BYTES} bytes in total.`,
    )
  }
  for (const path of [...pathCounts.keys()].sort(compareText)) {
    const count = pathCounts.get(path) ?? 0
    if (count > 1) {
      collector.add(path, 'error', `File path is duplicated ${count} times.`)
    }
  }

  const documents = files
    .filter((file) => file.path.endsWith('.md'))
    .map(parseMarkdown)
  const byPath = new Map<string, ParsedMarkdown>()
  for (const document of documents) {
    if (!byPath.has(document.file.path)) {
      byPath.set(document.file.path, document)
    }
  }

  let formatVersion: string | null = null
  for (const document of documents.filter((item) =>
    isReserved(item.file.path),
  )) {
    if (!document.file.content.trim()) {
      collector.add(
        document.file.path,
        'error',
        'Markdown files must not be empty.',
      )
    }
    const version = validateReserved(document, collector)
    if (document.file.path === 'index.md' && version !== undefined) {
      formatVersion = version
    }
  }
  if (formatVersion && !['0.1', '0.2'].includes(formatVersion)) {
    collector.add(
      'index.md',
      'warning',
      `OKF ${formatVersion} is not recognized; validation used best-effort rules.`,
    )
  }

  const concepts = documents.filter((item) => !isReserved(item.file.path))
  const provenance = {
    sources: 0,
    legacyCitations: 0,
    unspecified: 0,
  }
  const generation = {
    generated: 0,
    legacyTimestamp: 0,
    unspecified: 0,
  }
  const trust = {
    unverified: 0,
    machineConfirmed: 0,
    humanReviewed: 0,
  }
  const lifecycle = {
    draft: 0,
    stable: 0,
    deprecated: 0,
    invalid: 0,
  }
  const freshness = {
    fresh: 0,
    stale: 0,
    unspecified: 0,
    invalid: 0,
    evaluatedOn: today,
  }

  for (const document of concepts) {
    const path = document.file.path
    if (!document.file.content.trim()) {
      collector.add(path, 'error', 'Markdown files must not be empty.')
    }
    if (!document.hasFrontmatter) {
      collector.add(path, 'error', 'Concept files need YAML frontmatter.')
    } else if (document.parseError || !document.frontmatter) {
      collector.add(
        path,
        'error',
        document.parseError ?? 'Concept frontmatter is not valid YAML.',
      )
    } else if (
      typeof document.frontmatter.type !== 'string' ||
      !document.frontmatter.type.trim()
    ) {
      collector.add(
        path,
        'error',
        'Concept frontmatter needs a non-empty type field.',
      )
    }

    const sources = sourceIds(document, collector)
    validateSourceFootnotes(document, sources, collector)
    if (Array.isArray(document.frontmatter?.sources)) provenance.sources++
    else if (/^# Citations\s*$/im.test(document.body)) {
      provenance.legacyCitations++
      if (formatVersion === '0.2') {
        collector.add(
          path,
          'warning',
          'OKF v0.2 uses sources frontmatter instead of # Citations.',
        )
      }
    } else provenance.unspecified++

    if (validateGenerated(document, collector)) generation.generated++
    else if (document.frontmatter?.timestamp !== undefined) {
      generation.legacyTimestamp++
      if (!isDatetime(document.frontmatter.timestamp)) {
        collector.add(
          path,
          'warning',
          'timestamp should be an ISO 8601 datetime.',
        )
      }
    } else generation.unspecified++

    trust[verifiedTier(document, collector)]++

    const status = document.frontmatter?.status
    if (status === undefined || status === 'stable') lifecycle.stable++
    else if (status === 'draft') lifecycle.draft++
    else if (status === 'deprecated') lifecycle.deprecated++
    else {
      lifecycle.invalid++
      collector.add(
        path,
        'warning',
        'status should be draft, stable, or deprecated.',
      )
    }

    const staleAfter = document.frontmatter?.stale_after
    if (staleAfter === undefined) freshness.unspecified++
    else if (!isDate(staleAfter)) {
      freshness.invalid++
      collector.add(path, 'warning', 'stale_after should use YYYY-MM-DD.')
    } else if (today >= staleAfter) freshness.stale++
    else freshness.fresh++
  }

  const paths = new Set(files.map((file) => file.path))
  for (const document of documents) {
    for (const value of markdownTargets(document.body)) {
      const target = internalTarget(document.file.path, value)
      if (
        target &&
        isMarkdownTarget(target) &&
        (target.startsWith('../') || !targetExists(target, paths))
      ) {
        collector.add(
          document.file.path,
          'warning',
          `Linked bundle path was not supplied: ${value}`,
        )
      }
    }
  }

  let seoExport: OkfValidationReport['seoExport']
  if (profile === 'seo-export') {
    const requiredPaths = [
      'index.md',
      'log.md',
      'concepts/index.md',
      'inventory/pages.md',
      'graph/links.md',
      'caveats.md',
    ]
    for (const path of requiredPaths) {
      if (!byPath.has(path)) {
        collector.add(
          path,
          'error',
          'Required SEO export profile file is missing.',
        )
      }
    }
    if (formatVersion !== '0.2') {
      collector.add(
        'index.md',
        'error',
        'SEO exports must declare okf_version "0.2".',
      )
    }
    for (const document of concepts) {
      if (document.frontmatter?.generated === undefined) {
        collector.add(
          document.file.path,
          'error',
          'SEO export concepts need generated provenance.',
        )
      }
      if (
        !Array.isArray(document.frontmatter?.sources) ||
        !document.frontmatter.sources.length
      ) {
        collector.add(
          document.file.path,
          'error',
          'SEO export concepts need at least one source.',
        )
      }
    }

    const conceptIndexTargets = new Set(
      markdownTargets(byPath.get('concepts/index.md')?.body ?? '')
        .map((target) => internalTarget('concepts/index.md', target))
        .filter((target): target is string => Boolean(target)),
    )
    const pageConcepts = concepts.filter(
      (document) => posix.dirname(document.file.path) === 'concepts',
    )
    for (const document of pageConcepts) {
      const resource = document.frontmatter?.resource
      let validResource = false
      try {
        validResource =
          typeof resource === 'string' &&
          ['http:', 'https:'].includes(new URL(resource).protocol)
      } catch {
        validResource = false
      }
      if (!validResource) {
        collector.add(
          document.file.path,
          'error',
          'Page concepts need a valid HTTP(S) resource.',
        )
      }
      const status = document.frontmatter?.http_status
      if (
        !Number.isInteger(status) ||
        (status as number) < 100 ||
        (status as number) > 599
      ) {
        collector.add(
          document.file.path,
          'error',
          'Page concepts need a valid http_status.',
        )
      }
      if (!conceptIndexTargets.has(document.file.path)) {
        collector.add(
          document.file.path,
          'error',
          'Page concept is missing from concepts/index.md.',
        )
      }
    }
    seoExport = { pageConcepts: pageConcepts.length }
  }

  const totalIssues = collector.errors + collector.warnings
  return {
    schemaVersion: 2,
    profile,
    formatVersion,
    compatibility: compatibility(formatVersion),
    valid: collector.errors === 0,
    files: files.length,
    concepts: concepts.length,
    issueCounts: {
      errors: collector.errors,
      warnings: collector.warnings,
    },
    issues: collector.issues,
    issuesTruncated: collector.issues.length < totalIssues,
    omittedIssues: Math.max(0, totalIssues - collector.issues.length),
    provenance,
    generation,
    trust,
    lifecycle,
    freshness,
    ...(seoExport ? { seoExport } : {}),
  }
}

export function explainOkfValidation(
  validation: OkfValidationReport,
): OkfExplainReport {
  const version = validation.formatVersion
    ? `OKF v${validation.formatVersion}`
    : 'OKF'
  const summary = validation.valid
    ? `${version} validation passed with ${countLabel(validation.concepts, 'concept')}.`
    : `${version} validation found ${countLabel(validation.issueCounts.errors, 'error')}.`
  const nextActions: string[] = []
  if (!validation.valid) {
    nextActions.push(
      ...validation.issues
        .filter((issue) => issue.severity === 'error')
        .slice(0, 5)
        .map((issue) => `${issue.path}: ${issue.message}`),
    )
  } else {
    if (validation.freshness.stale) {
      nextActions.push(
        `Review ${countLabel(validation.freshness.stale, 'stale concept')} before use.`,
      )
    }
    if (validation.lifecycle.deprecated) {
      nextActions.push(
        `Keep ${countLabel(validation.lifecycle.deprecated, 'deprecated concept')} out of new work.`,
      )
    }
    if (validation.trust.unverified) {
      const sourcePronoun = validation.trust.unverified === 1 ? 'its' : 'their'
      nextActions.push(
        `Verify ${countLabel(validation.trust.unverified, 'unverified concept')} against ${sourcePronoun} sources when the task needs confirmed evidence.`,
      )
    }
    if (validation.issueCounts.warnings) {
      nextActions.push('Review validation warnings before using the bundle.')
    }
    if (!nextActions.length) {
      nextActions.push(
        'Review concept claims against their sources before relying on the bundle.',
      )
    }
  }
  return {
    title: 'OKF bundle',
    profile: validation.profile,
    formatVersion: validation.formatVersion,
    compatibility: validation.compatibility,
    valid: validation.valid,
    summary,
    files: validation.files,
    concepts: validation.concepts,
    errors: validation.issueCounts.errors,
    warnings: validation.issueCounts.warnings,
    provenance: validation.provenance,
    generation: validation.generation,
    trust: validation.trust,
    lifecycle: validation.lifecycle,
    freshness: validation.freshness,
    nextActions,
  }
}
