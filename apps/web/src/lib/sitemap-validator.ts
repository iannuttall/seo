import { SaxesParser, type SaxesTagNS } from 'saxes'

export const SITEMAP_VALIDATOR_LIMITS = Object.freeze({
  compressedBytes: 12_000_000,
  expandedBytes: 50 * 1_024 * 1_024,
  issues: 200,
  childSitemaps: 500,
  trackedLocationCharacters: 12_000_000,
  urls: 50_000,
  recommendedUrls: 10_000,
})

const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const CHANGE_FREQUENCIES = new Set([
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
])
const LAST_MODIFIED =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/u

export type SitemapValidationSource = {
  kind: 'file' | 'paste' | 'url'
  name?: string
  requestedUrl?: string
  finalUrl?: string
  contentType?: string | null
  compressedBytes: number
  expandedBytes: number
  gzip: boolean
}

export type SitemapValidationIssue = {
  code: string
  severity: 'error' | 'warning' | 'advice'
  message: string
  line?: number
  entry?: number
  value?: string
}

export type SitemapValidationReport = {
  schema: 1
  analysisDate: string
  dataStatus: 'complete' | 'partial'
  valid: boolean
  source: SitemapValidationSource
  document: {
    kind: 'urlset' | 'sitemapindex' | null
    namespace: string | null
    entries: number
    validLocations: number
    invalidLocations: number
    duplicateLocations: number
    lastModifiedValues: number
    changeFrequencyValues: number
    priorityValues: number
    futureLastModifiedValues: number
    singleHost: boolean
    locationHostMismatches: number
    sourceOriginMismatches: number
    indexDirectoryScopeMismatches: number
    overProtocolUrlLimit: boolean
    overRecommendedSize: boolean
    childSitemaps: {
      total: number
      retained: string[]
      omitted: number
    }
  }
  issueStats: {
    errors: number
    warnings: number
    advice: number
    retained: number
    omitted: number
  }
  issues: SitemapValidationIssue[]
  truncation: {
    inputLimitExceeded: boolean
    issueLimitExceeded: boolean
    locationTrackingLimitExceeded: boolean
  }
  limits: typeof SITEMAP_VALIDATOR_LIMITS
}

type EntryState = {
  number: number
  line: number
  fields: Map<string, Array<{ value: string; line: number }>>
}

type FieldState = {
  name: string
  line: number
  value: string
}

export class SitemapValidationLimitError extends Error {
  readonly limit: 'compressed' | 'expanded'

  constructor(limit: 'compressed' | 'expanded', message: string) {
    super(message)
    this.limit = limit
  }
}

class SitemapValidationEncodingError extends Error {}

function line(parser: SaxesParser): number {
  return Math.max(1, parser.line)
}

function shortValue(value: string): string {
  return value.length <= 200 ? value : `${value.slice(0, 197)}...`
}

