import type { CheerioAPI } from 'cheerio'
import type { GoogleRichResultAssessment } from '../types.js'
import {
  assessGoogleRichResults,
  unassessedGoogleRichResult,
} from './google-rich-results.js'

export type StructuredDataFormat = 'json-ld' | 'microdata' | 'rdfa'

export type UnrecognizedJsonLdType = {
  block: number
  path: string
  value: string
  reason:
    | 'missing-schema-context'
    | 'unresolved-context'
    | 'unsupported-vocabulary'
}

export type StructuredDataExtraction = {
  jsonLd: unknown[]
  invalidJsonLdSamples: Array<{ snippet: string; error: string }>
  unrecognizedJsonLdTypes: UnrecognizedJsonLdType[]
  sameAs: Array<{
    url: string
    block: number
    path: string
    subjectId?: string
    subjectTypes: string[]
  }>
  invalidSameAs: Array<{ block: number; path: string; value: string }>
  schemaTypes: string[]
  googleRichResults: GoogleRichResultAssessment[]
  formats: StructuredDataFormat[]
  hasAuthor: boolean
  hasDate: boolean
}

type ActiveContext = {
  vocab?: string
  unresolvedContext?: boolean
  prefixes: Map<string, string>
}

function schemaTypeFromIri(value: string): string | undefined {
  try {
    const iri = new URL(value)
    const host = iri.hostname.replace(/^www\./, '').toLowerCase()
    if (host !== 'schema.org') return undefined
    const type = decodeURIComponent(iri.pathname.replace(/^\/+/, ''))
    return /^[A-Za-z][A-Za-z0-9]*$/.test(type) ? type : undefined
  } catch {
    return undefined
  }
}

function contextFrom(parent: ActiveContext, value: unknown): ActiveContext {
  const next: ActiveContext = {
    vocab: parent.vocab,
    unresolvedContext: parent.unresolvedContext,
    prefixes: new Map(parent.prefixes),
  }
  const apply = (context: unknown): void => {
    if (Array.isArray(context)) {
      for (const item of context) apply(item)
      return
    }
    if (typeof context === 'string') {
      if (schemaTypeFromIri(`${context.replace(/\/?$/, '/')}Thing`)) {
        next.vocab = context
        next.unresolvedContext = false
      } else {
        next.unresolvedContext = true
      }
      return
    }
    if (!context || typeof context !== 'object') return
    for (const [term, definition] of Object.entries(
      context as Record<string, unknown>,
    )) {
      if (term === '@vocab' && typeof definition === 'string') {
        next.vocab = definition
        next.unresolvedContext = false
      } else if (typeof definition === 'string') {
        next.prefixes.set(term, definition)
      } else if (
        definition &&
        typeof definition === 'object' &&
        typeof (definition as Record<string, unknown>)['@id'] === 'string'
      ) {
        next.prefixes.set(
          term,
          (definition as Record<string, string>)['@id'] ?? '',
        )
      }
    }
  }
  apply(value)
  return next
}

function normalizedSchemaType(
  value: string,
  context: ActiveContext,
): { type?: string; reason?: UnrecognizedJsonLdType['reason'] } {
  const direct = schemaTypeFromIri(value)
  if (direct) return { type: direct }
  const separator = value.indexOf(':')
  if (separator > 0) {
    const prefix = value.slice(0, separator)
    const suffix = value.slice(separator + 1)
    const base = context.prefixes.get(prefix)
    const expanded = base ? schemaTypeFromIri(`${base}${suffix}`) : undefined
    return expanded ? { type: expanded } : { reason: 'unsupported-vocabulary' }
  }
  if (context.vocab) {
    const expanded = schemaTypeFromIri(
      `${context.vocab.replace(/\/?$/, '/')}${value}`,
    )
    return expanded ? { type: expanded } : { reason: 'unsupported-vocabulary' }
  }
  return {
    reason: context.unresolvedContext
      ? 'unresolved-context'
      : 'missing-schema-context',
  }
}

function usableAuthor(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.some(usableAuthor)
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return usableAuthor(record.name)
}

export function isValidStructuredDate(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(isValidStructuredDate)
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  const datePart = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0]
  if (!datePart) return false
  const parsed = new Date(trimmed)
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === datePart
  )
}

