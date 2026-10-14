// Turns a stored engine report into what an agent reads first: a headline,
// the dates and data state, a compact table of the main rows, the limits that
// matter, and the exact call for more. Any report can be read at three levels:
// summary (default), rows (pages of the main list) and full (the whole JSON).

export type Detail = 'summary' | 'rows' | 'full'

type Json = unknown
type Row = Record<string, Json>

const LIST_KEYS = [
  'items',
  'rows',
  'results',
  'pages',
  'urls',
  'queries',
  'keywords',
  'opportunities',
  'candidates',
  'clusters',
  'issues',
  'domains',
  'competitors',
  'links',
]
const SKIP_KEYS = new Set([
  'caveats',
  'warnings',
  'recommendations',
  'findings',
  'sampleUrls',
  'sampleQueries',
  'omissions',
  'dimensions',
])
const ID_COLUMNS = [
  'query',
  'keyword',
  'url',
  'page',
  'finalUrl',
  'title',
  'domain',
  'target',
  'check',
  'rule',
  'severity',
  'status',
]
const METRIC_COLUMNS = [
  'clicks',
  'impressions',
  'ctr',
  'position',
  'previousClicks',
  'clicksChange',
  'searchVolume',
  'volume',
  'cpc',
  'difficulty',
  'rank',
  'count',
  'affectedUrls',
  'score',
  'priority.score',
]
const SUMMARY_ROWS = 10
const CELL_MAX = 80

const isObject = (value: Json): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isPrimitive = (value: Json) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value)

// The report's main list: a known list name first, else the longest list of
// objects within two levels.
function mainList(report: Row): { path: string; rows: Row[] } | null {
  const found: { path: string; rows: Row[]; known: boolean }[] = []
  const visit = (value: Json, path: string, depth: number) => {
    if (!isObject(value) || depth > 2) return
    for (const [key, child] of Object.entries(value)) {
      if (SKIP_KEYS.has(key)) continue
      const childPath = path ? `${path}.${key}` : key
      if (Array.isArray(child) && child.length > 0 && child.every(isObject)) {
        found.push({
          path: childPath,
          rows: child,
          known: LIST_KEYS.includes(key),
        })
      } else if (isObject(child)) {
        visit(child, childPath, depth + 1)
      }
    }
  }
  visit(report, '', 0)
  found.sort(
    (a, b) =>
      Number(b.known) - Number(a.known) ||
      b.rows.length - a.rows.length ||
      a.path.length - b.path.length,
  )
  return found[0] ?? null
}

// One level of nesting becomes dotted columns; deeper values are dropped.
function flatten(row: Row): Record<string, Json> {
  const flat: Record<string, Json> = {}
  for (const [key, value] of Object.entries(row)) {
    if (isPrimitive(value)) flat[key] = value
    else if (isObject(value)) {
      for (const [inner, innerValue] of Object.entries(value)) {
        if (isPrimitive(innerValue)) flat[`${key}.${inner}`] = innerValue
      }
    }
  }
  return flat
}

function columnsFor(rows: Record<string, Json>[], max: number): string[] {
  const seen = new Map<string, { count: number; length: number }>()
  for (const row of rows.slice(0, 50)) {
    for (const [key, value] of Object.entries(row)) {
      const entry = seen.get(key) ?? { count: 0, length: 0 }
      entry.count++
      entry.length += String(value ?? '').length
      seen.set(key, entry)
    }
  }
  const usable = [...seen].filter(([key, { count, length }]) => {
    const average = length / count
    // Long free text (explanations, guidance) stays in full detail.
    return ID_COLUMNS.includes(key) || average <= 60
  })
  const rank = (key: string) => {
    const id = ID_COLUMNS.indexOf(key)
    if (id >= 0) return id
    const metric = METRIC_COLUMNS.indexOf(key)
    if (metric >= 0) return 100 + metric
    return 1000
  }
  return usable
    .map(([key]) => key)
    .filter(
      (key) =>
        !/(^|\.)(id|method|heuristic|estimatedClickLift|confidence|label)$/.test(
          key,
        ),
    )
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, max)
}

