import type { CheerioAPI } from 'cheerio'

export type CanonicalSource = 'html-head' | 'html-body' | 'http-header'

export type CanonicalCandidate = {
  source: CanonicalSource
  raw: string
  resolved?: string
  ignoredReason?:
    | 'outside-head'
    | 'alternate-qualifier'
    | 'fragment'
    | 'invalid-url'
    | 'non-http-url'
}

export type CanonicalEvidence = {
  status:
    | 'missing'
    | 'single'
    | 'duplicate'
    | 'conflicting'
    | 'outside-head-only'
    | 'invalid'
  selectedRaw?: string
  selectedUrl?: string
  candidates: CanonicalCandidate[]
}

function headerValue(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase()
  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === lower,
  )?.[1]
}

function resolvedCandidate(
  source: CanonicalSource,
  raw: string,
  baseUrl: string,
  ignoredReason?: CanonicalCandidate['ignoredReason'],
): CanonicalCandidate {
  if (!raw) return { source, raw, ignoredReason: 'invalid-url' }
  try {
    const url = new URL(raw, baseUrl)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { source, raw, ignoredReason: 'non-http-url' }
    }
    if (url.hash) {
      return {
        source,
        raw,
        resolved: url.toString(),
        ignoredReason: 'fragment',
      }
    }
    return {
      source,
      raw,
      resolved: url.toString(),
      ...(ignoredReason ? { ignoredReason } : {}),
    }
  } catch {
    return { source, raw, ignoredReason: 'invalid-url' }
  }
}

function htmlCandidates($: CheerioAPI, baseUrl: string): CanonicalCandidate[] {
  const candidates: CanonicalCandidate[] = []
  $('link[rel]').each((_index, element) => {
    const rel = ($(element).attr('rel') ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    if (!rel.includes('canonical')) return
    const raw = ($(element).attr('href') ?? '').trim()
    const source: CanonicalSource = $(element).closest('head').length
      ? 'html-head'
      : 'html-body'
    const alternateQualifier = ['hreflang', 'lang', 'media', 'type'].some(
      (attribute) => $(element).attr(attribute) !== undefined,
    )
    candidates.push(
      resolvedCandidate(
        source,
        raw,
        baseUrl,
        source === 'html-body'
          ? 'outside-head'
          : alternateQualifier
            ? 'alternate-qualifier'
            : undefined,
      ),
    )
  })
  return candidates
}

function splitLinkHeader(value: string): string[] {
  const parts: string[] = []
  let start = 0
  let angle = false
  let quote: string | undefined
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quote) {
      if (character === quote && value[index - 1] !== '\\') quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '<') angle = true
    else if (character === '>') angle = false
    else if (character === ',' && !angle) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

function parameter(value: string, name: string): string | undefined {
  const expression = new RegExp(
    `(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^;\\s]+))`,
    'i',
  )
  const match = value.match(expression)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

function headerCandidates(
  headers: Record<string, string>,
  baseUrl: string,
): CanonicalCandidate[] {
  const link = headerValue(headers, 'link')
  if (!link) return []
  const candidates: CanonicalCandidate[] = []
  for (const item of splitLinkHeader(link)) {
    const match = item.match(/^\s*<([^>]*)>(.*)$/s)
    if (!match?.[1]) continue
    const rel = parameter(match[2] ?? '', 'rel')
      ?.toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    if (!rel?.includes('canonical')) continue
    const alternateQualifier = ['hreflang', 'lang', 'media', 'type'].some(
      (name) => parameter(match[2] ?? '', name) !== undefined,
    )
    candidates.push(
      resolvedCandidate(
        'http-header',
        match[1],
        baseUrl,
        alternateQualifier ? 'alternate-qualifier' : undefined,
      ),
    )
  }
  return candidates
}

function normalizedUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  return url.toString()
}

function evidenceFromCandidates(
  candidates: CanonicalCandidate[],
): CanonicalEvidence {
  const eligible = candidates.filter(
    (candidate) => candidate.resolved && !candidate.ignoredReason,
  )
  const distinct = [
    ...new Set(
      eligible.map((candidate) => normalizedUrl(candidate.resolved ?? '')),
    ),
  ]
  if (distinct.length > 1) {
    return { status: 'conflicting', candidates }
  }
  if (distinct.length === 1) {
    const selected = eligible[0]
    return {
      status: eligible.length > 1 ? 'duplicate' : 'single',
      selectedRaw: selected?.raw,
      selectedUrl: selected?.resolved,
      candidates,
    }
  }
  if (candidates.some((candidate) => candidate.source === 'html-body')) {
    return { status: 'outside-head-only', candidates }
  }
  if (candidates.length) return { status: 'invalid', candidates }
  return { status: 'missing', candidates }
}

export function extractHttpCanonicalEvidence(
  headers: Record<string, string>,
  baseUrl: string,
): CanonicalEvidence {
  return evidenceFromCandidates(headerCandidates(headers, baseUrl))
}

export function extractCanonicalEvidence(
  $: CheerioAPI,
  headers: Record<string, string>,
  baseUrl: string,
): CanonicalEvidence {
  return evidenceFromCandidates([
    ...htmlCandidates($, baseUrl),
    ...headerCandidates(headers, baseUrl),
  ])
}
