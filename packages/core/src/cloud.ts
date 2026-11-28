import { hostname } from 'node:os'
import { join } from 'node:path'
import open from 'open'
import { type BingCall, bingCall } from './bing/api.js'
import type { ContextStore, SiteContext } from './commands/context.js'
import type { FeedbackReport } from './commands/feedback.js'
import type { IssueStore, StoredIssue } from './commands/issues.js'
import { bingRouter, LinkedAccounts } from './commands/linked.js'
import type { ProgressPoint, ProgressStore } from './commands/progress.js'
import type { ProgressRun } from './commands/progress-track.js'
import type { Usage } from './commands/usage.js'
import type { WeekData } from './commands/week.js'
import { SeoError } from './errors.js'
import { readJson } from './http/read-json.js'
import { ensureSeoCliDirs, getSeoCliPaths } from './paths.js'
import { readJsonFile, safeRemove, writeJsonAtomic } from './storage/files.js'
import { detectAgentName, getTelemetryStatus } from './telemetry.js'
import { SEO_VERSION } from './version.js'

// A CLI linked to a seoskill.dev account with `seo login`. The account keeps
// the person's Google and Bing sign-ins and research keys; this machine asks
// for short-lived tokens and makes the Google and Bing calls itself. Only the
// issues list and business context go back, to be kept with the account. SEO_TOKEN, made on the account page, links a cloud agent
// without a login step.

export const CLOUD_URL = 'https://seoskill.dev'
const PRIVATE = 0o600
const EARLY = 60_000

type Link = { token: string }
type Pending = { device: string; code: string; url: string; expiresAt: number }
type Token = { token: string; expiresAt: number } | { error: string }
export type CloudCredentials = {
  account: string
  google: ({ email: string } & Token)[]
  bing: ({ label: string } & Token)[]
  keys: Record<string, string>
  // The account's Index My Site connection, as a short-lived access token,
  // or null when it has none. Absent from older servers.
  indexmysite?: ({ label: string } & Token) | null
  // IndexNow keys saved on the account, by host.
  indexnow?: Record<string, string>
}

const linkFile = () => join(getSeoCliPaths().configDir, 'cloud.json')
const pendingFile = () => join(getSeoCliPaths().configDir, 'cloud-login.json')

function cloudToken(): string | undefined {
  const fromEnv = process.env.SEO_TOKEN?.trim()
  if (fromEnv) return fromEnv
  return readJsonFile<Link>(linkFile())?.token
}

// Whether this machine uses a seoskill.dev account for its sign-ins.
export function cloudLinked(): boolean {
  return Boolean(cloudToken())
}

export const CLOUD_SIGN_IN =
  'Run `seo login` to link this machine to your seoskill.dev account again.'

