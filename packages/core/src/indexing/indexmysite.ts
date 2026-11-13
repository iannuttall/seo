import { CommandError } from '../commands/types.js'
import { readJson, readJsonOrUndefined } from '../http/read-json.js'
import { SEO_VERSION } from '../version.js'

// The one Index My Site client: OAuth into the person's Index My Site
// account and its REST API (https://indexmysite.app/docs/api.md), with the
// OAuth access token as the bearer token. Every surface reaches Index My
// Site through here. Worker-safe.

export const INDEXMYSITE_URL = 'https://indexmysite.app'
export const INDEXMYSITE_SCOPES = ['indexing.read', 'indexing.write'] as const
// Marks jobs SEO Skill created, in Index My Site's job attribution field.
// The hosted server's own client is attributed either way; machines with
// their own loopback client need it.
export const INDEXMYSITE_ATTRIBUTION = { source: 'seo-skill' } as const
// Index My Site's limit for one job.
export const INDEXMYSITE_MAX_URLS = 2_000
const TIMEOUT_MS = 20_000
// Refresh an access token this long before Index My Site says it expires.
const EARLY_MS = 60_000

const userAgent = `seo/${SEO_VERSION} (+https://seoskill.dev)`

// Why a fetch failed. Node says only "fetch failed"; the reason, such as
// a certificate the machine does not trust, is in its cause.
export function fetchFailure(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause
  const why = cause?.code ?? cause?.message
  const message = error instanceof Error ? error.message : String(error)
  const tls = /CERT|SSL|TLS/i.test(why ?? '')
    ? '; this machine does not trust the certificate. Behind a proxy or security tool, run Node with NODE_USE_SYSTEM_CA=1 or NODE_EXTRA_CA_CERTS set to its certificate'
    : ''
  return `${message}${why && why !== message ? `: ${why}` : ''}${tls}`
}

// ---- OAuth ----

export type IndexMySiteClientAuth = {
  clientId: string
  // Only a confidential client (the hosted server) has one.
  clientSecret?: string
  base?: string
}

export type IndexMySiteTokens = {
  access: string
  refresh: string
  // Unix ms, a minute before the token really expires.
  accessExp: number
}

// Index My Site no longer accepts the refresh token: the person removed
// the connection, or it was replaced. Connect again.
export class IndexMySiteGrantError extends Error {}

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

export async function pkcePair(): Promise<{
  verifier: string
  challenge: string
}> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

