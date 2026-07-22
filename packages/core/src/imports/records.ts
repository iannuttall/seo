import type { Hash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { TextDecoder } from 'node:util'
import { SeoError } from '../errors.js'

export type StructuredImportFormat = 'csv' | 'json' | 'jsonl'
export type CsvDelimiter = ',' | ';' | '\t'
export type TextEncoding = 'utf-8' | 'utf-16be' | 'utf-16le'

export type ImportProgress = {
  bytesRead: number
  hash?: Hash
  encoding?: TextEncoding
  delimiter?: CsvDelimiter
}

export type ImportFile = {
  path: string
  format: StructuredImportFormat
  fileBytes: number
}

export const DEFAULT_IMPORT_STREAM_BYTES = 50_000_000
export const DEFAULT_IMPORT_JSON_BYTES = 10_000_000
export const DEFAULT_IMPORT_CELL_BYTES = 1_000_000

export async function importFile(input: {
  file: string
  format?: StructuredImportFormat
  label: string
  maxStreamBytes?: number
  maxJsonBytes?: number
}): Promise<ImportFile> {
  const path = resolve(input.file)
  const file = await stat(path).catch(() => undefined)
  if (!file?.isFile()) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} import file was not found: ${path}`,
    )
  }
  const format = importFormat(path, input.format, input.label)
  const byteLimit =
    format === 'json'
      ? (input.maxJsonBytes ?? DEFAULT_IMPORT_JSON_BYTES)
      : (input.maxStreamBytes ?? DEFAULT_IMPORT_STREAM_BYTES)
  if (file.size > byteLimit) {
    const guidance =
      format === 'json' ? ' Use CSV or JSONL for larger files.' : ''
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} ${format.toUpperCase()} imports are limited to ${byteLimit} bytes.${guidance}`,
    )
  }
  return { path, format, fileBytes: file.size }
}

export function importFormat(
  path: string,
  explicit: StructuredImportFormat | undefined,
  label: string,
): StructuredImportFormat {
  if (explicit) return explicit
  const extension = extname(path).toLowerCase()
  if (extension === '.csv' || extension === '.tsv') return 'csv'
  if (extension === '.jsonl' || extension === '.ndjson') return 'jsonl'
  if (extension === '.json') return 'json'
  throw new SeoError(
    'INVALID_INPUT',
    `${label} imports must be CSV, TSV, JSON, JSONL, or NDJSON.`,
  )
}

function delimiterCount(line: string, delimiter: CsvDelimiter): number {
  let count = 0
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && character === delimiter) {
      count += 1
    }
  }
  return count
}

async function detectTextEncoding(path: string): Promise<TextEncoding> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(4)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (
      bytesRead >= 4 &&
      ((buffer[0] === 0xff &&
        buffer[1] === 0xfe &&
        buffer[2] === 0x00 &&
        buffer[3] === 0x00) ||
        (buffer[0] === 0x00 &&
          buffer[1] === 0x00 &&
          buffer[2] === 0xfe &&
          buffer[3] === 0xff))
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        'UTF-32 imports are not supported. Export the file as UTF-8 or UTF-16 CSV.',
      )
    }
    if (bytesRead >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return 'utf-16le'
    }
    if (bytesRead >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
      return 'utf-16be'
    }
    return 'utf-8'
  } finally {
    await handle.close()
  }
}

function decodeText(
  decoder: TextDecoder,
  chunk: Buffer,
  stream: boolean,
  label: string,
): string {
  try {
    return decoder.decode(chunk, { stream })
  } catch {
    throw new SeoError(
      'INVALID_INPUT',
      `${label} import is not valid UTF-8 or UTF-16 text.`,
    )
  }
}

export async function detectCsvDelimiter(path: string): Promise<CsvDelimiter> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(64 * 1024)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const encoding = await detectTextEncoding(path)
    const firstRecord = new TextDecoder(encoding)
      .decode(buffer.subarray(0, bytesRead))
      .split(/\r?\n/u, 1)[0]
      ?.replace(/^\uFEFF/u, '')
    if (!firstRecord) return ','
    const candidates = ([',', ';', '\t'] as const).map((delimiter) => ({
      delimiter,
      count: delimiterCount(firstRecord, delimiter),
    }))
    candidates.sort((left, right) => right.count - left.count)
    return candidates[0]?.count ? candidates[0].delimiter : ','
  } finally {
    await handle.close()
  }
}

