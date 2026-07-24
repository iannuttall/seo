import type {
  KeywordMetric,
  ProviderValue,
  ProviderWarning,
} from '../contracts.js'
import { observedValue, unavailableValue } from '../contracts.js'
import { ProviderError } from '../errors.js'
import type { SemrushCsvTable } from './csv.js'

export type SemrushColumn =
  | 'Co'
  | 'Cp'
  | 'Dn'
  | 'In'
  | 'Kd'
  | 'Nq'
  | 'Nr'
  | 'Oc'
  | 'Or'
  | 'Ot'
  | 'Pc'
  | 'Ph'
  | 'Po'
  | 'Pt'
  | 'Tg'
  | 'Tr'
  | 'Ts'
  | 'Ur'

export type SemrushRecord = Partial<Record<SemrushColumn, string>>

const HEADERS: Record<SemrushColumn, readonly string[]> = {
  Co: ['Co', 'Competition'],
  Cp: ['Cp', 'CPC'],
  Dn: ['Dn', 'Domain'],
  In: ['In', 'Intent', 'Intents'],
  Kd: ['Kd', 'Keyword Difficulty Index', 'Keyword Difficulty'],
  Nq: ['Nq', 'Search Volume'],
  Nr: ['Nr', 'Number of Results'],
  Oc: ['Oc', 'Organic Cost'],
  Or: ['Or', 'Organic Keywords'],
  Ot: ['Ot', 'Organic Traffic'],
  Pc: ['Pc', 'Number of Keywords'],
  Ph: ['Ph', 'Keyword'],
  Po: ['Po', 'Position'],
  Pt: ['Pt', 'Position Type', 'Position type'],
  Tg: ['Tg', 'Traffic'],
  Tr: ['Tr', 'Traffic (%)'],
  Ts: ['Ts', 'Timestamp'],
  Ur: ['Ur', 'Url', 'URL'],
}

function invalidResponse(message: string): ProviderError {
  return new ProviderError({
    provider: 'semrush',
    operation: 'mapping',
    code: 'invalid-response',
    message,
  })
}

export function semrushRecords(
  table: SemrushCsvTable,
  columns: readonly SemrushColumn[],
): SemrushRecord[] {
  if (
    table.headers.length !== columns.length ||
    table.headers.some(
      (header, index) =>
        !HEADERS[columns[index] as SemrushColumn].includes(header),
    )
  ) {
    throw invalidResponse(
      'Semrush returned CSV columns that do not match the requested report.',
    )
  }
  return table.rows.map((row) =>
    Object.fromEntries(
      columns.map((column, index) => [column, row[index] as string]),
    ),
  )
}

export function normalizedKeyword(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase()
}

export function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function missing<T>(field: string): ProviderValue<T> {
  return unavailableValue('missing', `Semrush omitted ${field}.`)
}

function numericValue(
  values: Array<string | undefined>,
  field: string,
  valid: (value: number) => boolean,
): ProviderValue<number> {
  const present = values.filter(
    (value): value is string => value !== undefined && value.trim() !== '',
  )
  if (!present.length) return missing(field)
  const parsed = present.map(Number)
  if (parsed.some((value) => !Number.isFinite(value) || !valid(value))) {
    return unavailableValue('invalid', `Semrush returned an invalid ${field}.`)
  }
  const unique = [...new Set(parsed)]
  return unique.length === 1
    ? observedValue(unique[0] as number)
    : unavailableValue(
        'invalid',
        `Semrush returned conflicting ${field} values.`,
      )
}

export function semrushNumber(
  value: string | undefined,
  field: string,
  valid: (value: number) => boolean,
): ProviderValue<number> {
  return numericValue([value], field, valid)
}

function timestampValue(
  values: Array<string | undefined>,
): ProviderValue<string> {
  const present = values.filter(
    (value): value is string => value !== undefined && value.trim() !== '',
  )
  if (!present.length) return missing('searchVolumeUpdatedAt')
  const normalized = present.flatMap((value) => {
    const number = Number(value)
    const timestamp = Number.isFinite(number)
      ? number < 10_000_000_000
        ? number * 1_000
        : number
      : Date.parse(value)
    return Number.isFinite(timestamp) ? [new Date(timestamp).toISOString()] : []
  })
  if (normalized.length !== present.length) {
    return unavailableValue(
      'invalid',
      'Semrush returned an invalid searchVolumeUpdatedAt.',
    )
  }
  const unique = [...new Set(normalized)]
  return unique.length === 1
    ? observedValue(unique[0] as string)
    : unavailableValue(
        'invalid',
        'Semrush returned conflicting searchVolumeUpdatedAt values.',
      )
}

function intentValue(values: Array<string | undefined>): ProviderValue<string> {
  const labels: Record<string, string> = {
    '0': 'commercial',
    '1': 'informational',
    '2': 'navigational',
    '3': 'transactional',
  }
  const present = values.filter(
    (value): value is string => value !== undefined && value.trim() !== '',
  )
  if (!present.length) return missing('intent')
  const normalized = present.map(
    (value) => labels[value.trim()] ?? value.trim().toLowerCase(),
  )
  if (normalized.some((value) => !value || value.length > 100)) {
    return unavailableValue('invalid', 'Semrush returned an invalid intent.')
  }
  const unique = [...new Set(normalized)]
  return unique.length === 1
    ? observedValue(unique[0] as string)
    : unavailableValue('invalid', 'Semrush returned conflicting intent values.')
}

export function semrushMetric(
  keyword: string,
  rows: SemrushRecord[],
): KeywordMetric {
  return {
    keyword,
    monthlySearchVolume: numericValue(
      rows.map((row) => row.Nq),
      'monthlySearchVolume',
      (value) => Number.isSafeInteger(value) && value >= 0,
    ),
    monthlySearches: unavailableValue(
      'unavailable',
      'This Semrush V3 report does not return monthly search history.',
    ),
    searchVolumeUpdatedAt: timestampValue(rows.map((row) => row.Ts)),
    cpcUsd: numericValue(
      rows.map((row) => row.Cp),
      'cpcUsd',
      (value) => value >= 0,
    ),
    paidCompetition: numericValue(
      rows.map((row) => row.Co),
      'paidCompetition',
      (value) => value >= 0 && value <= 1,
    ),
    keywordDifficulty: numericValue(
      rows.map((row) => row.Kd),
      'keywordDifficulty',
      (value) => value >= 0 && value <= 100,
    ),
    intent: intentValue(rows.map((row) => row.In)),
    resultCount: numericValue(
      rows.map((row) => row.Nr),
      'resultCount',
      (value) => Number.isSafeInteger(value) && value >= 0,
    ),
  }
}

export function invalidRowsWarning(
  count: number,
  label: string,
): ProviderWarning[] {
  return count
    ? [
        {
          code: `invalid-${label}-rows`,
          field: 'data.rows',
          message: `Semrush returned ${count} ${label} row${count === 1 ? '' : 's'} without the required fields.`,
        },
      ]
    : []
}
