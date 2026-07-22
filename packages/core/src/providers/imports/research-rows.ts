import { createHash } from 'node:crypto'
import { SeoError } from '../../errors.js'
import type { ImportProgress } from '../../imports/records.js'
import {
  csvRecords,
  csvRow,
  DEFAULT_IMPORT_STREAM_BYTES,
  importFile,
  jsonlRecords,
  readJsonArray,
} from '../../imports/records.js'
import type { ProviderImportEvidence, ProviderValue } from '../contracts.js'
import type {
  RankedKeyword,
  ResearchImportSource,
} from '../domain-contracts.js'

export const DEFAULT_RESEARCH_ROW_LIMIT = 10_000
export const MAX_RESEARCH_ROW_LIMIT = 100_000
const MAX_INCLUDED_FIELDS = 500

type RawRow = Record<string, unknown>

export type ImportedResearchRow = RankedKeyword & {
  domain: string
}

export type ImportedResearchRows = {
  rows: ImportedResearchRow[]
  importEvidence: ProviderImportEvidence
  warnings: Array<{ code: string; message: string; row?: number }>
}

type NormalizedResearchRow =
  | { kind: 'row'; row: ImportedResearchRow }
  | { kind: 'filtered' }
  | { kind: 'invalid' }

const FIELD_ALIASES = {
  keyword: ['keyword', 'query', 'phrase', 'keyworddatakeyword'],
  url: [
    'url',
    'currenturl',
    'rankingurl',
    'targeturl',
    'landingpage',
    'address',
    'rankedserpelementserpitemurl',
  ],
  rankGroup: [
    'position',
    'currentposition',
    'rank',
    'rankgroup',
    'rankedserpelementserpitemrankgroup',
  ],
  rankAbsolute: ['rankabsolute', 'rankedserpelementserpitemrankabsolute'],
  volume: [
    'searchvolume',
    'volume',
    'monthlysearchvolume',
    'nq',
    'keyworddatakeywordinfosearchvolume',
  ],
  difficulty: [
    'keyworddifficulty',
    'keyworddifficultypercent',
    'difficulty',
    'kd',
    'kdpercent',
    'keyworddatakeywordpropertieskeyworddifficulty',
  ],
  cpc: ['cpc', 'cpcusd', 'costperclick', 'keyworddatakeywordinfocpc'],
  competition: [
    'competition',
    'paidcompetition',
    'paidcompetitionpercent',
    'competitionlevel',
    'competitivedensity',
    'competitivedensitypercent',
    'competitionpercent',
    'keyworddatakeywordinfocompetition',
  ],
  intent: [
    'intent',
    'intents',
    'keywordintent',
    'keywordintents',
    'searchintent',
    'keyworddatasearchintentinfomainintent',
  ],
  resultCount: [
    'resultcount',
    'numberofresults',
    'results',
    'keyworddataserpinfoseresultscount',
  ],
  traffic: [
    'traffic',
    'currenttraffic',
    'currentorganictraffic',
    'estimatedtraffic',
    'estimatedmonthlytraffic',
    'etv',
    'rankedserpelementserpitemetv',
  ],
  resultType: [
    'resulttype',
    'type',
    'rankingtype',
    'positiontype',
    'currentpositionkind',
    'rankedserpelementserpitemtype',
  ],
  updatedAt: [
    'searchvolumeupdatedat',
    'searchvolumeupdated',
    'keyworddatakeywordinfolastupdatedtime',
  ],
} as const

const BOOLEAN_INTENT_FIELDS = [
  ['navigational', 'navigational'],
  ['informational', 'informational'],
  ['commercial', 'commercial'],
  ['transactional', 'transactional'],
] as const

export function researchImportRowLimit(value?: number): number {
  const result = value ?? DEFAULT_RESEARCH_ROW_LIMIT
  if (
    !Number.isSafeInteger(result) ||
    result < 1 ||
    result > MAX_RESEARCH_ROW_LIMIT
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `Research import row limit must be between 1 and ${MAX_RESEARCH_ROW_LIMIT}.`,
    )
  }
  return result
}

