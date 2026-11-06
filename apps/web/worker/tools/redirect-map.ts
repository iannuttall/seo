// Traces a redirect map: each old URL is followed hop by hop and compared
// with the new URL it should land on. Rows stream back as NDJSON while the
// rest are traced, so one check of up to 200 rows is one request and counts
// once against the daily limit. The verdict names match the CLI's
// `seo redirect-trace --map`.
import {
  type RedirectVerdict,
  redirectKind,
  redirectVerdict,
  sameTarget,
} from '@seo/core/commands'
import { parsePublicUrl, readPageSignals, tracePage } from './page-signals.ts'
import { readBounded, ToolInputError, ToolLimitError } from './serp-preview.ts'
import { isBrowserRequestFromSameSite, type SitemapFetcher } from './sitemap.ts'

export const REDIRECT_MAP_LIMITS = Object.freeze({
  rows: 200,
  bodyBytes: 1_048_576,
  concurrency: 5,
  htmlBytes: 524_288,
  totalMilliseconds: 180_000,
})

const USER_AGENT =
  'SEO-Redirect-Map-Checker/1.0 (+https://seoskill.dev/tools/seo-migration-checklist)'

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

export type RedirectMapRowResult = {
  type: 'row'
  index: number
  from: string
  to: string | null
  verdict: RedirectVerdict
  hops: Array<{ url: string; status: number }>
  finalUrl: string
  finalStatus: number | null
  // A 302, 303 or 307 anywhere on the way.
  temporary: boolean
  // The page it lands on, when it returns 200 HTML.
  noindex: boolean | null
  canonical: string | null
  homepage: boolean
  error?: string
}

export type RedirectMapSummary = {
  type: 'summary'
  rows: number
  verdicts: Partial<Record<RedirectVerdict, number>>
  milliseconds: number
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

type Row = { from: string; to: string | null }

export async function readMapRequest(request: Request): Promise<Row[]> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > REDIRECT_MAP_LIMITS.bodyBytes) {
    throw new ToolLimitError('The redirect map is too large.')
  }
  let body: unknown
  try {
    body = JSON.parse(
      new TextDecoder().decode(
        await readBounded(request.body, REDIRECT_MAP_LIMITS.bodyBytes),
      ),
    )
  } catch (error) {
    if (error instanceof ToolLimitError) {
      throw new ToolLimitError('The redirect map is too large.')
    }
    throw new ToolInputError('Send a valid JSON request.')
  }
  const rows = (body as { rows?: unknown } | null)?.rows
  if (
    !body ||
    typeof body !== 'object' ||
    Object.keys(body).join() !== 'rows' ||
    !Array.isArray(rows)
  ) {
    throw new ToolInputError('Send the redirect map rows.')
  }
  if (rows.length === 0) throw new ToolInputError('Add at least one old URL.')
  if (rows.length > REDIRECT_MAP_LIMITS.rows) {
    throw new ToolLimitError(
      `Check up to ${REDIRECT_MAP_LIMITS.rows} rows at a time.`,
    )
  }
  return rows.map((row) => {
    const value = row as { from?: unknown; to?: unknown } | null
    if (
      !value ||
      typeof value.from !== 'string' ||
      value.from.length > 2_048 ||
      (value.to !== undefined &&
        value.to !== null &&
        (typeof value.to !== 'string' || value.to.length > 2_048))
    ) {
      throw new ToolInputError(
        'Each row needs an old URL and an optional new URL.',
      )
    }
    return {
      from: value.from,
      to: typeof value.to === 'string' && value.to ? value.to : null,
    }
  })
}