async function call<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ ok: boolean; status: number; body: T }> {
  const response = await fetch(`${CLOUD_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'user-agent': `seo/${SEO_VERSION}`,
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
  }).catch(() => {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `Could not reach ${CLOUD_URL}. Check the network and try again.`,
    )
  })
  const body = await readJson<T>(response, 'seoskill.dev').catch(
    () => ({}) as T,
  )
  return { ok: response.ok, status: response.status, body }
}

let credentials: Promise<CloudCredentials> | undefined

function expiresSoon(value: CloudCredentials): boolean {
  return [
    ...value.google,
    ...value.bing,
    ...(value.indexmysite ? [value.indexmysite] : []),
  ].some((item) => 'expiresAt' in item && item.expiresAt - EARLY < Date.now())
}

// The account's linked sign-ins and keys, fetched once and again when a
// token is about to expire. With refreshClicky, the account first reads its
// saved Clicky account's site list again.
export async function cloudCredentials(
  options: { refreshClicky?: boolean } = {},
): Promise<CloudCredentials> {
  const current = credentials ? await credentials.catch(() => null) : null
  if (current && !expiresSoon(current) && !options.refreshClicky) {
    return current
  }
  credentials = (async () => {
    const token = cloudToken()
    if (!token) throw new SeoError('AUTH_REQUIRED', notSignedIn())
    const result = await call<CloudCredentials & { message?: string }>(
      `/account/cli/credentials${options.refreshClicky ? '?clicky=refresh' : ''}`,
      { token },
    )
    if (result.status === 401) {
      throw new SeoError(
        'AUTH_EXPIRED',
        `This machine is not linked to a seoskill.dev account any more. ${CLOUD_SIGN_IN}`,
      )
    }
    if (!result.ok) {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        `seoskill.dev returned ${result.status}. Try again in a minute.`,
      )
    }
    return result.body
  })()
  return credentials
}

// seo report with no site: the weekly summary from the linked seoskill.dev
// account, or null when the account is not in the weekly site audit beta.
export async function cloudWeek(): Promise<WeekData | null> {
  const token = cloudToken()
  if (!token) throw new SeoError('AUTH_REQUIRED', notSignedIn())
  const result = await call<WeekData & { message?: string }>(
    '/account/cli/week',
    { token },
  )
  if (result.status === 401) {
    throw new SeoError(
      'AUTH_EXPIRED',
      `This machine is not linked to a seoskill.dev account any more. ${CLOUD_SIGN_IN}`,
    )
  }
  if (result.status === 403) return null
  if (!result.ok) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `seoskill.dev returned ${result.status}. Try again in a minute.`,
    )
  }
  return result.body
}

// The linked account's paid usage for seo_sites and `seo sites`:
// undefined when the server has no usage plans (it answers 404), null when
// it could not be read, so a listing never fails over it.
export async function cloudUsage(): Promise<Usage | null | undefined> {
  const token = cloudToken()
  if (!token) return undefined
  const result = await call<Usage>('/account/cli/usage', { token }).catch(
    () => null,
  )
  if (result?.status === 404) return undefined
  return result?.ok && typeof result.body.empty === 'boolean'
    ? result.body
    : null
}

// A request to the account's issues list or business context store, with
// the same answers to an unlinked or failing account as the other calls.
async function storeCall<T>(
  kind: 'issues' | 'context' | 'progress',
  init: RequestInit & { property?: string } = {},
): Promise<T> {
  const token = cloudToken()
  if (!token) throw new SeoError('AUTH_REQUIRED', notSignedIn())
  const query = init.property
    ? `?property=${encodeURIComponent(init.property)}`
    : ''
  const result = await call<T & { message?: string }>(
    `/account/cli/${kind}${query}`,
    { ...init, token },
  )
  if (result.status === 401) {
    throw new SeoError(
      'AUTH_EXPIRED',
      `This machine is not linked to a seoskill.dev account any more. ${CLOUD_SIGN_IN}`,
    )
  }
  if (result.status === 400) {
    throw new SeoError(
      'INVALID_INPUT',
      result.body.message ?? 'seoskill.dev refused the request.',
    )
  }
  if (!result.ok) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `seoskill.dev returned ${result.status}. Try again in a minute.`,
    )
  }
  return result.body
}

// Each site's issues list and business context, kept with the linked
// account, so this machine and the hosted MCP work from the same ones.
export const cloudIssues: IssueStore = {
  read: async (site) =>
    (await storeCall<{ issues?: StoredIssue[] }>('issues', { property: site }))
      .issues ?? [],
  write: async (site, issues) => {
    await storeCall('issues', {
      method: 'PUT',
      body: JSON.stringify({ property: site, issues }),
    })
  },
}

export const cloudContext: ContextStore = {
  read: async (site) =>
    (
      await storeCall<{ context?: SiteContext | null }>('context', {
        property: site,
      })
    ).context ?? null,
  write: async (site, context) => {
    await storeCall('context', {
      method: 'PUT',
      body: JSON.stringify({ property: site, context }),
    })
  },
}

// Each site's weekly progress points and tracking runs, kept with the
// linked account (seo report section progress). Points are added, never
// replaced, so the baseline stays as it was saved.
const readProgress = (site: string) =>
  storeCall<{ points: ProgressPoint[]; runs: ProgressRun[] }>('progress', {
    property: site,
  })

const addProgress = (body: Record<string, unknown>) =>
  storeCall<{ added?: boolean }>('progress', {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const cloudProgress: ProgressStore = {
  points: async (site) => (await readProgress(site)).points,
  addPoint: async (site, point) =>
    (await addProgress({ property: site, point })).added === true,
  runs: async (site) => (await readProgress(site)).runs,
  saveRun: async (site, run) => {
    await addProgress({ property: site, run })
  },
}

// What to tell someone with no sign-in on this machine.
export function notSignedIn(): string {
  return 'Not signed in. Run `seo login` to use your seoskill.dev account on this machine (it prints a link to approve), or `seo auth login` to sign in with Google on this machine only. `seo crawl --url <url>` works without sign-in.'
}

function tokenOf(item: Token, what: string): string {
  if ('error' in item) {
    throw new SeoError('AUTH_EXPIRED', `${what}: ${item.error}`)
  }
  return item.token
}

// A current Google access token for one linked account, or the first.
export async function cloudGoogleToken(email?: string): Promise<string> {
  const { google, account } = await cloudCredentials()
  const found = email
    ? google.find((item) => item.email.toLowerCase() === email.toLowerCase())
    : google[0]
  if (!found) {
    throw new SeoError(
      'AUTH_REQUIRED',
      email
        ? `${email} is not linked to your seoskill.dev account. Add it at ${account}#google.`
        : `No Google account is linked to your seoskill.dev account. Add one at ${account}#google.`,
    )
  }
  return tokenOf(found, `Google sign-in for ${found.email}`)
}

