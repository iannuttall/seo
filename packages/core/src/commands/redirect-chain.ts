import { SEO_CRAWLER_USER_AGENT } from '../fetch/crawler-identity.js'
import { CommandError } from './types.js'

// The one redirect tracer: `seo page`, `seo index`, reports, the hosted MCP
// and `seo redirect-trace` all follow redirects here. Plain fetch with
// redirect: 'manual', so it runs in Node and in Cloudflare Workers. It sends
// the SEO Skill crawler user agent, never a Googlebot one, so a site that
// redirects by user agent can answer Googlebot differently.

export const MAX_REDIRECT_HOPS = 10
export const REDIRECT_HOP_TIMEOUT_MS = 10_000
export const REDIRECT_MAP_MAX_ROWS = 1_000
export const REDIRECT_MAP_CONCURRENCY = 5
// A map file larger than this cannot hold 1,000 sensible rows.
export const REDIRECT_MAP_MAX_BYTES = 2_000_000

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type RedirectStep = {
  url: string
  status: number
  // The absolute URL the Location header points to, when this response
  // redirects. Null for the response that ends the trace.
  location: string | null
  ms: number
}

export type RedirectOutcome =
  // A response that does not redirect ended the trace.
  | 'done'
  // A Location pointed back to a URL already requested.
  | 'loop'
  // Still redirecting after the hop cap.
  | 'too_many'
  | 'timeout'
  | 'error'

export type RedirectTrace = {
  url: string
  // Every response, in order. Redirect steps carry their Location.
  steps: RedirectStep[]
  // Redirects followed: steps with a Location.
  hops: number
  // The last URL requested (or, after an error, the one that failed).
  final_url: string
  // The last response's status. Null when the last request got no response.
  final_status: number | null
  outcome: RedirectOutcome
  error?: string
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = (error as { cause?: { code?: unknown; message?: unknown } })
    .cause
  const detail =
    typeof cause?.code === 'string'
      ? cause.code
      : typeof cause?.message === 'string'
        ? cause.message
        : ''
  return detail && !error.message.includes(detail)
    ? `${error.message} (${detail})`
    : error.message
}

function httpUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

// Follows redirects one request at a time, up to maxHops, each request with
// its own timeout. onResponse sees every response and may read its body;
// otherwise the body is cancelled.
export async function traceRedirects(
  url: string,
  options: {
    maxHops?: number
    timeoutMs?: number
    fetch?: Fetch
    onResponse?: (response: Response, url: string) => Promise<void>
  } = {},
): Promise<RedirectTrace> {
  const request = options.fetch ?? ((to, init) => fetch(to, init))
  const { trace, response } = await followRedirects(url, {
    maxHops: options.maxHops,
    timeoutMs: options.timeoutMs,
    onResponse: options.onResponse,
    request: (to, signal) =>
      request(to, {
        redirect: 'manual',
        headers: {
          'user-agent': SEO_CRAWLER_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        signal,
      }),
  })
  await response?.body?.cancel().catch(() => undefined)
  return trace
}

type HopResponse = {
  status: number
  headers: { get(name: string): string | null }
  body?: { cancel(): Promise<void> } | null
}

// The redirect loop behind traceRedirects and the crawler's fetches.
// request must not follow redirects itself. Each request has its own
// timeout, which also covers onResponse. The response that ends a 'done'
// trace comes back with its body unread, for the caller to read or cancel;
// every other body is cancelled. error holds what a failed request threw.
// When the caller's signal aborts, its error is rethrown as it is.
export async function followRedirects<R extends HopResponse>(
  url: string,
  options: {
    request: (url: string, signal: AbortSignal) => Promise<R>
    maxHops?: number
    timeoutMs?: number
    signal?: AbortSignal
    onResponse?: (response: R, url: string) => Promise<void>
  },
): Promise<{ trace: RedirectTrace; response: R | null; error?: unknown }> {
  const maxHops = Math.min(
    Math.max(Math.trunc(options.maxHops ?? MAX_REDIRECT_HOPS), 0),
    MAX_REDIRECT_HOPS,
  )
  const timeoutMs = options.timeoutMs ?? REDIRECT_HOP_TIMEOUT_MS
  const steps: RedirectStep[] = []
  const end = (
    final_url: string,
    final_status: number | null,
    outcome: RedirectOutcome,
    error?: string,
    extra: { response?: R; error?: unknown } = {},
  ) => ({
    trace: {
      url,
      steps,
      hops: steps.filter((step) => step.location !== null).length,
      final_url,
      final_status,
      outcome,
      ...(error ? { error } : {}),
    } satisfies RedirectTrace,
    response: extra.response ?? null,
    ...('error' in extra ? { error: extra.error } : {}),
  })

  const start = httpUrl(url)
  if (!start) return end(url, null, 'error', 'Not an http or https URL.')
  let current: string = start
  const seen = new Set<string>()
  while (true) {
    seen.add(current)
    const startedAt = Date.now()
    const hop = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      hop.abort()
    }, timeoutMs)
    const signal = options.signal
      ? AbortSignal.any([options.signal, hop.signal])
      : hop.signal
    try {
      let response: R
      try {
        response = await options.request(current, signal)
      } catch (error) {
        if (options.signal?.aborted) throw error
        const timeout =
          timedOut ||
          (error instanceof Error &&
            (error.name === 'TimeoutError' || error.name === 'AbortError'))
        return timeout
          ? end(
              current,
              null,
              'timeout',
              `No response within ${timeoutMs} ms.`,
              { error },
            )
          : end(current, null, 'error', errorText(error), { error })
      }
      const ms = Date.now() - startedAt
      const header = response.headers.get('location')
      const redirects =
        REDIRECT_STATUSES.has(response.status) && header !== null
      const location = redirects ? httpUrl(header, current) : null
      if (options.onResponse) await options.onResponse(response, current)
      steps.push({ url: current, status: response.status, location, ms })
      if (!redirects)
        return end(current, response.status, 'done', '', { response })
      await response.body?.cancel().catch(() => undefined)
      if (!location) {
        return end(
          current,
          response.status,
          'error',
          `The Location header is not an http or https URL: ${header.slice(0, 200)}`,
        )
      }
      if (seen.has(location)) return end(current, response.status, 'loop')
      if (steps.length > maxHops) {
        return end(current, response.status, 'too_many')
      }
      current = location
    } finally {
      clearTimeout(timer)
    }
  }
}

