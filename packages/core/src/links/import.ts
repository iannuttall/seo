import { SeoError } from '../errors.js'
import {
  csvRecords,
  csvRow,
  importFile,
  jsonlRecords,
  readJsonArray,
  type StructuredImportFormat,
} from '../imports/records.js'
import {
  compareLinkEvidence,
  linkEvidenceKey,
  normalizeLinkEvidenceRow,
  type RawLinkEvidenceRow,
} from './normalize.js'
import type { CollectedLinkEvidence, LinkEvidenceRow } from './types.js'

const DEFAULT_ROW_LIMIT = 10_000
const MAX_ROW_LIMIT = 100_000
const MAX_STREAM_BYTES = 50_000_000
const MAX_JSON_BYTES = 10_000_000

function boundedRowLimit(value?: number): number {
  const limit = value ?? DEFAULT_ROW_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROW_LIMIT) {
    throw new SeoError(
      'INVALID_INPUT',
      `Link import row limit must be between 1 and ${MAX_ROW_LIMIT}.`,
    )
  }
  return limit
}

export async function importLinkEvidence(input: {
  file: string
  format?: StructuredImportFormat
  rowLimit?: number
}): Promise<CollectedLinkEvidence> {
  const file = await importFile({
    file: input.file,
    format: input.format,
    label: 'Link',
    maxStreamBytes: MAX_STREAM_BYTES,
    maxJsonBytes: MAX_JSON_BYTES,
  })
  const { format, path } = file
  const rowLimit = boundedRowLimit(input.rowLimit)

  const progress = { bytesRead: 0 }
  let records: AsyncIterable<RawLinkEvidenceRow>
  if (format === 'csv') {
    const csv = csvRecords({
      path,
      byteLimit: MAX_STREAM_BYTES,
      progress,
      label: 'Link',
    })
    const first = await csv.next()
    const headerRow = Array.isArray(first.value) ? first.value : []
    const headers = headerRow.map((value, index) =>
      index === 0 ? value.replace(/^\uFEFF/, '') : value,
    )
    if (!headers.length) {
      throw new SeoError('INVALID_INPUT', 'Link CSV has no header row.')
    }
    records = (async function* () {
      for await (const values of csv) {
        yield csvRow(headers, values) as RawLinkEvidenceRow
      }
    })()
  } else if (format === 'jsonl') {
    records = jsonlRecords({
      path,
      byteLimit: MAX_STREAM_BYTES,
      progress,
      label: 'Link',
    }) as AsyncIterable<RawLinkEvidenceRow>
  } else {
    const parsed = await readJsonArray({ path, progress, label: 'Link' })
    records = (async function* () {
      for (const row of parsed) {
        yield row && typeof row === 'object' && !Array.isArray(row)
          ? (row as RawLinkEvidenceRow)
          : {}
      }
    })()
  }

  const rows: LinkEvidenceRow[] = []
  const keys = new Set<string>()
  let suppliedRows = 0
  let invalidRows = 0
  let duplicateRows = 0
  let capped = false
  for await (const raw of records) {
    if (suppliedRows >= rowLimit) {
      capped = true
      break
    }
    suppliedRows += 1
    const row = normalizeLinkEvidenceRow(raw)
    if (!row) {
      invalidRows += 1
      continue
    }
    const key = linkEvidenceKey(row)
    if (keys.has(key)) {
      duplicateRows += 1
      continue
    }
    keys.add(key)
    rows.push(row)
  }
  rows.sort(compareLinkEvidence)

  const observedAt = new Date().toISOString()
  return {
    rows,
    targetCounts: [],
    provenance: {
      provider: `${format}-import`,
      observedAt,
      cached: false,
      suppliedRows,
      validRows: rows.length,
      invalidRows,
      duplicateRows,
      capped,
      rowLimit,
      completeness: capped ? 'partial' : 'unknown',
      file: {
        path,
        format,
        bytesRead: progress.bytesRead,
        fileBytes: file.fileBytes,
      },
    },
    warnings: capped
      ? [`Import stopped after ${rowLimit} rows. The file contains more data.`]
      : [],
  }
}
