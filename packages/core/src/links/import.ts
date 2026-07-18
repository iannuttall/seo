import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { SeoError } from '../errors.js'
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
const MAX_CELL_BYTES = 1_000_000

type ImportFormat = 'csv' | 'json' | 'jsonl'

function formatFor(path: string, explicit?: ImportFormat): ImportFormat {
  if (explicit) return explicit
  const extension = extname(path).toLowerCase()
  if (extension === '.csv') return 'csv'
  if (extension === '.jsonl' || extension === '.ndjson') return 'jsonl'
  if (extension === '.json') return 'json'
  throw new SeoError(
    'INVALID_INPUT',
    'Link imports must be CSV, JSON, JSONL, or NDJSON.',
  )
}

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

async function* csvRecords(
  path: string,
  byteLimit: number,
  progress: { bytesRead: number },
): AsyncGenerator<string[]> {
  const stream = createReadStream(path, { encoding: 'utf8' })
  let record: string[] = []
  let field = ''
  let quoted = false
  let pendingQuote = false

  for await (const chunk of stream) {
    progress.bytesRead += Buffer.byteLength(chunk)
    if (progress.bytesRead > byteLimit) {
      stream.destroy()
      throw new SeoError(
        'INVALID_INPUT',
        `Link import exceeds the ${byteLimit}-byte streaming limit.`,
      )
    }
    for (const character of chunk) {
      if (pendingQuote) {
        if (character === '"') {
          field += '"'
          pendingQuote = false
          continue
        }
        quoted = false
        pendingQuote = false
      }
      if (quoted) {
        if (character === '"') pendingQuote = true
        else field += character
      } else if (character === '"' && field.length === 0) {
        quoted = true
      } else if (character === ',') {
        record.push(field)
        field = ''
      } else if (character === '\n') {
        record.push(field.replace(/\r$/, ''))
        field = ''
        if (record.some((value) => value.length > 0)) yield record
        record = []
      } else {
        field += character
      }
      if (Buffer.byteLength(field) > MAX_CELL_BYTES) {
        stream.destroy()
        throw new SeoError(
          'INVALID_INPUT',
          `Link import contains a cell larger than ${MAX_CELL_BYTES} bytes.`,
        )
      }
    }
  }
  if (quoted && !pendingQuote) {
    throw new SeoError('INVALID_INPUT', 'Link CSV contains an unclosed quote.')
  }
  if (field || record.length) {
    record.push(field.replace(/\r$/, ''))
    if (record.some((value) => value.length > 0)) yield record
  }
}

async function* jsonlRecords(
  path: string,
  byteLimit: number,
  progress: { bytesRead: number },
): AsyncGenerator<RawLinkEvidenceRow> {
  const stream = createReadStream(path, { encoding: 'utf8' })
  let remainder = ''
  for await (const chunk of stream) {
    progress.bytesRead += Buffer.byteLength(chunk)
    if (progress.bytesRead > byteLimit) {
      stream.destroy()
      throw new SeoError(
        'INVALID_INPUT',
        `Link import exceeds the ${byteLimit}-byte streaming limit.`,
      )
    }
    remainder += chunk
    let newline = remainder.indexOf('\n')
    while (newline >= 0) {
      const line = remainder.slice(0, newline).trim()
      remainder = remainder.slice(newline + 1)
      if (line) yield parseObject(line)
      newline = remainder.indexOf('\n')
    }
    if (Buffer.byteLength(remainder) > MAX_CELL_BYTES) {
      stream.destroy()
      throw new SeoError(
        'INVALID_INPUT',
        `Link import contains a line larger than ${MAX_CELL_BYTES} bytes.`,
      )
    }
  }
  if (remainder.trim()) yield parseObject(remainder)
}

function parseObject(value: string): RawLinkEvidenceRow {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as RawLinkEvidenceRow
  } catch {
    throw new SeoError(
      'INVALID_INPUT',
      'Link JSONL must contain one JSON object per line.',
    )
  }
}

function rowFromCsv(headers: string[], values: string[]): RawLinkEvidenceRow {
  return Object.fromEntries(
    headers.map((header, index) => [header, values[index]]),
  )
}

export async function importLinkEvidence(input: {
  file: string
  format?: ImportFormat
  rowLimit?: number
}): Promise<CollectedLinkEvidence> {
  const path = resolve(input.file)
  const file = await stat(path).catch(() => undefined)
  if (!file?.isFile()) {
    throw new SeoError(
      'INVALID_INPUT',
      `Link import file was not found: ${path}`,
    )
  }
  const format = formatFor(path, input.format)
  const rowLimit = boundedRowLimit(input.rowLimit)
  if (format === 'json' && file.size > MAX_JSON_BYTES) {
    throw new SeoError(
      'INVALID_INPUT',
      `JSON link imports are limited to ${MAX_JSON_BYTES} bytes. Use CSV or JSONL for larger files.`,
    )
  }

  const progress = { bytesRead: 0 }
  let records: AsyncIterable<RawLinkEvidenceRow>
  if (format === 'csv') {
    const csv = csvRecords(path, MAX_STREAM_BYTES, progress)
    const first = await csv.next()
    const headerRow = Array.isArray(first.value) ? first.value : []
    const headers = headerRow.map((value, index) =>
      index === 0 ? value.replace(/^\uFEFF/, '') : value,
    )
    if (!headers.length) {
      throw new SeoError('INVALID_INPUT', 'Link CSV has no header row.')
    }
    records = (async function* () {
      for await (const values of csv) yield rowFromCsv(headers, values)
    })()
  } else if (format === 'jsonl') {
    records = jsonlRecords(path, MAX_STREAM_BYTES, progress)
  } else {
    const body = await readFile(path, 'utf8')
    progress.bytesRead = Buffer.byteLength(body)
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new SeoError('INVALID_INPUT', 'Link JSON is not valid JSON.')
    }
    if (!Array.isArray(parsed)) {
      throw new SeoError(
        'INVALID_INPUT',
        'Link JSON must be an array of objects.',
      )
    }
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
        fileBytes: file.size,
      },
    },
    warnings: capped
      ? [`Import stopped after ${rowLimit} rows. The file contains more data.`]
      : [],
  }
}