function normalizedLocation(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2_048) return undefined
  try {
    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    if (url.username || url.password) return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function validLastModified(value: string): boolean {
  if (!LAST_MODIFIED.test(value)) return false
  const datePart = value.slice(0, 10)
  const parsed = new Date(`${datePart}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === datePart
  )
}

function sourceUrl(source: SitemapValidationSource): URL | undefined {
  if (source.kind !== 'url') return undefined
  const value = source.finalUrl ?? source.requestedUrl
  if (!value) return undefined
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function containingDirectory(url: URL): string {
  const lastSlash = url.pathname.lastIndexOf('/')
  return url.pathname.slice(0, lastSlash + 1)
}

function rebuiltStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  first: Uint8Array,
): ReadableStream<Uint8Array> {
  let pending: Uint8Array | undefined = first
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (pending) {
        controller.enqueue(pending)
        pending = undefined
        return
      }
      const chunk = await reader.read()
      if (chunk.done) {
        controller.close()
        reader.releaseLock()
        return
      }
      controller.enqueue(chunk.value)
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
}

async function decodedByteChunks(
  body: ReadableStream<Uint8Array>,
  source: SitemapValidationSource,
  onProgress?: (source: SitemapValidationSource) => void,
): Promise<AsyncGenerator<string>> {
  const inputReader = body.getReader()
  const first = await inputReader.read()
  if (first.done) {
    inputReader.releaseLock()
    return (async function* empty() {})()
  }
  source.gzip = first.value[0] === 0x1f && first.value[1] === 0x8b
  let compressedFileBytes = 0
  const counted = rebuiltStream(inputReader, first.value).pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        compressedFileBytes += chunk.byteLength
        source.compressedBytes = compressedFileBytes
        if (compressedFileBytes > SITEMAP_VALIDATOR_LIMITS.compressedBytes) {
          throw new SitemapValidationLimitError(
            'compressed',
            `The compressed file exceeded the ${SITEMAP_VALIDATOR_LIMITS.compressedBytes.toLocaleString()} byte processing limit.`,
          )
        }
        controller.enqueue(chunk)
      },
    }),
  )
  const expanded = source.gzip
    ? counted.pipeThrough(
        new DecompressionStream('gzip') as unknown as TransformStream<
          Uint8Array,
          Uint8Array
        >,
      )
    : counted

  return (async function* decode(): AsyncGenerator<string> {
    const reader = expanded.getReader()
    const decoder = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: false,
    })
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        source.expandedBytes += chunk.value.byteLength
        if (source.expandedBytes > SITEMAP_VALIDATOR_LIMITS.expandedBytes) {
          throw new SitemapValidationLimitError(
            'expanded',
            `The uncompressed sitemap exceeded the ${SITEMAP_VALIDATOR_LIMITS.expandedBytes.toLocaleString()} byte protocol limit.`,
          )
        }
        onProgress?.({ ...source })
        let text: string
        try {
          text = decoder.decode(chunk.value, { stream: true })
        } catch {
          throw new SitemapValidationEncodingError(
            'The sitemap is not valid UTF-8 text.',
          )
        }
        if (text) yield text
      }
      let end: string
      try {
        end = decoder.decode()
      } catch {
        throw new SitemapValidationEncodingError(
          'The sitemap is not valid UTF-8 text.',
        )
      }
      if (end) yield end
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  })()
}

export async function validateSitemapChunks(input: {
  chunks: AsyncIterable<string>
  source: SitemapValidationSource
}): Promise<SitemapValidationReport> {
  const analysisDate = new Date().toISOString().slice(0, 10)
  const fetchedFrom = sourceUrl(input.source)
  const fetchedDirectory = fetchedFrom
    ? containingDirectory(fetchedFrom)
    : undefined
  const issues: SitemapValidationIssue[] = []
  let omittedIssues = 0
  let errors = 0
  let warnings = 0
  let advice = 0
  let parsingComplete = true
  let inputLimitExceeded = false
  let locationTrackingLimitExceeded = false
  let rootKind: 'urlset' | 'sitemapindex' | null = null
  let rootNamespace: string | null = null
  let rootClosed = false
  let xmlErrorRecorded = false
  let entries = 0
  let validLocations = 0
  let invalidLocations = 0
  let duplicateLocations = 0
  let lastModifiedValues = 0
  let changeFrequencyValues = 0
  let priorityValues = 0
  let futureLastModifiedValues = 0
  let locationHostMismatches = 0
  let sourceOriginMismatches = 0
  let indexDirectoryScopeMismatches = 0
  let locationCharacters = 0
  let firstLocationHostname: string | undefined
  let firstHostMismatch:
    | { line: number; entry: number; value: string }
    | undefined
  let firstSourceOriginMismatch:
    | { line: number; entry: number; value: string }
    | undefined
  let firstIndexDirectoryMismatch:
    | { line: number; entry: number; value: string }
    | undefined
  let firstFutureLastModified:
    | { line: number; entry: number; value: string }
    | undefined
  const seenLocations = new Set<string>()
  const retainedChildSitemaps = new Set<string>()
  const stack: SaxesTagNS[] = []
  let currentEntry: EntryState | undefined
  let currentField: FieldState | undefined

  function addIssue(issue: SitemapValidationIssue): void {
    if (issue.severity === 'error') errors += 1
    else if (issue.severity === 'warning') warnings += 1
    else advice += 1
    if (issues.length < SITEMAP_VALIDATOR_LIMITS.issues) issues.push(issue)
    else omittedIssues += 1
  }

  function checkField(entry: EntryState, name: string): string | undefined {
    const values = entry.fields.get(name) ?? []
    if (values.length > 1) {
      addIssue({
        code: `duplicate-${name}`,
        severity: 'error',
        message: `Entry ${entry.number.toLocaleString()} contains more than one <${name}> element.`,
        line: values[1]?.line ?? entry.line,
        entry: entry.number,
      })
    }
    return values[0]?.value.trim()
  }

  function finishEntry(entry: EntryState): void {
    entries += 1
    const location = checkField(entry, 'loc')
    if (!location) {
      invalidLocations += 1
      addIssue({
        code: 'missing-location',
        severity: 'error',
        message: `Entry ${entry.number.toLocaleString()} does not contain a location.`,
        line: entry.line,
        entry: entry.number,
      })
    } else {
      const normalized = normalizedLocation(location)
      if (!normalized) {
        invalidLocations += 1
        addIssue({
          code: 'invalid-location',
          severity: 'error',
          message: `Entry ${entry.number.toLocaleString()} does not contain a complete HTTP or HTTPS URL under 2,048 characters.`,
          line: entry.fields.get('loc')?.[0]?.line ?? entry.line,
          entry: entry.number,
          value: shortValue(location),
        })
      } else {
        validLocations += 1
        const locationUrl = new URL(normalized)
        if (
          rootKind === 'sitemapindex' &&
          retainedChildSitemaps.size < SITEMAP_VALIDATOR_LIMITS.childSitemaps
        ) {
          retainedChildSitemaps.add(normalized)
        }
        if (!firstLocationHostname) {
          firstLocationHostname = locationUrl.hostname
        } else if (locationUrl.hostname !== firstLocationHostname) {
          locationHostMismatches += 1
          firstHostMismatch ??= {
            line: entry.fields.get('loc')?.[0]?.line ?? entry.line,
            entry: entry.number,
            value: normalized,
          }
        }
        if (fetchedFrom && locationUrl.origin !== fetchedFrom.origin) {
          sourceOriginMismatches += 1
          firstSourceOriginMismatch ??= {
            line: entry.fields.get('loc')?.[0]?.line ?? entry.line,
            entry: entry.number,
            value: normalized,
          }
        } else if (
          rootKind === 'sitemapindex' &&
          fetchedFrom &&
          fetchedDirectory &&
          !locationUrl.pathname.startsWith(fetchedDirectory)
        ) {
          indexDirectoryScopeMismatches += 1
          firstIndexDirectoryMismatch ??= {
            line: entry.fields.get('loc')?.[0]?.line ?? entry.line,
            entry: entry.number,
            value: normalized,
          }
        }
        if (!locationTrackingLimitExceeded) {
          if (
            locationCharacters + normalized.length >
            SITEMAP_VALIDATOR_LIMITS.trackedLocationCharacters
          ) {
            locationTrackingLimitExceeded = true
            addIssue({
              code: 'location-tracking-limit',
              severity: 'warning',
              message:
                'Duplicate URL tracking stopped after the location processing limit was reached.',
              line: entry.line,
              entry: entry.number,
            })
          } else if (seenLocations.has(normalized)) {
            duplicateLocations += 1
            addIssue({
              code: 'duplicate-location',
              severity: 'warning',
              message: `Entry ${entry.number.toLocaleString()} repeats a location already present in this file.`,
              line: entry.fields.get('loc')?.[0]?.line ?? entry.line,
              entry: entry.number,
              value: shortValue(normalized),
            })
          } else {
            seenLocations.add(normalized)
            locationCharacters += normalized.length
          }
        }
      }
    }

    const lastModified = checkField(entry, 'lastmod')
    if (entry.fields.has('lastmod')) {
      lastModifiedValues += 1
      if (!lastModified || !validLastModified(lastModified)) {
        addIssue({
          code: 'invalid-lastmod',
          severity: 'warning',
          message: `Entry ${entry.number.toLocaleString()} has a last modified value that is not a complete W3C date or date-time.`,
          line: entry.fields.get('lastmod')?.[0]?.line ?? entry.line,
          entry: entry.number,
          ...(lastModified ? { value: shortValue(lastModified) } : {}),
        })
      } else if (lastModified.slice(0, 10) > analysisDate) {
        futureLastModifiedValues += 1
        firstFutureLastModified ??= {
          line: entry.fields.get('lastmod')?.[0]?.line ?? entry.line,
          entry: entry.number,
          value: lastModified,
        }
      }
    }

    const changeFrequency = checkField(entry, 'changefreq')
    if (entry.fields.has('changefreq')) {
      changeFrequencyValues += 1
      if (
        !changeFrequency ||
        !CHANGE_FREQUENCIES.has(changeFrequency.toLowerCase())
      ) {
        addIssue({
          code: 'invalid-changefreq',
          severity: 'warning',
          message: `Entry ${entry.number.toLocaleString()} has an unsupported change frequency value.`,
          line: entry.fields.get('changefreq')?.[0]?.line ?? entry.line,
          entry: entry.number,
          ...(changeFrequency ? { value: shortValue(changeFrequency) } : {}),
        })
      }
    }

    const priority = checkField(entry, 'priority')
    if (entry.fields.has('priority')) {
      priorityValues += 1
      const numeric = Number(priority)
      if (
        !priority ||
        !Number.isFinite(numeric) ||
        numeric < 0 ||
        numeric > 1
      ) {
        addIssue({
          code: 'invalid-priority',
          severity: 'warning',
          message: `Entry ${entry.number.toLocaleString()} has a priority outside the 0.0 to 1.0 range.`,
          line: entry.fields.get('priority')?.[0]?.line ?? entry.line,
          entry: entry.number,
          ...(priority ? { value: shortValue(priority) } : {}),
        })
      }
    }
  }

  const contentType = input.source.contentType?.toLowerCase()
  if (contentType?.startsWith('text/html')) {
    addIssue({
      code: 'html-response',
      severity: 'error',
      message: 'The URL returned an HTML document instead of a sitemap file.',
    })
  } else if (
    contentType &&
    !contentType.includes('xml') &&
    !contentType.includes('gzip') &&
    !contentType.includes('octet-stream') &&
    !contentType.startsWith('text/plain')
  ) {
    addIssue({
      code: 'unexpected-content-type',
      severity: 'warning',
      message: `The response used the unexpected content type ${input.source.contentType}.`,
      value: input.source.contentType ?? undefined,
    })
  }

  const parser = new SaxesParser({ xmlns: true, position: true })
  parser.on('xmldecl', (declaration) => {
    if (
      declaration.encoding &&
      declaration.encoding.toLowerCase() !== 'utf-8'
    ) {
      addIssue({
        code: 'invalid-encoding-declaration',
        severity: 'error',
        message: 'The XML declaration must use UTF-8 encoding.',
        line: line(parser),
        value: declaration.encoding,
      })
    }
  })
  parser.on('doctype', () => {
    addIssue({
      code: 'doctype',
      severity: 'error',
      message: 'Sitemaps must not contain a document type declaration.',
      line: line(parser),
    })
  })
  parser.on('error', (error) => {
    parsingComplete = false
    if (!xmlErrorRecorded) {
      xmlErrorRecorded = true
      addIssue({
        code: 'invalid-xml',
        severity: 'error',
        message: error.message.replace(/^\d+:\d+:\s*/u, ''),
        line: line(parser),
      })
    }
    throw error
  })
  parser.on('opentag', (tag) => {
    const local = tag.local.toLowerCase()
    if (stack.length === 0) {
      if (local === 'urlset' || local === 'sitemapindex') rootKind = local
      else {
        addIssue({
          code: 'invalid-root',
          severity: 'error',
          message: 'The root element must be <urlset> or <sitemapindex>.',
          line: line(parser),
          value: shortValue(tag.name),
        })
      }
      rootNamespace = tag.uri || null
      if (tag.uri !== SITEMAP_NAMESPACE) {
        addIssue({
          code: 'invalid-namespace',
          severity: 'error',
          message: `The root element must use the ${SITEMAP_NAMESPACE} namespace.`,
          line: line(parser),
          value: tag.uri || '(missing)',
        })
      }
    } else if (stack.length === 1) {
      const wanted = rootKind === 'urlset' ? 'url' : 'sitemap'
      if (local === wanted && tag.uri === (rootNamespace ?? '')) {
        currentEntry = {
          number: entries + 1,
          line: line(parser),
          fields: new Map(),
        }
      } else if (tag.uri === (rootNamespace ?? '')) {
        addIssue({
          code: 'unexpected-entry',
          severity: 'error',
          message: `The <${tag.name}> element is not valid directly inside this sitemap root.`,
          line: line(parser),
        })
      }
    } else if (stack.length === 2 && currentEntry) {
      const allowed =
        rootKind === 'urlset'
          ? new Set(['loc', 'lastmod', 'changefreq', 'priority'])
          : new Set(['loc', 'lastmod'])
      if (tag.uri === (rootNamespace ?? '') && allowed.has(local)) {
        currentField = { name: local, line: line(parser), value: '' }
      } else if (tag.uri === (rootNamespace ?? '')) {
        addIssue({
          code: 'unexpected-entry-field',
          severity: 'error',
          message: `The <${tag.name}> element is not valid in this entry type.`,
          line: line(parser),
          entry: currentEntry.number,
        })
      }
    }
    stack.push(tag)
  })
  const appendText = (value: string): void => {
    if (currentField) currentField.value += value
  }
  parser.on('text', appendText)
  parser.on('cdata', appendText)
  parser.on('closetag', (tag) => {
    const local = tag.local.toLowerCase()
    if (currentField && local === currentField.name && stack.length === 3) {
      const values = currentEntry?.fields.get(currentField.name) ?? []
      values.push({ value: currentField.value, line: currentField.line })
      currentEntry?.fields.set(currentField.name, values)
      currentField = undefined
    }
    const wanted = rootKind === 'urlset' ? 'url' : 'sitemap'
    if (currentEntry && local === wanted && stack.length === 2) {
      finishEntry(currentEntry)
      currentEntry = undefined
    }
    if (stack.length === 1) rootClosed = true
    stack.pop()
  })

  try {
    for await (const chunk of input.chunks) parser.write(chunk)
    parser.close()
  } catch (error) {
    parsingComplete = false
    if (error instanceof SitemapValidationLimitError) {
      inputLimitExceeded = true
      addIssue({
        code: `${error.limit}-size-limit`,
        severity: 'error',
        message: error.message,
      })
    } else if (error instanceof SitemapValidationEncodingError) {
      addIssue({
        code: 'invalid-encoding',
        severity: 'error',
        message: error.message,
      })
    } else if (!issues.some((issue) => issue.code === 'invalid-xml')) {
      addIssue({
        code: 'processing-stopped',
        severity: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'The sitemap could not be completely processed.',
      })
    }
  }

  if (!rootKind && !issues.some((issue) => issue.code === 'invalid-root')) {
    addIssue({
      code: 'missing-root',
      severity: 'error',
      message: 'No sitemap root element was found.',
    })
  }
  if (rootKind && entries === 0 && parsingComplete) {
    addIssue({
      code: 'empty-sitemap',
      severity: 'error',
      message: `The <${rootKind}> element must contain at least one entry.`,
    })
  }
  if (rootKind && !rootClosed && parsingComplete) {
    parsingComplete = false
    addIssue({
      code: 'unclosed-root',
      severity: 'error',
      message: 'The sitemap root element was not closed.',
    })
  }

  if (locationHostMismatches > 0 && firstHostMismatch) {
    addIssue({
      code: 'multiple-location-hosts',
      severity: 'error',
      message: `${locationHostMismatches.toLocaleString()} ${locationHostMismatches === 1 ? 'location uses' : 'locations use'} a different hostname from ${firstLocationHostname}. One sitemap file can contain locations for one hostname only.`,
      ...firstHostMismatch,
    })
  }
  if (sourceOriginMismatches > 0 && firstSourceOriginMismatch && fetchedFrom) {
    addIssue({
      code: 'source-origin-mismatch',
      severity: 'advice',
      message: `${sourceOriginMismatches.toLocaleString()} ${sourceOriginMismatches === 1 ? 'location uses' : 'locations use'} a different protocol, hostname, or port from ${fetchedFrom.origin}. Cross-site submission can authorize this setup, which this check cannot observe.`,
      ...firstSourceOriginMismatch,
    })
  }
  if (
    indexDirectoryScopeMismatches > 0 &&
    firstIndexDirectoryMismatch &&
    fetchedFrom &&
    fetchedDirectory
  ) {
    addIssue({
      code: 'sitemap-index-directory-scope',
      severity: 'advice',
      message: `${indexDirectoryScopeMismatches.toLocaleString()} referenced ${indexDirectoryScopeMismatches === 1 ? 'sitemap sits' : 'sitemaps sit'} outside ${fetchedFrom.origin}${fetchedDirectory}. Search Console or robots.txt submission may authorize a different scope, which this check cannot observe.`,
      ...firstIndexDirectoryMismatch,
    })
  }
  if (futureLastModifiedValues > 0 && firstFutureLastModified) {
    addIssue({
      code: 'future-lastmod',
      severity: 'advice',
      message: `${futureLastModifiedValues.toLocaleString()} last modified ${futureLastModifiedValues === 1 ? 'value is' : 'values are'} later than the ${analysisDate} analysis date. Check that each value describes a real modification date.`,
      ...firstFutureLastModified,
    })
  }

  const overProtocolUrlLimit = entries > SITEMAP_VALIDATOR_LIMITS.urls
  if (overProtocolUrlLimit) {
    addIssue({
      code: 'url-count-limit',
      severity: 'error',
      message: `The sitemap contains ${entries.toLocaleString()} entries. The protocol limit is ${SITEMAP_VALIDATOR_LIMITS.urls.toLocaleString()} entries per file.`,
    })
  }
  const overRecommendedSize = entries > SITEMAP_VALIDATOR_LIMITS.recommendedUrls
  if (overRecommendedSize) {
    addIssue({
      code: 'large-sitemap-advice',
      severity: 'advice',
      message: `This file contains ${entries.toLocaleString()} entries. Some technical SEO teams split files at around ${SITEMAP_VALIDATOR_LIMITS.recommendedUrls.toLocaleString()} entries so failures and coverage groups are easier to isolate. This is a working convention, not a search engine requirement or ranking factor.`,
    })
  }

  const partial =
    !parsingComplete ||
    inputLimitExceeded ||
    omittedIssues > 0 ||
    locationTrackingLimitExceeded
  const childSitemaps = [...retainedChildSitemaps]
  const childSitemapTotal =
    rootKind === 'sitemapindex'
      ? Math.max(0, validLocations - duplicateLocations)
      : 0
  return {
    schema: 1,
    analysisDate,
    dataStatus: partial ? 'partial' : 'complete',
    valid: !partial && errors === 0,
    source: { ...input.source },
    document: {
      kind: rootKind,
      namespace: rootNamespace,
      entries,
      validLocations,
      invalidLocations,
      duplicateLocations,
      lastModifiedValues,
      changeFrequencyValues,
      priorityValues,
      futureLastModifiedValues,
      singleHost: locationHostMismatches === 0,
      locationHostMismatches,
      sourceOriginMismatches,
      indexDirectoryScopeMismatches,
      overProtocolUrlLimit,
      overRecommendedSize,
      childSitemaps: {
        total: childSitemapTotal,
        retained: childSitemaps,
        omitted: Math.max(0, childSitemapTotal - childSitemaps.length),
      },
    },
    issueStats: {
      errors,
      warnings,
      advice,
      retained: issues.length,
      omitted: omittedIssues,
    },
    issues,
    truncation: {
      inputLimitExceeded,
      issueLimitExceeded: omittedIssues > 0,
      locationTrackingLimitExceeded,
    },
    limits: SITEMAP_VALIDATOR_LIMITS,
  }
}

export async function validateSitemapByteStream(input: {
  body: ReadableStream<Uint8Array>
  source: Omit<
    SitemapValidationSource,
    'compressedBytes' | 'expandedBytes' | 'gzip'
  >
  onProgress?: (source: SitemapValidationSource) => void
}): Promise<SitemapValidationReport> {
  const source: SitemapValidationSource = {
    ...input.source,
    compressedBytes: 0,
    expandedBytes: 0,
    gzip: false,
  }
  const chunks = await decodedByteChunks(input.body, source, input.onProgress)
  return validateSitemapChunks({ chunks, source })
}

export function validateSitemapText(
  content: string,
  source: Omit<
    SitemapValidationSource,
    'compressedBytes' | 'expandedBytes' | 'gzip'
  > = { kind: 'paste' },
): Promise<SitemapValidationReport> {
  return validateSitemapByteStream({
    body: new Blob([content]).stream(),
    source,
  })
}