function exportTimestamp(value: string): string {
  const trimmed = value.trim()
  const isoDate = /^\d{4}-\d{2}-\d{2}$/u.test(trimmed)
  const isoTimestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      trimmed,
    )
  const date = new Date(value)
  if (
    (!isoDate && !isoTimestamp) ||
    Number.isNaN(date.getTime()) ||
    (isoDate && date.toISOString().slice(0, 10) !== trimmed)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Research import exportedAt must be a valid YYYY-MM-DD date or ISO timestamp with a timezone.',
    )
  }
  return date.toISOString()
}

function keyName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '')
  const percentage = /%|percent/iu.test(value)
  return percentage && !normalized.endsWith('percent')
    ? `${normalized}percent`
    : normalized
}

function normalizedRawRow(raw: RawRow): RawRow {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [keyName(key), value]),
  )
}

function field(
  raw: RawRow,
  aliases: readonly string[],
): { present: boolean; value: unknown } {
  for (const alias of aliases) {
    if (Object.hasOwn(raw, alias)) return { present: true, value: raw[alias] }
  }
  return { present: false, value: undefined }
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const result = value.trim()
    return result || null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function numberValue(
  value: unknown,
  percentage: 'fraction' | 'whole' = 'fraction',
): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const percent = trimmed.endsWith('%')
  const suffix = trimmed.match(/([kmb])$/iu)?.[1]?.toLowerCase()
  const cleaned = trimmed
    .replace(/[,$£€%]/gu, '')
    .replace(/[kmb]$/iu, '')
    .trim()
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  const multiplied =
    parsed *
    (suffix === 'k'
      ? 1_000
      : suffix === 'm'
        ? 1_000_000
        : suffix === 'b'
          ? 1_000_000_000
          : 1)
  return percent && percentage === 'fraction' ? multiplied / 100 : multiplied
}

function numberField(input: {
  raw: RawRow
  aliases: readonly string[]
  label: string
  integer?: boolean
  minimum?: number
  maximum?: number
  percentage?: 'fraction' | 'whole'
}): ProviderValue<number> {
  const source = field(input.raw, input.aliases)
  if (!source.present) {
    return {
      state: 'missing',
      value: null,
      reason: `The import does not include ${input.label}.`,
    }
  }
  if (
    source.value === '' ||
    source.value === null ||
    source.value === undefined
  ) {
    return {
      state: 'missing',
      value: null,
      reason: `This imported row does not include ${input.label}.`,
    }
  }
  const parsed = numberValue(source.value, input.percentage)
  const valid =
    parsed !== null &&
    (!input.integer || Number.isSafeInteger(parsed)) &&
    (input.minimum === undefined || parsed >= input.minimum) &&
    (input.maximum === undefined || parsed <= input.maximum)
  return valid
    ? { state: 'observed', value: parsed }
    : {
        state: 'invalid',
        value: null,
        reason: `The imported ${input.label} value is invalid.`,
      }
}

function textField(input: {
  raw: RawRow
  aliases: readonly string[]
  label: string
  maximum?: number
}): ProviderValue<string> {
  const source = field(input.raw, input.aliases)
  if (!source.present) {
    return {
      state: 'missing',
      value: null,
      reason: `The import does not include ${input.label}.`,
    }
  }
  const parsed = textValue(source.value)
  if (!parsed) {
    return {
      state: 'missing',
      value: null,
      reason: `This imported row does not include ${input.label}.`,
    }
  }
  return !input.maximum || parsed.length <= input.maximum
    ? { state: 'observed', value: parsed }
    : {
        state: 'invalid',
        value: null,
        reason: `The imported ${input.label} value is too long.`,
      }
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === 0) return value === 1
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (['true', 'yes', '1'].includes(normalized)) return true
  if (['false', 'no', '0', ''].includes(normalized)) return false
  return null
}

function normalizedIntent(value: string): string {
  const order = new Map<string, number>(
    BOOLEAN_INTENT_FIELDS.map(([intent], index) => [intent, index]),
  )
  return [
    ...new Set(
      value
        .split(/[,;|]/u)
        .map((item) => item.trim().toLowerCase().replace(/\s+/gu, '_'))
        .filter(Boolean),
    ),
  ]
    .sort(
      (left, right) =>
        (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right) ?? Number.MAX_SAFE_INTEGER) ||
        (left < right ? -1 : left > right ? 1 : 0),
    )
    .join(', ')
}

