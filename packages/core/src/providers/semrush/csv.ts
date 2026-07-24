import { z } from 'zod'
import { ProviderError } from '../errors.js'

const MAX_CELL_BYTES = 1_000_000

export const semrushCsvTableSchema = z
  .object({
    headers: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
    rows: z.array(z.array(z.string().max(MAX_CELL_BYTES))),
  })
  .strict()
  .superRefine((table, context) => {
    if (new Set(table.headers).size !== table.headers.length) {
      context.addIssue({
        code: 'custom',
        message: 'Semrush returned duplicate CSV headers.',
      })
    }
    for (const [index, row] of table.rows.entries()) {
      if (row.length !== table.headers.length) {
        context.addIssue({
          code: 'custom',
          message: `Semrush CSV row ${index + 1} has the wrong column count.`,
        })
        break
      }
    }
  })

export type SemrushCsvTable = z.infer<typeof semrushCsvTableSchema>

function invalidCsv(message: string): ProviderError {
  return new ProviderError({
    provider: 'semrush',
    operation: 'csv',
    code: 'invalid-response',
    message,
  })
}

export function parseSemicolonCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/u, '')
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false

  const pushField = () => {
    record.push(field)
    field = ''
  }
  const pushRecord = () => {
    pushField()
    if (record.some((value) => value.length > 0)) records.push(record)
    record = []
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += character
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ';') {
      pushField()
    } else if (character === '\n') {
      if (field.endsWith('\r')) field = field.slice(0, -1)
      pushRecord()
    } else {
      field += character
    }
    if (Buffer.byteLength(field) > MAX_CELL_BYTES) {
      throw invalidCsv(
        `Semrush returned a CSV cell larger than ${MAX_CELL_BYTES} bytes.`,
      )
    }
  }
  if (quoted) throw invalidCsv('Semrush returned CSV with an unclosed quote.')
  if (field || record.length) {
    if (field.endsWith('\r')) field = field.slice(0, -1)
    pushRecord()
  }
  if (records[0]?.[0]) {
    records[0][0] = records[0][0].replace(/^\uFEFF/u, '')
  }
  return records
}

export function parseSemrushCsv(
  text: string,
  maximumRows: number,
): SemrushCsvTable {
  const [headers, ...rows] = parseSemicolonCsv(text)
  if (!headers) throw invalidCsv('Semrush returned an empty CSV response.')
  if (rows.length > maximumRows) {
    throw invalidCsv(
      `Semrush returned ${rows.length} rows, above the ${maximumRows}-row request bound.`,
    )
  }
  const parsed = semrushCsvTableSchema.safeParse({ headers, rows })
  if (!parsed.success) {
    throw invalidCsv('Semrush returned malformed CSV data.')
  }
  return parsed.data
}
