import {
  followRedirects,
  MAX_REDIRECT_HOPS,
  REDIRECT_HOP_TIMEOUT_MS,
} from '../../commands/redirect-chain.js'
import type { PageFetchResult } from '../../types.js'
import { publicHttpFetch } from '../http-client.js'

type RedirectHop = NonNullable<
  PageFetchResult['diagnostics']['redirectChain']
>[number]

export type RedirectChainFailure =
  // A Location pointed back to a URL already requested.
  | 'loop'
  // Still redirecting after MAX_REDIRECT_HOPS redirects.
  | 'too_many'
  // One request got no response within its timeout.
  | 'timeout'
  // A request failed (DNS, TLS, connection), or a Location was not an
  // http(s) URL. cause holds what the request threw, when it threw.
  | 'network'

// A redirect chain that did not end in a response. The caller's own abort is
// never wrapped in this error.
export class RedirectChainError extends Error {
  constructor(
    readonly kind: RedirectChainFailure,
    readonly url: string,
    readonly redirectChain: RedirectHop[],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'RedirectChainError'
  }
}

// One page fetch with the crawler's headers, following up to
// MAX_REDIRECT_HOPS redirects one request at a time. Each request waits up
// to timeoutMs for a response; signal bounds the whole fetch, body included.
// The final response comes back with its body unread.
export async function fetchWithRedirectChain(
  url: string,
  signal: AbortSignal,
  fetch: typeof publicHttpFetch = publicHttpFetch,
  options: { timeoutMs?: number } = {},
): Promise<{
  response: Awaited<ReturnType<typeof publicHttpFetch>>
  redirectChain: RedirectHop[]
}> {
  const followed = await followRedirects(url, {
    signal,
    timeoutMs: options.timeoutMs ?? REDIRECT_HOP_TIMEOUT_MS,
    request: (to, hopSignal) =>
      fetch(to, { redirect: 'manual', signal: hopSignal }),
  })
  const redirectChain = followed.trace.steps.flatMap(
    ({ url: from, status, location }) =>
      location === null ? [] : [{ url: from, status, location }],
  )
  const { trace, response } = followed
  if (trace.outcome === 'done' && response) return { response, redirectChain }
  const kind: RedirectChainFailure =
    trace.outcome === 'loop' ||
    trace.outcome === 'too_many' ||
    trace.outcome === 'timeout'
      ? trace.outcome
      : 'network'
  const message =
    kind === 'loop'
      ? `Redirect loop for ${url}: ${trace.final_url} redirects back to a URL already requested.`
      : kind === 'too_many'
        ? `Too many redirects for ${url}: still redirecting after ${MAX_REDIRECT_HOPS} redirects.`
        : (trace.error ?? 'The request failed.')
  throw new RedirectChainError(
    kind,
    url,
    redirectChain,
    message,
    'error' in followed ? { cause: followed.error } : undefined,
  )
}

// A loop or a chain over the cap ends the same way on every try, so a retry
// only repeats the requests.
export function redirectsWillRepeat(
  error: unknown,
): error is RedirectChainError {
  return (
    error instanceof RedirectChainError &&
    (error.kind === 'loop' || error.kind === 'too_many')
  )
}
