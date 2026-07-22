import { randomUUID } from 'node:crypto'
import type {
  MarketIndependentProviderEvidence,
  ProviderCoverage,
  ProviderValue,
  ProviderWarning,
} from '../contracts.js'
import { observedValue, unavailableValue } from '../contracts.js'
import { ProviderError } from '../errors.js'
import type {
  LinkSummaryRequest,
  LinkTargetScope,
  ProviderLinkMetric,
} from '../link-contracts.js'
import type {
  DataForSeoBacklinksSnapshot,
  DataForSeoLinkSummarySnapshot,
  DataForSeoReferringDomainsSnapshot,
} from './client-types.js'
import { compareCodepoints } from './keyword-mapping.js'
import {
  LINK_ENDPOINTS,
  MAX_LINK_OFFSET,
  MAX_LINK_ROWS,
} from './link-client.js'

export { LINK_ENDPOINTS, MAX_LINK_OFFSET, MAX_LINK_ROWS }

export function linkTarget(
  value: string,
  requestedScope: LinkTargetScope = 'domain',
): { target: string; scope: LinkTargetScope } {
  const raw = value.trim()
  if (!raw || raw.length > 2_048) throw invalidTarget()

  if (requestedScope === 'page') {
    try {
      const url = new URL(raw)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error()
      }
      url.hash = ''
      return { target: url.toString(), scope: 'page' }
    } catch {
      throw invalidTarget()
    }
  }

  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^www\./u, '')
      .replace(/\.$/u, '')
    if (
      !hostname ||
      hostname.length > 253 ||
      hostname.includes('..') ||
      !hostname.includes('.') ||
      !/^[a-z0-9.-]+$/u.test(hostname)
    ) {
      throw new Error()
    }
    return { target: hostname, scope: 'domain' }
  } catch {
    throw invalidTarget()
  }
}

function invalidTarget(): ProviderError {
  return new ProviderError({
    provider: 'dataforseo',
    operation: 'link-evidence',
    code: 'configuration',
    message:
      'Use a valid domain, or choose page scope and pass an absolute URL.',
  })
}

export function linkRowLimit(limit: number, offset = 0): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LINK_ROWS) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'link-evidence',
      code: 'configuration',
      message: `Link row limit must be from 1 to ${MAX_LINK_ROWS}.`,
    })
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_LINK_OFFSET) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'link-evidence',
      code: 'configuration',
      message: `Link row offset must be from 0 to ${MAX_LINK_OFFSET}.`,
    })
  }
}

export function requestContext(
  reportId: string,
  supplied: LinkSummaryRequest['context'],
) {
  return supplied ?? { reportId, reportRunId: randomUUID() }
}

export function missing<T>(field: string): ProviderValue<T> {
  return unavailableValue('missing', `DataForSEO omitted ${field}.`)
}

export function numberValue(
  value: number | null | undefined,
  field: string,
): ProviderValue<number> {
  return value === null || value === undefined
    ? missing(field)
    : observedValue(value)
}

export function stringValue(
  value: string | null | undefined,
  field: string,
): ProviderValue<string> {
  return value ? observedValue(value) : missing(field)
}

export function metric(
  id: string,
  label: string,
  value: number | null | undefined,
): ProviderLinkMetric[] {
  return value === null || value === undefined
    ? []
    : [
        {
          provider: 'dataforseo',
          id,
          label,
          value,
          scale: { minimum: 0, maximum: 100 },
        },
      ]
}

export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.username = ''
    url.password = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function normalizedDate(
  value: string | null | undefined,
): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

export function uniqueSorted(values: string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    compareCodepoints,
  )
}

export function totalRows(
  values: Array<number | null | undefined>,
): number | null {
  const present = values.filter(
    (value): value is number => value !== null && value !== undefined,
  )
  return present.length ? Math.max(...present) : null
}

export function linkCoverage(input: {
  requestedRows: number
  returnedRows: number
  retainedRows: number
  invalidRows: number
  providerTotalRows: number | null
  offset: number
  filtered: boolean
  providerTotalComparable?: boolean
}): ProviderCoverage {
  const hasMore =
    input.providerTotalComparable !== false && input.providerTotalRows !== null
      ? input.offset + input.returnedRows < input.providerTotalRows
      : input.returnedRows >= input.requestedRows
  return {
    requestedRows: input.requestedRows,
    returnedRows: input.returnedRows,
    retainedRows: input.retainedRows,
    invalidRows: input.invalidRows,
    providerTotalRows: input.providerTotalRows,
    completeness:
      input.invalidRows > 0
        ? 'partial'
        : hasMore
          ? 'capped'
          : input.filtered
            ? 'filtered'
            : 'complete',
    nextCursor: hasMore ? String(input.offset + input.returnedRows) : null,
  }
}

type LinkSnapshot =
  | DataForSeoLinkSummarySnapshot
  | DataForSeoBacklinksSnapshot
  | DataForSeoReferringDomainsSnapshot

export function linkEvidence<T>(input: {
  capability: 'link-summary' | 'backlinks' | 'referring-domains'
  data: T
  snapshot: LinkSnapshot
  coverage: ProviderCoverage
  endpoint: string
  limit: number
  filters: Record<string, string | number | boolean>
  sort: string[]
  warnings: ProviderWarning[]
}): MarketIndependentProviderEvidence<T> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: input.capability,
    data: input.data,
    observedAt: input.snapshot.observedAt,
    market: null,
    coverage: input.coverage,
    cache: input.snapshot.cache,
    cost: input.snapshot.cost,
    request: {
      operation: input.capability,
      endpoint: input.endpoint,
      limit: input.limit,
      filters: input.filters,
      sort: input.sort,
    },
    warnings: input.warnings,
  }
}

export function mappingWarnings(input: {
  snapshotWarnings: ProviderWarning[]
  invalidRows: number
  duplicateRows?: number
  label: string
}): ProviderWarning[] {
  return [
    ...input.snapshotWarnings,
    ...(input.invalidRows
      ? [
          {
            code: `invalid-${input.label}-rows`,
            field: 'data.rows',
            message: `${input.invalidRows} ${input.label} row${input.invalidRows === 1 ? '' : 's'} lacked required fields and were omitted.`,
          },
        ]
      : []),
    ...(input.duplicateRows
      ? [
          {
            code: `duplicate-${input.label}-rows`,
            field: 'data.rows',
            message: `${input.duplicateRows} duplicate ${input.label} row${input.duplicateRows === 1 ? '' : 's'} were collapsed deterministically.`,
          },
        ]
      : []),
  ]
}
