// Reads a Search Console Performance export in the browser: the zip it
// downloads, or the CSV files inside it. Nothing leaves the tab.
//
// Each table has a label column (Date, Top queries, Top pages, Device or
// Country) and Clicks, Impressions, CTR and Position. An export made with a
// date comparison repeats each metric once per period, with the period's name
// in front ("Last 28 days Clicks"); the first period is the current one.

export const EXPORT_LIMITS = {
  zipBytes: 25 * 1024 * 1024,
  fileBytes: 25 * 1024 * 1024,
  rows: 50_000,
} as const

export type Metrics = {
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

export type ExportRow = {
  label: string
  current: Metrics
  previous: Metrics | null
}

export type ExportTable = {
  kind: 'dates' | 'queries' | 'pages' | 'devices' | 'countries'
  periods: string[]
  rows: ExportRow[]
  capped: boolean
}

export type ExportTables = Partial<Record<ExportTable['kind'], ExportTable>>

const LABELS: Record<string, ExportTable['kind']> = {
  date: 'dates',
  'top queries': 'queries',
  query: 'queries',
  queries: 'queries',
  'top pages': 'pages',
  page: 'pages',
  pages: 'pages',
  device: 'devices',
  devices: 'devices',
  country: 'countries',
  countries: 'countries',
}

const FILES: Record<string, ExportTable['kind']> = {
  'dates.csv': 'dates',
  'queries.csv': 'queries',
  'pages.csv': 'pages',
  'devices.csv': 'devices',
  'countries.csv': 'countries',
}

const METRICS = ['clicks', 'impressions', 'ctr', 'position'] as const

export class ExportError extends Error {}

export async function readSearchConsoleExport(
  files: File[],
): Promise<ExportTables> {
  const tables: ExportTables = {}
  for (const file of files) {
    const entries = file.name.toLowerCase().endsWith('.zip')
      ? await unzipCsv(file)
      : [{ name: file.name, text: await readText(file) }]
    for (const entry of entries) {
      const table = parseTable(entry.name, entry.text)
      if (table && !tables[table.kind]) tables[table.kind] = table
    }
  }
  if (Object.keys(tables).length === 0) {
    throw new ExportError(
      'No Search Console tables found. Choose the zip from Export, Download CSV, or the Dates, Queries or Pages file inside it.',
    )
  }
  return tables
}

async function readText(file: File): Promise<string> {
  if (file.size > EXPORT_LIMITS.fileBytes) {
    throw new ExportError(`${file.name} is larger than 25 MB.`)
  }
  return decode(new Uint8Array(await file.arrayBuffer()))
}

function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes)
  }
  return new TextDecoder('utf-8').decode(bytes)
}

// The CSV files in a zip, from its central directory. Only stored and
// deflated entries, which is what Search Console writes.
async function unzipCsv(file: File): Promise<{ name: string; text: string }[]> {
  if (file.size > EXPORT_LIMITS.zipBytes) {
    throw new ExportError(`${file.name} is larger than 25 MB.`)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer)
  let end = -1
  for (
    let at = bytes.length - 22;
    at >= Math.max(0, bytes.length - 65_557);
    at--
  ) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at
      break
    }
  }
  if (end < 0) throw new ExportError(`${file.name} is not a zip file.`)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const out: { name: string; text: string }[] = []
  for (let index = 0; index < count && index < 50; index++) {
    if (view.getUint32(at, true) !== 0x02014b50) break
    const method = view.getUint16(at + 10, true)
    const compressed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + nameLength),
    )
    at += 46 + nameLength + extraLength + commentLength
    if (!name.toLowerCase().endsWith('.csv')) continue
    if (size > EXPORT_LIMITS.fileBytes) {
      throw new ExportError(`${name} is larger than 25 MB.`)
    }
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + compressed)
    if (method === 0) {
      out.push({ name, text: decode(data) })
    } else if (method === 8) {
      const stream = new Blob([data])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
      out.push({
        name,
        text: decode(new Uint8Array(await new Response(stream).arrayBuffer())),
      })
    }
  }
  return out
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const clean = text.replace(/^\ufeff/, '')
  for (let index = 0; index < clean.length; index++) {
    const character = clean[index]
    if (quoted) {
      if (character === '"' && clean[index + 1] === '"') {
        cell += '"'
        index++
      } else if (character === '"') {
        quoted = false
      } else {
        cell += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && clean[index + 1] === '\n') index++
      row.push(cell)
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      cell = ''
      if (rows.length > EXPORT_LIMITS.rows) break
    } else {
      cell += character
    }
  }
  row.push(cell)
  if (row.some((value) => value !== '')) rows.push(row)
  return rows
}