export function indexMySiteAuthorizeUrl(input: {
  clientId: string
  redirectUri: string
  state: string
  challenge: string
  base?: string
}): string {
  const url = new URL('/authorize', input.base ?? INDEXMYSITE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('scope', INDEXMYSITE_SCOPES.join(' '))
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

async function tokenRequest(
  auth: IndexMySiteClientAuth,
  params: Record<string, string>,
  fetcher: typeof fetch,
): Promise<Response> {
  const body = new URLSearchParams(params)
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
    'user-agent': userAgent,
  }
  if (auth.clientSecret) {
    headers.authorization = `Basic ${btoa(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(auth.clientSecret)}`)}`
  } else {
    body.set('client_id', auth.clientId)
  }
  return fetcher(new URL('/token', auth.base ?? INDEXMYSITE_URL), {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

async function readTokens(
  response: Response,
  refresh?: string,
): Promise<IndexMySiteTokens> {
  if (!response.ok) {
    const body = await readJsonOrUndefined<{
      error?: string
      error_description?: string
    }>(response, 'Index My Site sign-in')
    if (body?.error === 'invalid_grant' || body?.error === 'invalid_client') {
      throw new IndexMySiteGrantError(
        body.error_description ??
          'Index My Site no longer accepts this sign-in.',
      )
    }
    throw new CommandError(
      'PROVIDER_ERROR',
      `Index My Site sign-in failed (HTTP ${response.status}${body?.error ? `, ${body.error}` : ''}). Try again.`,
    )
  }
  const body = await readJson<{
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }>(response, 'Index My Site sign-in')
  const next = body.refresh_token ?? refresh
  if (!body.access_token || !next) {
    throw new CommandError(
      'PROVIDER_ERROR',
      'Index My Site returned no token. Connect again.',
    )
  }
  return {
    access: body.access_token,
    refresh: next,
    accessExp: Date.now() + (body.expires_in ?? 900) * 1000 - EARLY_MS,
  }
}

export async function exchangeIndexMySiteCode(
  auth: IndexMySiteClientAuth,
  input: { code: string; redirectUri: string; verifier: string },
  fetcher: typeof fetch = fetch,
): Promise<IndexMySiteTokens> {
  return readTokens(
    await tokenRequest(
      auth,
      {
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.verifier,
      },
      fetcher,
    ),
  )
}

// A new access token. Index My Site rotates refresh tokens, so the caller
// saves the refresh token this returns; the old one works once more until
// the new one is used.
export async function refreshIndexMySite(
  auth: IndexMySiteClientAuth,
  refresh: string,
  fetcher: typeof fetch = fetch,
): Promise<IndexMySiteTokens> {
  return readTokens(
    await tokenRequest(
      auth,
      { grant_type: 'refresh_token', refresh_token: refresh },
      fetcher,
    ),
    refresh,
  )
}

// Ends the grant at Index My Site (RFC 7009). Best-effort: the caller
// forgets the tokens either way.
export async function revokeIndexMySite(
  auth: IndexMySiteClientAuth,
  refresh: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await tokenRequest(
    auth,
    { token: refresh, token_type_hint: 'refresh_token' },
    fetcher,
  )
    .then((response) => response.body?.cancel())
    .catch(() => undefined)
}

// Registers a public client for one machine (RFC 7591). Each machine has
// its own client: signing in again revokes earlier grants of the same
// client, so a shared one would sign out the person's other machines.
export async function registerIndexMySiteClient(
  input: { name: string; redirectUri: string; base?: string },
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(
    new URL('/register', input.base ?? INDEXMYSITE_URL),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': userAgent },
      body: JSON.stringify({
        client_name: input.name.slice(0, 80),
        client_uri: 'https://seoskill.dev',
        redirect_uris: [input.redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: INDEXMYSITE_SCOPES.join(' '),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  )
  if (!response.ok) {
    await response.body?.cancel()
    throw new CommandError(
      'PROVIDER_ERROR',
      `Index My Site did not register this machine (HTTP ${response.status}). Try again.`,
    )
  }
  const body = await readJson<{ client_id?: string }>(
    response,
    'Index My Site client registration',
  )
  if (!body.client_id) {
    throw new CommandError(
      'PROVIDER_ERROR',
      'Index My Site returned no client id. Try again.',
    )
  }
  return body.client_id
}

// ---- REST API ----

export type IndexMySiteCredits = {
  balance: number
  hasPurchased: boolean
  hasPaymentMethod: boolean
  autoReloadEnabled: boolean
}

export type IndexMySiteGuidance = {
  phase: string
  message: string
}

export type IndexMySiteJobUrl = {
  id: string
  url: string
  status: string
  skipReason?: string | null
  skipDetail?: string | null
  preflightWarnings?: string[] | null
  mainWordCount?: number | null
  submittedAt?: number | string | null
  indexedAt?: number | string | null
}

export type IndexMySiteJobSummary = {
  id: string
  name: string
  createdAt: number
  total: number
  counts: Record<string, number>
  backgroundPending: number
  creditsPerUrl: number
  options: { fast: boolean; bing: boolean }
}

export type IndexMySiteJob = IndexMySiteJobSummary & {
  urls: IndexMySiteJobUrl[]
  guidance: IndexMySiteGuidance
}

export type NewIndexMySiteJob = {
  urls: string[]
  name?: string
  fast?: boolean
  bing?: boolean
}

// The person's Index My Site account, with a function that returns a
// current access token.
export class IndexMySite {
  constructor(
    private readonly token: () => Promise<string>,
    private readonly fetcher: typeof fetch = fetch,
    private readonly base: string = INDEXMYSITE_URL,
  ) {}

  private async call<T>(
    path: string,
    init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.token()}`,
      accept: 'application/json',
      'user-agent': userAgent,
    }
    if (init.body !== undefined) headers['content-type'] = 'application/json'
    if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey
    let response: Response
    // Called unbound: Workers reject fetch called as a method of this class.
    const fetcher = this.fetcher
    try {
      response = await fetcher(new URL(path, this.base), {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      throw new CommandError(
        'PROVIDER_ERROR',
        `Index My Site could not be reached (${fetchFailure(error)}). Try again.`,
      )
    }
    if (response.ok) return readJson<T>(response, 'Index My Site')
    const body = await readJsonOrUndefined<{
      error?: string
      message?: string
    }>(response, 'Index My Site')
    const said = body?.message ?? body?.error ?? ''
    const detail = said ? `: ${said}` : ''
    switch (response.status) {
      case 403:
        if (body?.error === 'insufficient_scope') {
          throw new CommandError(
            'NOT_CONNECTED',
            `The Index My Site connection does not allow this (it needs ${(body as { scope?: string }).scope ?? 'more access'}). Connect Index My Site again and approve every permission.`,
          )
        }
        throw new CommandError(
          'NOT_CONNECTED',
          `Index My Site refused the sign-in (HTTP 403${detail}).`,
        )
      case 401:
        throw new CommandError(
          'NOT_CONNECTED',
          `Index My Site refused the sign-in (HTTP ${response.status}${detail}).`,
        )
      case 400:
        throw new CommandError(
          'INVALID_INPUT',
          `Index My Site refused the request${detail || '.'}`,
        )
      case 404:
        throw new CommandError(
          'INVALID_INPUT',
          'Index My Site has no job with that id in this account.',
        )
      case 429:
        throw new CommandError(
          'RATE_LIMITED',
          'Index My Site is rate limiting requests. Wait a minute, then try again.',
        )
      case 503:
        throw new CommandError(
          'PROVIDER_ERROR',
          body?.error === 'submissions_paused'
            ? 'Index My Site has paused new submissions for maintenance. Nothing was sent or charged. Try again later.'
            : 'Index My Site is unavailable. Try again later.',
        )
      default:
        throw new CommandError(
          'PROVIDER_ERROR',
          `Index My Site returned HTTP ${response.status}${detail}.`,
        )
    }
  }

  credits(): Promise<IndexMySiteCredits> {
    return this.call('/api/credits')
  }

  async jobs(): Promise<IndexMySiteJobSummary[]> {
    return (
      await this.call<{ jobs: IndexMySiteJobSummary[] }>('/api/indexing/jobs')
    ).jobs
  }

  async job(id: string): Promise<IndexMySiteJob> {
    return (
      await this.call<{ job: IndexMySiteJob }>(
        `/api/indexing/jobs/${encodeURIComponent(id)}`,
      )
    ).job
  }

  // A repeat with the same key and body returns the first job instead of
  // charging again.
  async createJob(
    job: NewIndexMySiteJob,
    idempotencyKey: string,
  ): Promise<IndexMySiteJob> {
    return (
      await this.call<{ job: IndexMySiteJob }>('/api/indexing/jobs', {
        method: 'POST',
        body: {
          urls: job.urls,
          ...(job.name ? { name: job.name } : {}),
          ...(job.fast ? { fast: true } : {}),
          ...(job.bing ? { bing: true } : {}),
          ...INDEXMYSITE_ATTRIBUTION,
        },
        idempotencyKey,
      })
    ).job
  }

  async approve(
    id: string,
    which: { urlIds: string[] } | { all: true },
  ): Promise<{ approved: number; skippedDuplicates: number }> {
    return this.call(`/api/indexing/jobs/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: which,
    })
  }
}

// What callers use of the client, so surfaces built against core's source
// and its build still agree.
export type IndexMySiteApi = Pick<
  IndexMySite,
  'credits' | 'jobs' | 'job' | 'createJob' | 'approve'
>

// The Idempotency-Key for a job: the same URLs and options on the same UTC
// day give the same key, so a retried confirm never charges twice.
export async function jobKey(
  job: NewIndexMySiteJob,
  now: Date,
): Promise<string> {
  const text = JSON.stringify([
    [...job.urls].sort(),
    Boolean(job.fast),
    Boolean(job.bing),
    job.name ?? '',
    now.toISOString().slice(0, 10),
  ])
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return `seo-${base64Url(new Uint8Array(digest)).slice(0, 40)}`
}
