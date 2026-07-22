import { SeoError } from '../../errors.js'

export const RESEARCH_IMPORT_COLUMN_KEYS = [
  'keyword',
  'url',
  'position',
  'absolutePosition',
  'searchVolume',
  'keywordDifficulty',
  'cpc',
  'paidCompetition',
  'intent',
  'resultCount',
  'estimatedTraffic',
  'resultType',
  'searchVolumeUpdatedAt',
] as const

export type ResearchImportColumn = (typeof RESEARCH_IMPORT_COLUMN_KEYS)[number]

export type ResearchImportColumns = Partial<
  Record<ResearchImportColumn, string>
>

const RESEARCH_IMPORT_COLUMN_KEY_SET = new Set<string>(
  RESEARCH_IMPORT_COLUMN_KEYS,
)

export function normalizedResearchColumnName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '')
  const percentage = /%|percent/iu.test(value)
  return percentage && !normalized.endsWith('percent')
    ? `${normalized}percent`
    : normalized
}

export function researchImportColumns(
  value: ResearchImportColumns | undefined,
): ResearchImportColumns | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SeoError(
      'INVALID_INPUT',
      'Research columns must map canonical field names to source column names.',
    )
  }

  const result: ResearchImportColumns = {}
  const usedSourceColumns = new Map<string, ResearchImportColumn>()
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (!RESEARCH_IMPORT_COLUMN_KEY_SET.has(rawKey)) {
      throw new SeoError(
        'INVALID_INPUT',
        `Research columns contains unknown canonical field "${rawKey}".`,
      )
    }
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      throw new SeoError(
        'INVALID_INPUT',
        `Research column "${rawKey}" needs a source column name.`,
      )
    }
    const sourceColumn = rawValue.trim()
    if (sourceColumn.length > 500) {
      throw new SeoError(
        'INVALID_INPUT',
        `Research column "${rawKey}" exceeds 500 characters.`,
      )
    }
    const canonical = rawKey as ResearchImportColumn
    const normalizedSource = normalizedResearchColumnName(sourceColumn)
    const existing = usedSourceColumns.get(normalizedSource)
    if (existing) {
      throw new SeoError(
        'INVALID_INPUT',
        `Research columns cannot map "${existing}" and "${canonical}" to the same source column "${sourceColumn}".`,
      )
    }
    usedSourceColumns.set(normalizedSource, canonical)
    result[canonical] = sourceColumn
  }
  return result
}

export function validateResearchImportColumnSources(
  columns: ResearchImportColumns | undefined,
  includedFields: Iterable<string>,
): void {
  if (!columns) return
  const fieldsByNormalizedName = new Map<string, string[]>()
  for (const field of includedFields) {
    const normalized = normalizedResearchColumnName(field)
    const matches = fieldsByNormalizedName.get(normalized) ?? []
    matches.push(field)
    fieldsByNormalizedName.set(normalized, matches)
  }

  for (const [canonical, sourceColumn] of Object.entries(columns)) {
    const matches =
      fieldsByNormalizedName.get(normalizedResearchColumnName(sourceColumn)) ??
      []
    if (matches.length === 0) {
      throw new SeoError(
        'INVALID_INPUT',
        `Research column "${canonical}" points to missing source column "${sourceColumn}".`,
      )
    }
    if (matches.length > 1) {
      throw new SeoError(
        'INVALID_INPUT',
        `Research column "${canonical}" is ambiguous because more than one source column matches "${sourceColumn}".`,
      )
    }
  }
}