function intentField(raw: RawRow): ProviderValue<string> {
  const explicit = textField({
    raw,
    aliases: FIELD_ALIASES.intent,
    label: 'intent',
    maximum: 100,
  })
  if (explicit.state === 'observed') {
    return { state: 'observed', value: normalizedIntent(explicit.value) }
  }
  if (explicit.state === 'invalid') return explicit

  let present = false
  const intents: string[] = []
  for (const [intent, alias] of BOOLEAN_INTENT_FIELDS) {
    const source = field(raw, [alias])
    if (!source.present) continue
    present = true
    const parsed = booleanValue(source.value)
    if (parsed === null) {
      return {
        state: 'invalid',
        value: null,
        reason: `The imported ${intent} intent flag is invalid.`,
      }
    }
    if (parsed) intents.push(intent)
  }
  if (!present || intents.length === 0) {
    return {
      state: 'missing',
      value: null,
      reason: present
        ? 'This imported row has no observed search intent.'
        : 'The import does not include intent.',
    }
  }
  return { state: 'observed', value: intents.join(', ') }
}

function resultType(raw: RawRow): string {
  const value = requiredText(raw, FIELD_ALIASES.resultType)
  if (!value) return 'organic'
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
  const compact = normalized.replaceAll('_', '')
  if (!normalized || compact === 'organic') return 'organic'
  if (compact.startsWith('paid')) return 'paid'
  if (compact === 'featuredsnippet') return 'featured_snippet'
  if (compact === 'localpack') return 'local_pack'
  if (compact === 'aioverview' || compact === 'aioverviewreference') {
    return 'ai_overview_reference'
  }
  return normalized
}

function dateField(raw: RawRow): ProviderValue<string> {
  const value = textField({
    raw,
    aliases: FIELD_ALIASES.updatedAt,
    label: 'search-volume update date',
    maximum: 100,
  })
  if (value.state !== 'observed') return value
  const date = new Date(value.value)
  return Number.isNaN(date.getTime())
    ? {
        state: 'invalid',
        value: null,
        reason: 'The imported search-volume update date is invalid.',
      }
    : { state: 'observed', value: date.toISOString() }
}

function requiredText(raw: RawRow, aliases: readonly string[]): string | null {
  return textValue(field(raw, aliases).value)
}

function normalizedUrl(value: string): { url: string; domain: string } | null {
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname.includes('.')
    ) {
      return null
    }
    url.hash = ''
    return {
      url: url.toString(),
      domain: url.hostname
        .toLowerCase()
        .replace(/^www\./u, '')
        .replace(/\.$/u, ''),
    }
  } catch {
    return null
  }
}

