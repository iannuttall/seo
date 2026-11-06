import { SEO_CRAWLER_USER_AGENT } from '../fetch/crawler-identity.js'

// The one redirect tracer: `seo page`, `seo index`, reports, the hosted MCP
// and `seo redirect-trace` all follow redirects here. Plain fetch with
// redirect: 'manual', so it runs in Node and in Cloudflare Workers. It sends
// the SEO Skill crawler user agent, never a Googlebot one, so a site that
// redirects by user agent can answer Googlebot differently.

export const MAX_REDIRECT_HOPS = 10
export const REDIRECT_HOP_TIMEOUT_MS = 10_000

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
  const maxHops = Math.min(
    Math.max(Math.trunc(options.maxHops ?? MAX_REDIRECT_HOPS), 0),
    MAX_REDIRECT_HOPS,
  )
  const timeoutMs = options.timeoutMs ?? REDIRECT_HOP_TIMEOUT_MS
  const request = options.fetch ?? ((to, init) => fetch(to, init))
  const steps: RedirectStep[] = []
  const end = (
    final_url: string,
    final_status: number | null,
    outcome: RedirectOutcome,
    error?: string,
  ): RedirectTrace => ({
    url,
    steps,
    hops: steps.filter((step) => step.location !== null).length,
    final_url,
    final_status,
    outcome,
    ...(error ? { error } : {}),
  })

  const start = httpUrl(url)
  if (!start) return end(url, null, 'error', 'Not an http or https URL.')
  let current: string = start
  const seen = new Set<string>()
  while (true) {
    seen.add(current)
    const startedAt = Date.now()
    let response: Response
    try {
      response = await request(current, {
        redirect: 'manual',
        headers: {
          'user-agent': SEO_CRAWLER_USER_AGENT,
          accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      return timedOut
        ? end(current, null, 'timeout', `No response within ${timeoutMs} ms.`)
        : end(current, null, 'error', errorText(error))
    }
    const ms = Date.now() - startedAt
    const header = response.headers.get('location')
    const redirects = REDIRECT_STATUSES.has(response.status) && header !== null
    const location = redirects ? httpUrl(header, current) : null
    if (options.onResponse) await options.onResponse(response, current)
    await response.body?.cancel().catch(() => undefined)
    steps.push({ url: current, status: response.status, location, ms })
    if (!redirects) return end(current, response.status, 'done')
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
  }
}