function parseJsonLd(
  blocks: string[],
  baseUrl: string,
): Omit<StructuredDataExtraction, 'formats'> {
  const jsonLd: unknown[] = []
  const invalidJsonLdSamples: Array<{ snippet: string; error: string }> = []
  const unrecognizedJsonLdTypes: UnrecognizedJsonLdType[] = []
  const sameAs: StructuredDataExtraction['sameAs'] = []
  const invalidSameAs: StructuredDataExtraction['invalidSameAs'] = []
  const schemaTypes = new Set<string>()
  const googleRichResults: GoogleRichResultAssessment[] = []
  let hasAuthor = false
  let hasDate = false

  const visit = (
    node: unknown,
    context: ActiveContext,
    block: number,
    path: string,
  ): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        visit(item, context, block, `${path}[${index}]`)
      })
      return
    }
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    const active = contextFrom(context, record['@context'])
    const rawTypes = Array.isArray(record['@type'])
      ? record['@type']
      : [record['@type']]
    const nodeTypes: string[] = []
    for (const rawType of rawTypes) {
      if (typeof rawType !== 'string' || !rawType.trim()) continue
      const normalized = normalizedSchemaType(rawType.trim(), active)
      if (normalized.type) {
        schemaTypes.add(normalized.type)
        nodeTypes.push(normalized.type)
      } else if (normalized.reason) {
        unrecognizedJsonLdTypes.push({
          block,
          path: `${path}.@type`,
          value: rawType,
          reason: normalized.reason,
        })
      }
    }
    if (nodeTypes.length) {
      googleRichResults.push(
        ...assessGoogleRichResults({ block, path, nodeTypes, record }),
      )
      hasAuthor ||= usableAuthor(record.author)
      hasDate ||=
        isValidStructuredDate(record.datePublished) ||
        isValidStructuredDate(record.dateModified)
      const rawSameAs = Array.isArray(record.sameAs)
        ? record.sameAs
        : [record.sameAs]
      const subjectId =
        typeof record['@id'] === 'string'
          ? absoluteHttpUrl(record['@id'], baseUrl)
          : undefined
      rawSameAs.forEach((value, index) => {
        if (typeof value !== 'string' || !value.trim()) return
        const itemPath = `${path}.sameAs${rawSameAs.length > 1 ? `[${index}]` : ''}`
        const url = absoluteHttpUrl(value, baseUrl)
        if (url) {
          sameAs.push({
            url,
            block,
            path: itemPath,
            subjectId,
            subjectTypes: nodeTypes,
          })
        } else {
          invalidSameAs.push({ block, path: itemPath, value })
        }
      })
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === '@context') continue
      visit(value, active, block, `${path}.${key}`)
    }
  }

  blocks.forEach((block, index) => {
    try {
      const parsed: unknown = JSON.parse(block)
      jsonLd.push(parsed)
      visit(parsed, { prefixes: new Map() }, index, '$')
    } catch (error) {
      invalidJsonLdSamples.push({
        snippet: block.replace(/\s+/g, ' ').trim().slice(0, 200),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return {
    jsonLd,
    invalidJsonLdSamples,
    unrecognizedJsonLdTypes,
    sameAs,
    invalidSameAs,
    schemaTypes: [...schemaTypes],
    googleRichResults,
    hasAuthor,
    hasDate,
  }
}

function absoluteHttpUrl(value: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(value, baseUrl)
    return ['http:', 'https:'].includes(url.protocol)
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function microdataTypes($: CheerioAPI): string[] {
  const types = new Set<string>()
  $('[itemscope][itemtype]').each((_index, element) => {
    const values = ($(element).attr('itemtype') ?? '').split(/\s+/)
    for (const value of values) {
      const type = schemaTypeFromIri(value)
      if (type) types.add(type)
    }
  })
  return [...types]
}

function rdfaTypes($: CheerioAPI): string[] {
  const types = new Set<string>()
  $('[typeof]').each((_index, element) => {
    const active = contextFrom(
      { prefixes: new Map() },
      $(element).closest('[vocab]').attr('vocab'),
    )
    const prefixValue = $(element).closest('[prefix]').attr('prefix')
    if (prefixValue) {
      const pairs = [...prefixValue.matchAll(/([\w-]+):\s+(\S+)/g)]
      for (const pair of pairs) {
        if (pair[1] && pair[2]) active.prefixes.set(pair[1], pair[2])
      }
    }
    for (const value of ($(element).attr('typeof') ?? '').split(/\s+/)) {
      const type = normalizedSchemaType(value, active).type
      if (type) types.add(type)
    }
  })
  return [...types]
}

function usableElementValue($: CheerioAPI, selector: string): boolean {
  return $(selector)
    .toArray()
    .some((element) => {
      const value =
        $(element).attr('content') ??
        $(element).attr('datetime') ??
        $(element).text()
      return value.trim().length > 0
    })
}

export function extractStructuredData(
  $: CheerioAPI,
  baseUrl: string,
): StructuredDataExtraction {
  const parsed = parseJsonLd(
    $('script[type="application/ld+json"]')
      .toArray()
      .map((element) => $(element).html() ?? ''),
    baseUrl,
  )
  const microdata = microdataTypes($)
  const rdfa = rdfaTypes($)
  const schemaTypes = [
    ...new Set([...parsed.schemaTypes, ...microdata, ...rdfa]),
  ]
  const formats: StructuredDataFormat[] = []
  if (parsed.schemaTypes.length) formats.push('json-ld')
  if (microdata.length) formats.push('microdata')
  if (rdfa.length) formats.push('rdfa')
  const googleRichResults = [
    ...parsed.googleRichResults,
    ...microdata.flatMap((schemaType) =>
      unassessedGoogleRichResult({ format: 'microdata', schemaType }),
    ),
    ...rdfa.flatMap((schemaType) =>
      unassessedGoogleRichResult({ format: 'rdfa', schemaType }),
    ),
  ]

  return {
    ...parsed,
    schemaTypes,
    formats,
    googleRichResults,
    hasAuthor:
      parsed.hasAuthor ||
      usableElementValue($, '[itemprop~="author"], [property~="author"]'),
    hasDate:
      parsed.hasDate ||
      $(
        '[itemprop~="datePublished"], [itemprop~="dateModified"], [property~="datePublished"], [property~="dateModified"]',
      )
        .toArray()
        .some((element) =>
          isValidStructuredDate(
            $(element).attr('content') ??
              $(element).attr('datetime') ??
              $(element).text(),
          ),
        ),
  }
}