function normalizeRow(rawValue: RawRow): NormalizedResearchRow {
  const raw = normalizedRawRow(rawValue)
  const keyword = requiredText(raw, FIELD_ALIASES.keyword)
  const rawUrl = requiredText(raw, FIELD_ALIASES.url)
  const importedRankGroup = numberValue(
    field(raw, FIELD_ALIASES.rankGroup).value,
  )
  const importedRankAbsolute = numberValue(
    field(raw, FIELD_ALIASES.rankAbsolute).value,
  )
  const rankGroup = importedRankGroup ?? importedRankAbsolute ?? 0
  const rankAbsolute = importedRankAbsolute ?? importedRankGroup ?? 0
  const target = rawUrl ? normalizedUrl(rawUrl) : null
  const currentPosition = field(raw, ['currentposition'])
  const currentUrl = field(raw, ['currenturl'])
  const previousPosition = field(raw, ['previousposition'])
  const previousUrl = field(raw, ['previousurl'])
  if (
    currentPosition.present &&
    currentUrl.present &&
    !textValue(currentPosition.value) &&
    !textValue(currentUrl.value) &&
    (textValue(previousPosition.value) || textValue(previousUrl.value))
  ) {
    return { kind: 'filtered' }
  }
  if (
    !keyword ||
    keyword.length > 500 ||
    !target ||
    target.url.length > 2_048 ||
    !Number.isSafeInteger(rankGroup) ||
    rankGroup < 1 ||
    rankGroup > 1_000 ||
    !Number.isSafeInteger(rankAbsolute) ||
    rankAbsolute < 1 ||
    rankAbsolute > 1_000
  ) {
    return { kind: 'invalid' }
  }
  return {
    kind: 'row',
    row: {
      domain: target.domain,
      keyword: keyword.trim().replace(/\s+/gu, ' '),
      url: target.url,
      rankGroup,
      rankAbsolute,
      resultType: resultType(raw),
      monthlySearchVolume: numberField({
        raw,
        aliases: FIELD_ALIASES.volume,
        label: 'monthly search volume',
        integer: true,
        minimum: 0,
      }),
      monthlySearches: {
        state: 'missing',
        value: null,
        reason: 'Ranked-keyword exports do not include typed monthly history.',
      },
      searchVolumeUpdatedAt: dateField(raw),
      cpcUsd: numberField({
        raw,
        aliases: FIELD_ALIASES.cpc,
        label: 'CPC',
        minimum: 0,
      }),
      paidCompetition: numberField({
        raw,
        aliases: FIELD_ALIASES.competition,
        label: 'paid competition',
        minimum: 0,
        maximum: 1,
      }),
      keywordDifficulty: numberField({
        raw,
        aliases: FIELD_ALIASES.difficulty,
        label: 'keyword difficulty',
        minimum: 0,
        maximum: 100,
        percentage: 'whole',
      }),
      intent: intentField(raw),
      resultCount: numberField({
        raw,
        aliases: FIELD_ALIASES.resultCount,
        label: 'result count',
        integer: true,
        minimum: 0,
      }),
      estimatedMonthlyTraffic: numberField({
        raw,
        aliases: FIELD_ALIASES.traffic,
        label: 'estimated monthly traffic',
        minimum: 0,
      }),
    },
  }
}

export function compareImportedResearchRows(
  left: ImportedResearchRow,
  right: ImportedResearchRow,
): number {
  return (
    left.rankAbsolute - right.rankAbsolute ||
    compareText(left.keyword, right.keyword) ||
    compareText(left.url, right.url) ||
    compareText(left.domain, right.domain) ||
    compareText(JSON.stringify(left), JSON.stringify(right))
  )
}