export async function traceMapRow(
  row: Row,
  index: number,
  fetcher: SitemapFetcher,
): Promise<RedirectMapRowResult> {
  const base: RedirectMapRowResult = {
    type: 'row',
    index,
    from: row.from,
    to: row.to,
    verdict: 'error',
    hops: [],
    finalUrl: row.from,
    finalStatus: null,
    temporary: false,
    noindex: null,
    canonical: null,
    homepage: false,
  }
  let from: URL
  let to: string | null = null
  try {
    from = parsePublicUrl(row.from)
    if (row.to) to = parsePublicUrl(row.to).toString()
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : 'The URL is not valid.',
    }
  }
  const trace = await tracePage(from, fetcher, {
    userAgent: USER_AGENT,
    readBody: true,
    maxBytes: REDIRECT_MAP_LIMITS.htmlBytes,
  })
  const signals =
    trace.html !== null
      ? readPageSignals(trace.html, trace.finalUrl, trace.headers)
      : null
  const canonical = signals
    ? (signals.canonical.href ?? signals.canonical.header)
    : null
  const finalPath = (() => {
    try {
      return new URL(trace.finalUrl).pathname
    } catch {
      return ''
    }
  })()
  return {
    ...base,
    from: from.toString(),
    to,
    verdict: redirectVerdict(
      {
        url: from.toString(),
        steps: [],
        hops: trace.redirects,
        final_url: trace.finalUrl,
        final_status: trace.finalStatus,
        outcome: trace.outcome,
      },
      to ?? undefined,
    ),
    hops: trace.hops.map((hop) => ({ url: hop.url, status: hop.status })),
    finalUrl: trace.finalUrl,
    finalStatus: trace.outcome === 'done' ? trace.finalStatus : null,
    temporary: trace.hops.some(
      (hop) =>
        hop.location !== null && redirectKind(hop.status) === 'temporary',
    ),
    noindex: signals
      ? signals.google.noindex
      : trace.headers.robots
        ? readPageSignals(null, trace.finalUrl, trace.headers).google.noindex
        : null,
    canonical:
      canonical && !sameTarget(canonical, trace.finalUrl) ? canonical : null,
    homepage:
      trace.redirects > 0 &&
      trace.outcome === 'done' &&
      finalPath === '/' &&
      from.pathname !== '/',
    error: trace.error,
  }
}

export async function handleRedirectMap(
  request: Request,
  fetcher: SitemapFetcher = fetch,
  now: () => number = Date.now,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!isBrowserRequestFromSameSite(request)) {
    return jsonResponse({ error: 'Not found' }, 404)
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return jsonResponse({ error: 'Send a JSON request.' }, 400)
  }
  let rows: Row[]
  try {
    rows = await readMapRequest(request)
  } catch (error) {
    if (error instanceof ToolLimitError) {
      return jsonResponse({ error: error.message }, 413)
    }
    if (error instanceof ToolInputError) {
      return jsonResponse({ error: error.message }, 400)
    }
    return jsonResponse({ error: 'The redirect map could not be read.' }, 400)
  }

  const started = now()
  const encoder = new TextEncoder()
  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()
  const verdicts: RedirectMapSummary['verdicts'] = {}
  const write = (value: RedirectMapRowResult | RedirectMapSummary) =>
    writer.write(encoder.encode(`${JSON.stringify(value)}\n`))

  const work = (async () => {
    let next = 0
    const worker = async () => {
      while (next < rows.length) {
        const index = next
        next += 1
        const row = rows[index] as Row
        const result =
          now() - started > REDIRECT_MAP_LIMITS.totalMilliseconds
            ? ({
                type: 'row',
                index,
                from: row.from,
                to: row.to,
                verdict: 'timeout',
                hops: [],
                finalUrl: row.from,
                finalStatus: null,
                temporary: false,
                noindex: null,
                canonical: null,
                homepage: false,
                error:
                  'The check stopped after three minutes before reaching this row.',
              } satisfies RedirectMapRowResult)
            : await traceMapRow(row, index, fetcher).catch(
                () =>
                  ({
                    type: 'row',
                    index,
                    from: row.from,
                    to: row.to,
                    verdict: 'error',
                    hops: [],
                    finalUrl: row.from,
                    finalStatus: null,
                    temporary: false,
                    noindex: null,
                    canonical: null,
                    homepage: false,
                    error: 'The URL could not be checked.',
                  }) satisfies RedirectMapRowResult,
              )
        verdicts[result.verdict] = (verdicts[result.verdict] ?? 0) + 1
        await write(result)
      }
    }
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(REDIRECT_MAP_LIMITS.concurrency, rows.length) },
          worker,
        ),
      )
      await write({
        type: 'summary',
        rows: rows.length,
        verdicts,
        milliseconds: now() - started,
      })
    } finally {
      await writer.close().catch(() => undefined)
    }
  })()
  // Keep the work attached to the response; a client that leaves cancels it.
  work.catch(() => undefined)

  return new Response(stream.readable, {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      'content-type': 'application/x-ndjson; charset=utf-8',
    },
  })
}