// Map mode: old URL, optional expected new URL.

export type RedirectMapRow = { line: number; url: string; expected?: string }

export type RedirectVerdict =
  // Ends on the expected URL in one hop (or none, when it is the same URL).
  | 'matches'
  // Ends on the expected URL after more than one hop: right, but slower.
  // Without an expected URL: more than one hop.
  | 'chain'
  // Without an expected URL: one hop.
  | 'redirects'
  | 'wrong_target'
  | 'not_redirected'
  | 'loop'
  | 'too_many_hops'
  | 'timeout'
  | 'error'

export type RedirectMapResult = {
  type: 'row'
  line: number
  url: string
  expected: string | null
  verdict: RedirectVerdict
  hops: number
  final_url: string
  final_status: number | null
  chain: { url: string; status: number; location: string | null }[]
  error?: string
}

function csvFields(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      fields.push(field.trim())
      field = ''
    } else field += char
  }
  fields.push(field.trim())
  return fields
}

// Reads `old_url,expected_new_url` lines, or one URL per line. A first line
// that is not a URL is a header. Empty lines and lines starting with # are
// skipped. Refuses the whole file, before any request, when it has more
// than REDIRECT_MAP_MAX_ROWS rows or a row it cannot read.
export function parseRedirectMap(text: string): RedirectMapRow[] {
  const rows: RedirectMapRow[] = []
  const problems: string[] = []
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  lines.forEach((raw, index) => {
    const line = index + 1
    const value = raw.trim()
    if (!value || value.startsWith('#')) return
    const [first = '', second = '', ...rest] = csvFields(value)
    const url = httpUrl(first)
    if (!url && !rows.length && !problems.length) return
    if (!url) {
      problems.push(
        `line ${line}: "${first.slice(0, 80)}" is not an http or https URL`,
      )
      return
    }
    if (rest.some(Boolean)) {
      problems.push(`line ${line}: more than two columns`)
      return
    }
    if (second && !httpUrl(second)) {
      problems.push(
        `line ${line}: "${second.slice(0, 80)}" is not an http or https URL`,
      )
      return
    }
    rows.push({ line, url: first, ...(second ? { expected: second } : {}) })
  })
  if (rows.length + problems.length > REDIRECT_MAP_MAX_ROWS) {
    throw new CommandError(
      'INVALID_INPUT',
      `The map has ${(rows.length + problems.length).toLocaleString('en-US')} rows. Map mode traces up to ${REDIRECT_MAP_MAX_ROWS.toLocaleString('en-US')} per run, so split the file and run each part.`,
    )
  }
  if (problems.length) {
    throw new CommandError(
      'INVALID_INPUT',
      `The map has ${problems.length} ${problems.length === 1 ? 'row' : 'rows'} it cannot read, so nothing was traced: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? '; and more' : ''}.`,
    )
  }
  if (!rows.length) {
    throw new CommandError(
      'INVALID_INPUT',
      'The map has no URLs. Write one old_url,expected_new_url pair per line, or one URL per line.',
    )
  }
  return rows
}