export function importedResearchRowKey(row: ImportedResearchRow): string {
  return `${row.domain}\u0000${row.keyword.toLowerCase()}\u0000${row.url}\u0000${row.resultType}`
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export async function importResearchRows(
  source: ResearchImportSource,
  now = new Date(),
): Promise<ImportedResearchRows> {
  const limit = researchImportRowLimit(source.rowLimit)
  const exportedAt = exportTimestamp(source.exportedAt)
  const file = await importFile({
    file: source.file,
    format: source.format,
    label: 'Research',
  })
  const hash = createHash('sha256')
  const progress: ImportProgress = {
    bytesRead: 0,
    hash,
  }
  const fields = new Set<string>()
  const rowsByKey = new Map<string, ImportedResearchRow>()
  let suppliedRows = 0
  let sourceRows = 0
  let filteredRows = 0
  let invalidRows = 0
  let duplicateRows = 0
  let omittedFieldNames = false

  const collectFields = (raw: RawRow) => {
    for (const name of Object.keys(raw)) {
      if (fields.size >= MAX_INCLUDED_FIELDS && !fields.has(name)) {
        omittedFieldNames = true
        continue
      }
      fields.add(name)
    }
  }
  const consume = (raw: RawRow, structurallyValid = true) => {
    sourceRows += 1
    collectFields(raw)
    if (suppliedRows >= limit) return
    suppliedRows += 1
    if (!structurallyValid || Object.keys(raw).length > MAX_INCLUDED_FIELDS) {
      invalidRows += 1
      return
    }
    const normalized = normalizeRow(raw)
    if (normalized.kind === 'filtered') {
      filteredRows += 1
      return
    }
    if (normalized.kind === 'invalid') {
      invalidRows += 1
      return
    }
    const { row } = normalized
    const key = importedResearchRowKey(row)
    const existing = rowsByKey.get(key)
    if (existing) {
      duplicateRows += 1
      if (compareImportedResearchRows(row, existing) < 0) {
        rowsByKey.set(key, row)
      }
      return
    }
    rowsByKey.set(key, row)
  }

  if (file.format === 'csv') {
    const records = csvRecords({
      path: file.path,
      byteLimit: DEFAULT_IMPORT_STREAM_BYTES,
      progress,
      label: 'Research',
    })
    const first = await records.next()
    const headers = Array.isArray(first.value)
      ? first.value.map((value, index) =>
          (index === 0 ? value.replace(/^\uFEFF/u, '') : value).trim(),
        )
      : []
    if (
      headers.length === 0 ||
      headers.length > MAX_INCLUDED_FIELDS ||
      headers.some((header) => !header) ||
      new Set(headers.map(keyName)).size !== headers.length
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        'Research CSV needs a non-empty header row with unique column names.',
      )
    }
    headers.forEach((header) => {
      fields.add(header)
    })
    for await (const values of records) {
      consume(csvRow(headers, values), values.length === headers.length)
    }
  } else if (file.format === 'jsonl') {
    const records = jsonlRecords({
      path: file.path,
      byteLimit: DEFAULT_IMPORT_STREAM_BYTES,
      progress,
      label: 'Research',
      onInvalidLine: () => {
        consume({}, false)
      },
    })
    for await (const raw of records) consume(raw)
  } else {
    const records = await readJsonArray({
      path: file.path,
      progress,
      label: 'Research',
    })
    for (const raw of records) {
      consume(
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as RawRow)
          : {},
        Boolean(raw && typeof raw === 'object' && !Array.isArray(raw)),
      )
    }
  }

  const rows = [...rowsByKey.values()].sort(compareImportedResearchRows)
  const capped = sourceRows > limit
  if (
    sourceRows > 0 &&
    rows.length === 0 &&
    filteredRows === 0 &&
    invalidRows > 0
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Research import contained no valid ranked-keyword rows. Check that it includes a keyword, an absolute HTTP URL, and a current position.',
    )
  }
  const warnings: ImportedResearchRows['warnings'] = []
  if (invalidRows > 0) {
    warnings.push({
      code: 'invalid-import-rows',
      message: `${invalidRows} imported row${invalidRows === 1 ? '' : 's'} lacked a valid keyword, absolute HTTP URL, or position.`,
    })
  }
  if (filteredRows > 0) {
    warnings.push({
      code: 'historical-import-rows',
      message: `${filteredRows} imported comparison row${filteredRows === 1 ? '' : 's'} had no current ranking and ${filteredRows === 1 ? 'was' : 'were'} excluded.`,
    })
  }
  if (duplicateRows > 0) {
    warnings.push({
      code: 'duplicate-import-rows',
      message: `${duplicateRows} duplicate imported row${duplicateRows === 1 ? '' : 's'} were removed deterministically.`,
    })
  }
  if (capped) {
    warnings.push({
      code: 'import-row-cap',
      message: `Only the first ${limit} of ${sourceRows} file rows were normalized.`,
    })
  }
  if (omittedFieldNames) {
    warnings.push({
      code: 'import-field-cap',
      message: `Included field names were capped at ${MAX_INCLUDED_FIELDS}.`,
    })
  }
  const normalizedFields = new Set([...fields].map(keyName))
  if (
    rows.length > 0 &&
    !FIELD_ALIASES.resultType.some((alias) => normalizedFields.has(alias))
  ) {
    warnings.push({
      code: 'organic-result-type-default',
      message:
        'Rows without a result-type field are treated as organic ranked-keyword export rows.',
    })
  }

  return {
    rows,
    importEvidence: {
      provider: source.provider,
      path: file.path,
      format: file.format,
      encoding: progress.encoding ?? 'utf-8',
      delimiter: progress.delimiter ?? null,
      sha256: hash.digest('hex'),
      exportedAt,
      importedAt: now.toISOString(),
      includedFields: [...fields].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
      fileBytes: file.fileBytes,
      bytesRead: progress.bytesRead,
      fileRows: sourceRows,
      suppliedRows,
      validRows: rows.length,
      filteredRows,
      invalidRows,
      duplicateRows,
      capped,
      rowLimit: limit,
    },
    warnings,
  }
}