function cell(value: Json, origin: string | null): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (origin && text.startsWith(origin)) text = text.slice(origin.length) || '/'
  if (typeof value === 'number' && !Number.isInteger(value)) {
    // Small values such as click-through rates keep more places.
    const places = Math.abs(value) < 1 ? 1000 : 100
    text = String(Math.round(value * places) / places)
  }
  text = text.replaceAll('|', '/').replaceAll('\n', ' ')
  return text.length > CELL_MAX ? `${text.slice(0, CELL_MAX - 1)}…` : text
}

export function table(
  rows: Record<string, Json>[],
  columns: string[],
  origin: string | null,
): string {
  if (rows.length === 0 || columns.length === 0) return ''
  return [
    columns.join(' | '),
    ...rows.map((row) =>
      columns.map((key) => cell(row[key], origin)).join(' | '),
    ),
  ].join('\n')
}

function findString(report: Row, keys: string[]): string | null {
  for (const key of keys) {
    const value = report[key]
    if (typeof value === 'string') return value
  }
  return null
}

function dateRange(report: Row): string | null {
  const range = isObject(report.range) ? report.range : report
  const from = findString(range, ['startDate', 'from', 'start'])
  const to = findString(range, ['endDate', 'to', 'end'])
  return from && to ? `${from} to ${to}` : null
}

function limitsOf(report: Row): string[] {
  const lists = [
    report.caveats,
    isObject(report.retainedEvidence) ? report.retainedEvidence.caveats : null,
  ]
  const lines = lists
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .filter((line): line is string => typeof line === 'string')
    .filter((line) => !/^(Date window|Selection):/.test(line))
  return lines
    .slice(0, 4)
    .map((line) => (line.length > 200 ? `${line.slice(0, 199)}…` : line))
}

// Scalar facts from the report's own summary object, when it has one.
function keyFacts(report: Row): string | null {
  if (!isObject(report.summary)) return null
  const facts = Object.entries(report.summary)
    .filter(
      ([key, value]) =>
        key !== 'verdict' && isPrimitive(value) && value !== null,
    )
    .slice(0, 8)
    .map(([key, value]) => `${key} ${cell(value, null)}`)
  return facts.length ? facts.join(', ') : null
}

export type Presented = { text: string; data: unknown }

export function presentReport(input: {
  report: Row | null
  headline: string
  label: string
  origin: string
  detail: Detail
  offset: number
  limit: number
  more: (detail: Detail, offset?: number) => string
}): Presented {
  const { report, headline, origin } = input
  if (!report) return { text: headline, data: null }
  if (input.detail === 'full') {
    return {
      text: `${headline}\n\n${JSON.stringify(report)}`,
      data: report,
    }
  }
  const list = mainList(report)
  const flat = list ? list.rows.map(flatten) : []
  const head = [
    input.label,
    dateRange(report),
    findString(report, ['dataStatus']),
  ]
    .filter(Boolean)
    .join(' · ')
  const facts = keyFacts(report)
  const limits = limitsOf(report)
  if (input.detail === 'rows') {
    const page = flat.slice(input.offset, input.offset + input.limit)
    const columns = columnsFor(flat, 14)
    const end = input.offset + page.length
    const lines = [
      head,
      list
        ? `${list.path}: rows ${input.offset + 1} to ${end} of ${flat.length}.`
        : 'This report has no list of rows. Use detail "full".',
      table(page, columns, origin),
      end < flat.length ? `Next page: ${input.more('rows', end)}` : '',
    ]
    return {
      text: lines.filter(Boolean).join('\n\n'),
      data: {
        path: list?.path ?? null,
        total: flat.length,
        offset: input.offset,
        columns,
        rows: page,
      },
    }
  }
  const shown = flat.slice(0, Math.min(input.limit, SUMMARY_ROWS))
  const columns = columnsFor(flat, 8)
  const lines = [
    head,
    headline,
    facts ? `Facts: ${facts}.` : '',
    list
      ? `${list.path} (${shown.length} of ${flat.length} shown):\n${table(shown, columns, origin)}`
      : '',
    limits.length
      ? `Limits:\n${limits.map((line) => `- ${line}`).join('\n')}`
      : '',
    `More: ${shown.length < flat.length ? `${input.more('rows', shown.length)} for more rows, or ` : ''}${input.more('full')} for every field.`,
  ]
  return {
    text: lines.filter(Boolean).join('\n\n'),
    data: {
      summary: isObject(report.summary) ? report.summary : null,
      path: list?.path ?? null,
      total: flat.length,
      columns,
      rows: shown,
      limits,
    },
  }
}