export async function* csvRecords(input: {
  path: string
  byteLimit: number
  progress: ImportProgress
  label: string
  delimiter?: CsvDelimiter
  maxCellBytes?: number
}): AsyncGenerator<string[]> {
  const stream = createReadStream(input.path)
  const encoding = await detectTextEncoding(input.path)
  const decoder = new TextDecoder(encoding, { fatal: true })
  const delimiter = input.delimiter ?? (await detectCsvDelimiter(input.path))
  input.progress.encoding = encoding
  input.progress.delimiter = delimiter
  const maxCellBytes = input.maxCellBytes ?? DEFAULT_IMPORT_CELL_BYTES
  let record: string[] = []
  let field = ''
  let quoted = false
  let pendingQuote = false

  const consumeChunk = function* (chunk: string): Generator<string[]> {
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
      } else if (character === delimiter) {
        record.push(field)
        field = ''
      } else if (character === '\n') {
        record.push(field.replace(/\r$/u, ''))
        field = ''
        if (record.some((value) => value.length > 0)) yield record
        record = []
      } else {
        field += character
      }
      if (Buffer.byteLength(field) > maxCellBytes) {
        stream.destroy()
        throw new SeoError(
          'INVALID_INPUT',
          `${input.label} import contains a cell larger than ${maxCellBytes} bytes.`,
        )
      }
    }
  }

  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    input.progress.bytesRead += chunk.byteLength
    input.progress.hash?.update(chunk)
    if (input.progress.bytesRead > input.byteLimit) {
      stream.destroy()
      throw new SeoError(
        'INVALID_INPUT',
        `${input.label} import exceeds the ${input.byteLimit}-byte streaming limit.`,
      )
    }
    yield* consumeChunk(decodeText(decoder, chunk, true, input.label))
  }
  yield* consumeChunk(decodeText(decoder, Buffer.alloc(0), false, input.label))
  if (quoted && !pendingQuote) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} CSV contains an unclosed quote.`,
    )
  }
  if (field || record.length) {
    record.push(field.replace(/\r$/u, ''))
    if (record.some((value) => value.length > 0)) yield record
  }
}

export async function* jsonlRecords(input: {
  path: string
  byteLimit: number
  progress: ImportProgress
  label: string
  maxLineBytes?: number
  onInvalidLine?: (line: number) => void
}): AsyncGenerator<Record<string, unknown>> {
  const stream = createReadStream(input.path, { encoding: 'utf8' })
  input.progress.encoding = 'utf-8'
  const maxLineBytes = input.maxLineBytes ?? DEFAULT_IMPORT_CELL_BYTES
  let remainder = ''
  let lineNumber = 0
  for await (const chunk of stream) {
    input.progress.bytesRead += Buffer.byteLength(chunk)
    input.progress.hash?.update(chunk)
    if (input.progress.bytesRead > input.byteLimit) {
      stream.destroy()
      throw new SeoError(
        'INVALID_INPUT',
        `${input.label} import exceeds the ${input.byteLimit}-byte streaming limit.`,
      )
    }
    remainder += chunk
    let newline = remainder.indexOf('\n')
    while (newline >= 0) {
      lineNumber += 1
      const line = remainder.slice(0, newline).trim()
      remainder = remainder.slice(newline + 1)
      if (line) {
        const parsed = parseJsonObject(line)
        if (parsed) yield parsed
        else if (input.onInvalidLine) input.onInvalidLine(lineNumber)
        else invalidJsonl(input.label)
      }
      newline = remainder.indexOf('\n')
    }
    if (Buffer.byteLength(remainder) > maxLineBytes) {
      stream.destroy()
      throw new SeoError(
        'INVALID_INPUT',
        `${input.label} import contains a line larger than ${maxLineBytes} bytes.`,
      )
    }
  }
  if (remainder.trim()) {
    lineNumber += 1
    const parsed = parseJsonObject(remainder)
    if (parsed) yield parsed
    else if (input.onInvalidLine) input.onInvalidLine(lineNumber)
    else invalidJsonl(input.label)
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function invalidJsonl(label: string): never {
  throw new SeoError(
    'INVALID_INPUT',
    `${label} JSONL must contain one JSON object per line.`,
  )
}

export function csvRow(
  headers: string[],
  values: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? '']),
  )
}

export async function readJsonArray(input: {
  path: string
  progress: ImportProgress
  label: string
}): Promise<unknown[]> {
  input.progress.encoding = 'utf-8'
  const body = await readFile(input.path, 'utf8')
  input.progress.bytesRead = Buffer.byteLength(body)
  input.progress.hash?.update(body)
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} JSON is not valid JSON.`,
    )
  }
  if (!Array.isArray(parsed)) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} JSON must be an array of objects.`,
    )
  }
  return parsed
}