export async function cloudGoogleEmails(): Promise<string[]> {
  return (await cloudCredentials()).google.map((item) => item.email)
}

let linked: Promise<LinkedAccounts> | undefined

// The linked Google account that reads a site, when this machine is linked
// and the account has more than one; else undefined. Same routing as the
// hosted MCP: the account with the most access to the property.
export async function cloudAccountFor(
  site: string,
): Promise<string | undefined> {
  if (!cloudLinked()) return undefined
  linked ??= cloudGoogleEmails().then(
    (emails) =>
      new LinkedAccounts(
        {
          google: emails.map((email) => ({
            email,
            token: () => cloudGoogleToken(email),
          })),
          bing: [],
        },
        {
          signIn: CLOUD_SIGN_IN,
          addGoogle: 'Add it on your seoskill.dev account page.',
        },
      ),
  )
  const accounts = await linked
  if (accounts.google.length < 2) return accounts.google[0]?.email
  return (await accounts.owner(site)).email
}

// Bing calls from this machine with the account's Bing sign-ins, or null
// when none is linked.
export async function cloudBing(): Promise<BingCall | null> {
  const { bing, account } = await cloudCredentials()
  return bingRouter(
    bing.map((_, index) =>
      bingCall(
        {
          accessToken: async () => {
            const item = (await cloudCredentials()).bing[index]
            if (!item) throw new SeoError('AUTH_EXPIRED', CLOUD_SIGN_IN)
            return tokenOf(item, 'Bing sign-in')
          },
        },
        { signIn: `Reconnect Bing at ${account}#bing.` },
      ),
    ),
  )
}

export async function cloudKeys(): Promise<Record<string, string>> {
  return (await cloudCredentials()).keys
}

// A current Index My Site access token from the linked account, or null
// when the account has not connected Index My Site. fresh asks the account
// again, such as after the person connected it.
export async function cloudIndexMySiteToken(
  options: { fresh?: boolean } = {},
): Promise<string | null> {
  if (options.fresh) credentials = undefined
  const { indexmysite, account } = await cloudCredentials()
  if (!indexmysite) return null
  return tokenOf(
    indexmysite,
    `Index My Site sign-in. Reconnect it at ${account}#indexmysite`,
  )
}