function number(value: string | undefined): number | null {
  if (value === undefined) return null
  let text = value.trim().replace(/%$/, '').replace(/\s/g, '')
  if (!text) return null
  if (text.includes(',') && !text.includes('.')) text = text.replace(',', '.')
  text = text.replace(/,/g, '')
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseTable(name: string, text: string): ExportTable | null {
  const [header, ...body] = parseCsv(text)
  if (!header || header.length < 3) return null
  const first = header[0]?.trim().toLowerCase() ?? ''
  const fileName = name.split('/').at(-1)?.toLowerCase() ?? ''
  const kind = LABELS[first] ?? FILES[fileName]
  if (!kind) return null

  // Metric columns by period, in the order the periods first appear.
  const periods: string[] = []
  const columns: Partial<Record<(typeof METRICS)[number], number>>[] = []
  header.slice(1).forEach((title, offset) => {
    const lower = title.trim().toLowerCase()
    const metric = METRICS.find((candidate) => lower.endsWith(candidate))
    if (!metric) return
    const period = title
      .trim()
      .slice(0, title.trim().length - metric.length)
      .trim()
    let at = periods.indexOf(period)
    if (at < 0) {
      periods.push(period)
      columns.push({})
      at = periods.length - 1
    }
    const slot = columns[at]
    if (slot && slot[metric] === undefined) slot[metric] = offset + 1
  })
  // Exports in another display language: the plain layout is label, clicks,
  // impressions, CTR, position.
  if (columns.length === 0 && header.length === 5) {
    periods.push('')
    columns.push({ clicks: 1, impressions: 2, ctr: 3, position: 4 })
  }
  const current = columns[0]
  if (current?.clicks === undefined || current.impressions === undefined) {
    return null
  }

  const read = (
    cells: string[],
    slot: Partial<Record<(typeof METRICS)[number], number>> | undefined,
  ): Metrics | null => {
    if (slot?.clicks === undefined || slot.impressions === undefined)
      return null
    const clicks = number(cells[slot.clicks])
    const impressions = number(cells[slot.impressions])
    if (clicks === null || impressions === null) return null
    const ctr = slot.ctr === undefined ? null : number(cells[slot.ctr])
    return {
      clicks,
      impressions,
      ctr: ctr === null ? null : ctr / 100,
      position:
        slot.position === undefined ? null : number(cells[slot.position]),
    }
  }

  const rows: ExportRow[] = []
  for (const cells of body.slice(0, EXPORT_LIMITS.rows)) {
    const label = cells[0]?.trim()
    const metrics = read(cells, current)
    if (!label || !metrics) continue
    rows.push({ label, current: metrics, previous: read(cells, columns[1]) })
  }
  return {
    kind,
    periods: periods.map(
      (period, index) => period || (index === 0 ? 'Current' : 'Previous'),
    ),
    rows,
    capped: body.length > EXPORT_LIMITS.rows,
  }
}

/** Daily rows from a Dates table, oldest first, one row per day. */
export function dailyRows(
  table: ExportTable | undefined,
): { date: string; clicks: number; impressions: number }[] {
  if (!table) return []
  const byDate = new Map<
    string,
    { date: string; clicks: number; impressions: number }
  >()
  for (const row of table.rows) {
    const date = isoDate(row.label)
    if (!date) continue
    byDate.set(date, {
      date,
      clicks: row.current.clicks,
      impressions: row.current.impressions,
    })
  }
  return [...byDate.values()].sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  )
}

// Search Console writes ISO dates. Accept a US-style date too, in case the
// file went through a spreadsheet.
function isoDate(value: string): string | null {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    return `${us[3]}-${us[1]?.padStart(2, '0')}-${us[2]?.padStart(2, '0')}`
  }
  return null
}
