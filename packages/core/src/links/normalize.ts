import type { LinkEvidenceRow } from './types.js'

export type RawLinkEvidenceRow = Record<string, unknown>

const FIELD_ALIASES = {
  sourceUrl: [
    'sourceurl',
    'source',
    'referringurl',
    'referringpage',
    'fromurl',
  ],
  targetUrl: ['targeturl', 'target', 'destinationurl', 'destination', 'tourl'],
  anchorText: ['anchortext', 'anchor'],
  firstSeenAt: ['firstseenat', 'firstseen'],
  lastSeenAt: ['lastseenat', 'lastseen'],
  nofollow: ['nofollow', 'isnofollow'],
} as const

function key(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
}

function valueFor(
  row: RawLinkEvidenceRow,
  field: keyof typeof FIELD_ALIASES,
): unknown {
  const aliases = new Set(FIELD_ALIASES[field])
  for (const [name, value] of Object.entries(row)) {
    if (aliases.has(key(name) as never)) return value
  }
  return undefined
}

function httpUrl(value: unknown): URL | undefined {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > 2_000
  ) {
    return undefined
  }
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url
      : undefined
  } catch {
    return undefined
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 1_000)
    : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  if (/^(true|yes|1)$/i.test(value.trim())) return true
  if (/^(false|no|0)$/i.test(value.trim())) return false
  return undefined
}

export function normalizeLinkEvidenceRow(
  raw: RawLinkEvidenceRow,
): LinkEvidenceRow | undefined {
  const source = httpUrl(valueFor(raw, 'sourceUrl'))
  const target = httpUrl(valueFor(raw, 'targetUrl'))
  if (!source || !target) return undefined

  return {
    sourceUrl: source.toString(),
    sourceDomain: source.hostname.toLowerCase(),
    targetUrl: target.toString(),
    anchorText: optionalString(valueFor(raw, 'anchorText')),
    firstSeenAt: optionalString(valueFor(raw, 'firstSeenAt')),
    lastSeenAt: optionalString(valueFor(raw, 'lastSeenAt')),
    nofollow: optionalBoolean(valueFor(raw, 'nofollow')),
  }
}

export function linkEvidenceKey(row: LinkEvidenceRow): string {
  return `${row.sourceUrl}\u0000${row.targetUrl}\u0000${row.anchorText ?? ''}`
}

export function compareLinkEvidence(
  a: LinkEvidenceRow,
  b: LinkEvidenceRow,
): number {
  return (
    a.targetUrl.localeCompare(b.targetUrl, 'en') ||
    a.sourceUrl.localeCompare(b.sourceUrl, 'en') ||
    (a.anchorText ?? '').localeCompare(b.anchorText ?? '', 'en')
  )
}