// Same URL apart from host case, a default port, a fragment or a trailing
// slash on the path.
export function sameTarget(a: string, b: string): boolean {
  const key = (value: string) => {
    const url = new URL(value)
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  }
  try {
    return key(a) === key(b)
  } catch {
    return false
  }
}

export function redirectVerdict(
  trace: RedirectTrace,
  expected?: string,
): RedirectVerdict {
  if (trace.outcome === 'loop') return 'loop'
  if (trace.outcome === 'too_many') return 'too_many_hops'
  if (trace.outcome === 'timeout') return 'timeout'
  if (trace.outcome === 'error') return 'error'
  if (!expected) {
    return trace.hops === 0
      ? 'not_redirected'
      : trace.hops === 1
        ? 'redirects'
        : 'chain'
  }
  if (sameTarget(trace.final_url, expected)) {
    return trace.hops > 1 ? 'chain' : 'matches'
  }
  return trace.hops === 0 ? 'not_redirected' : 'wrong_target'
}

export type RedirectMapSummary = {
  type: 'summary'
  rows: number
  verdicts: Partial<Record<RedirectVerdict, number>>
  // Rows whose last response was a status other than 200 (not counting
  // rows with no response).
  final_not_200: number
  max_hops: number
  concurrency: number
  timeout_ms: number
}

// Traces every row with a fixed number of requests in flight. Rows reach
// onRow in input order as they finish; at most a few rows wait in memory.
export async function traceRedirectMap(
  rows: RedirectMapRow[],
  onRow: (row: RedirectMapResult) => Promise<void> | void,
  options: { fetch?: Fetch } = {},
): Promise<RedirectMapSummary> {
  if (rows.length > REDIRECT_MAP_MAX_ROWS) {
    throw new CommandError(
      'INVALID_INPUT',
      `Map mode traces up to ${REDIRECT_MAP_MAX_ROWS.toLocaleString('en-US')} rows per run.`,
    )
  }
  const summary: RedirectMapSummary = {
    type: 'summary',
    rows: rows.length,
    verdicts: {},
    final_not_200: 0,
    max_hops: MAX_REDIRECT_HOPS,
    concurrency: REDIRECT_MAP_CONCURRENCY,
    timeout_ms: REDIRECT_HOP_TIMEOUT_MS,
  }
  let active = 0
  const waiting: Array<() => void> = []
  const run = async (row: RedirectMapRow): Promise<RedirectMapResult> => {
    while (active >= REDIRECT_MAP_CONCURRENCY) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active += 1
    try {
      const trace = await traceRedirects(row.url, { fetch: options.fetch })
      return {
        type: 'row',
        line: row.line,
        url: row.url,
        expected: row.expected ?? null,
        verdict: redirectVerdict(trace, row.expected),
        hops: trace.hops,
        final_url: trace.final_url,
        final_status: trace.final_status,
        chain: trace.steps.map(({ url, status, location }) => ({
          url,
          status,
          location,
        })),
        ...(trace.error ? { error: trace.error } : {}),
      }
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }

  const window: Promise<RedirectMapResult>[] = []
  let next = 0
  while (next < rows.length || window.length) {
    while (next < rows.length && window.length < REDIRECT_MAP_CONCURRENCY * 4) {
      window.push(run(rows[next] as RedirectMapRow))
      next += 1
    }
    const result = await (window.shift() as Promise<RedirectMapResult>)
    summary.verdicts[result.verdict] =
      (summary.verdicts[result.verdict] ?? 0) + 1
    if (result.final_status !== null && result.final_status !== 200) {
      summary.final_not_200 += 1
    }
    await onRow(result)
  }
  return summary
}