export async function cloudIndexNowKeys(): Promise<Record<string, string>> {
  return (await cloudCredentials()).indexnow ?? {}
}

export const cloudAccountUrl = () => `${CLOUD_URL}/account`

// seo feedback from the CLI or the local MCP: one POST to the hosted
// server, which forwards it to the maintainer. A linked machine sends its
// token so the report names the account; otherwise it is anonymous.
export async function cloudFeedback(report: FeedbackReport): Promise<void> {
  const result = await call<{ message?: string }>('/mcp/feedback', {
    method: 'POST',
    token: cloudToken(),
    body: JSON.stringify({ ...report, agent: detectAgentName() ?? undefined }),
  })
  if (result.status === 429) {
    throw new SeoError(
      'RATE_LIMITED',
      'Too much feedback from here today. Try again tomorrow, or open an issue at https://github.com/iannuttall/seo/issues.',
    )
  }
  if (result.status === 400) {
    throw new SeoError(
      'INVALID_INPUT',
      result.body.message ?? 'seoskill.dev refused the feedback.',
    )
  }
  if (!result.ok) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `seoskill.dev returned ${result.status}. Try again in a minute.`,
    )
  }
}

// `seo login`, step one: a code for the person to approve on the account
// page. The pending login is kept until it is approved or expires. The agent
// running the CLI, when it can tell and usage counts are on, is sent so the
// account can record where a new person came from.
export async function startCloudLogin(): Promise<Pending> {
  const result = await call<{
    device?: string
    code?: string
    url?: string
    expiresIn?: number
  }>('/account/cli/start', {
    method: 'POST',
    body: JSON.stringify({
      label: `seo on ${hostname().split('.')[0] || 'this machine'}`.slice(
        0,
        60,
      ),
      agent: getTelemetryStatus().enabled ? detectAgentName() : undefined,
    }),
  })
  const { device, code, url, expiresIn } = result.body
  if (!result.ok || !device || !code || !url) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `seoskill.dev could not start a login (${result.status}). Try again.`,
    )
  }
  const pending = {
    device,
    code,
    url,
    expiresAt: Date.now() + (expiresIn ?? 600) * 1000,
  }
  ensureSeoCliDirs()
  writeJsonAtomic(pendingFile(), pending, PRIVATE)
  return pending
}

export function pendingCloudLogin(): Pending | null {
  const pending = readJsonFile<Pending>(pendingFile())
  if (!pending || pending.expiresAt < Date.now()) return null
  return pending
}

// `seo login`, step two: once the person approved, the CLI's token is saved.
export async function finishCloudLogin(): Promise<
  'linked' | 'pending' | 'expired'
> {
  const pending = pendingCloudLogin()
  if (!pending) return 'expired'
  const result = await call<{ token?: string; error?: string }>(
    '/account/cli/token',
    { method: 'POST', body: JSON.stringify({ device: pending.device }) },
  )
  if (result.body.error === 'pending') return 'pending'
  safeRemove(pendingFile())
  if (!result.ok || !result.body.token) return 'expired'
  writeJsonAtomic(linkFile(), { token: result.body.token }, PRIVATE)
  credentials = undefined
  return 'linked'
}

// `seo logout`: removes this machine from the account and forgets the link.
export async function cloudLogout(): Promise<boolean> {
  const token = readJsonFile<Link>(linkFile())?.token
  if (!token) return false
  await call('/account/cli/logout', { method: 'POST', token }).catch(
    () => undefined,
  )
  safeRemove(linkFile())
  credentials = undefined
  return true
}

// Opens the approval page in this machine's browser when there is one.
export async function openCloudLink(url: string): Promise<void> {
  await open(url).catch(() => undefined)
}
