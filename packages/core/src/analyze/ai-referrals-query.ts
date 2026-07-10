import {
  type Ga4ReportRequest,
  ga4ReportQualityWarnings,
  ga4RowsToObjects,
  type runGa4Report,
} from '../ga4/client.js'

const PAGE_SIZE = 25_000

export type AiReferralQueryResult = {
  rows: Array<Record<string, string>>
  calls: number
  returnedRows: number
  availableRows?: number
  timeZone?: string
  emptyReason?: string
  truncated: boolean
  warnings: string[]
}

export async function fetchAiReferralRows(input: {
  property: string
  request: Omit<Ga4ReportRequest, 'limit' | 'offset'>
  maxRows: number
  pageSize?: number
  refresh?: boolean
  label: string
  query: typeof runGa4Report
}): Promise<AiReferralQueryResult> {
  const pageSize = input.pageSize ?? PAGE_SIZE
  if (!Number.isInteger(input.maxRows) || input.maxRows < 1) {
    throw new Error('maxRows must be a positive whole number.')
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE) {
    throw new Error(
      `pageSize must be a whole number between 1 and ${PAGE_SIZE}.`,
    )
  }
  const rows: Array<Record<string, string>> = []
  const warnings = new Set<string>()
  const retainedKeys = new Set<string>()
  const dimensionNames =
    input.request.dimensions?.map((dimension) => dimension.name) ?? []
  let availableRows: number | undefined
  let timeZone: string | undefined
  let emptyReason: string | undefined
  let calls = 0
  let lastPageSize = 0
  let offset = 0
  let forcedTruncation = false

  while (offset < input.maxRows) {
    const limit = Math.min(pageSize, input.maxRows - offset)
    const result = await input.query(
      input.property,
      { ...input.request, limit, offset },
      { refresh: input.refresh },
    )
    calls += 1
    const rawPage = ga4RowsToObjects(result)
    const page = rawPage.slice(0, limit)
    if (rawPage.length > limit) {
      forcedTruncation = true
      warnings.add(`${input.label} returned more rows than requested.`)
    }
    lastPageSize = page.length
    offset += page.length
    for (const row of page) {
      const key = JSON.stringify(dimensionNames.map((name) => row[name] ?? ''))
      if (retainedKeys.has(key)) {
        warnings.add(`${input.label} returned overlapping pagination rows.`)
        continue
      }
      retainedKeys.add(key)
      rows.push(row)
    }
    for (const warning of ga4ReportQualityWarnings(result, input.label)) {
      warnings.add(warning)
    }
    if (
      timeZone !== undefined &&
      result.metadata?.timeZone !== undefined &&
      timeZone !== result.metadata.timeZone
    ) {
      warnings.add(`${input.label} time zone changed during pagination.`)
    }
    timeZone ??= result.metadata?.timeZone
    emptyReason ??= result.metadata?.emptyReason
    if (result.rowCount !== undefined) {
      if (availableRows !== undefined && availableRows !== result.rowCount) {
        warnings.add(`${input.label} rowCount changed during pagination.`)
      }
      availableRows = Math.max(availableRows ?? 0, result.rowCount)
    }
    if (page.length === 0) break
    if (availableRows !== undefined && offset >= availableRows) break
    if (page.length < limit && availableRows === undefined) break
  }

  const truncated =
    forcedTruncation ||
    (availableRows !== undefined && availableRows > offset) ||
    (availableRows === undefined && offset >= input.maxRows && lastPageSize > 0)

  return {
    rows,
    calls,
    returnedRows: rows.length,
    ...(availableRows !== undefined ? { availableRows } : {}),
    ...(timeZone ? { timeZone } : {}),
    ...(emptyReason ? { emptyReason } : {}),
    truncated,
    warnings: [...warnings],
  }
}

export function sessionSourceInListFilter(values: string[]): unknown {
  return {
    filter: {
      fieldName: 'sessionSource',
      inListFilter: {
        values,
        caseSensitive: true,
      },
    },
  }
}
