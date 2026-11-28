import {
  CLICKY_ACCOUNT_KEY,
  CommandError,
  contextText,
  parseSaved,
  SAVED_MAX,
} from '@seo/core/commands'
import { siteIssues } from './audit/schedule.ts'
import { weekData } from './audit/week.ts'
import { betaFlags } from './beta.ts'
import { plansOn } from './billing.ts'
import { refreshClicky } from './clicky.ts'
import { siteContext } from './context.ts'
import { settleCredit } from './credit.ts'
import { directory, freshAccess } from './google.ts'
import { indexMySiteAccess, indexNowKeysOf } from './indexmysite.ts'
import { usageOf } from './meter.ts'
import { seal, unseal } from './seal.ts'
import { cliAgent, userAgentOf } from './signup.ts'
import {
  accountsOf,
  cliLinkById,
  createCliLink,
  issueLogin,
  keysOf,
  LOGIN_TTL,
  removeCliLink,
  touchCliLink,
} from './store.ts'

// `seo login`: the CLI on any machine links to the person's account, then
// asks here for short-lived Google and Bing tokens and the saved keys. The
// CLI makes the Google and Bing calls itself, so Bing works from the
// person's machine although Bing blocks this server's network.
//
// 1. POST /account/cli/start gives the CLI a sealed device value and a code.
// 2. The person opens /account?link=<code> and approves it (account.ts).
// 3. POST /account/cli/token swaps the device value for the CLI's token once.
// 4. GET /account/cli/credentials returns current tokens and keys.
//
// A linked CLI also keeps each site's issues list and business context with
// the account, through /account/cli/issues and /account/cli/context, so it
// and the hosted MCP work from the same ones.

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

const error = (code: string, message: string, status = 400) =>
  json({ error: code, message }, status)

// No 0, O, 1, I or vowels, so a code is easy to read and spells nothing.
const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789'

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

export function loginUrl(env: Env, code: string): string {
  return `${env.PUBLIC_URL}/account?link=${code}`
}

export async function startLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    label?: unknown
    agent?: unknown
  } | null
  const label =
    typeof body?.label === 'string' && body.label.trim()
      ? body.label.trim().slice(0, 60)
      : 'A machine'
  const code = newCode()
  // The agent running the CLI, when it knows, and its user agent: kept only
  // until approval, for a first sign-in from this link.
  const linkId = await createCliLink(env, {
    label,
    code,
    userId: null,
    agent: cliAgent(body?.agent),
    userAgent: userAgentOf(request),
  })
  return json({
    device: await seal(env.SEAL_KEY, {
      k: 'cli-device',
      linkId,
      exp: Date.now() + LOGIN_TTL,
    }),
    code,
    url: loginUrl(env, code),
    interval: 3,
    expiresIn: LOGIN_TTL / 1000,
  })
}

export async function finishLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    device?: unknown
  } | null
  const device = await unseal(
    env.SEAL_KEY,
    typeof body?.device === 'string' ? body.device : null,
    'cli-device',
  )
  if (!device || device.exp < Date.now()) {
    return error('expired', 'This login expired. Run `seo login` again.')
  }
  const link = await cliLinkById(env, device.linkId)
  if (!link) {
    return error('expired', 'This login expired. Run `seo login` again.')
  }
  if (!link.userId) {
    return error('pending', 'Waiting for the person to approve the link.')
  }
  if (!(await issueLogin(env, link.id))) {
    return error('expired', 'This login was already used. Run `seo login`.')
  }
  return json({
    token: await seal(env.SEAL_KEY, { k: 'cli', linkId: link.id }),
  })
}

// A linked CLI's token, and the link it names, or null.
export async function linkOf(request: Request, env: Env) {
  const bearer = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)
  const token = await unseal(env.SEAL_KEY, bearer?.[1], 'cli')
  const link = token ? await cliLinkById(env, token.linkId) : null
  return link?.userId && !link.code ? { ...link, userId: link.userId } : null
}

// A token made on the account page, for a cloud agent's secrets.
export async function newToken(env: Env, userId: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10)
  const linkId = await createCliLink(env, {
    label: `Token made ${date}`,
    code: null,
    userId,
  })
  return seal(env.SEAL_KEY, { k: 'cli', linkId })
}

export const unlinked = () =>
  error(
    'unlinked',
    'This machine is not linked any more. Run `seo login` again.',
    401,
  )

export async function credentials(
  request: Request,
  env: Env,
): Promise<Response> {
  const link = await linkOf(request, env)
  if (!link) return unlinked()
  // The CLI asks again with ?clicky=refresh when a Clicky site is missing.
  if (new URL(request.url).searchParams.get('clicky') === 'refresh') {
    await refreshClicky(env, link.userId).catch(() => null)
  }
  const [accounts, saved, indexmysite, indexnow] = await Promise.all([
    accountsOf(env, link.userId),
    keysOf(env, link.userId),
    // Only a short-lived access token leaves the server, never the
    // refresh token.
    indexMySiteAccess(env, link.userId).catch((failure: unknown) => ({
      error: failure instanceof Error ? failure.message : String(failure),
    })),
    indexNowKeysOf(env, link.userId),
    touchCliLink(env, link.id),
  ])
  // The Clicky account login stays on the server; machines get its sites.
  const { [CLICKY_ACCOUNT_KEY]: _, ...keys } = saved
  const linked = await Promise.all(
    accounts.map(async (account) => {
      const fresh = await freshAccess(env, account).catch(
        (failure: unknown) => ({
          error: failure instanceof Error ? failure.message : String(failure),
        }),
      )
      return { provider: account.provider, label: account.label, ...fresh }
    }),
  )
  return json({
    account: `${env.PUBLIC_URL}/account`,
    google: linked
      .filter((item) => item.provider === 'google')
      .map(({ provider: _, label, ...rest }) => ({ email: label, ...rest })),
    bing: linked
      .filter((item) => item.provider === 'bing')
      .map(({ provider: _, ...rest }) => rest),
    keys,
    indexmysite: indexmysite
      ? { label: 'Index My Site', ...indexmysite }
      : null,
    indexnow,
  })
}

// seo report with no site on a linked machine: the weekly summary's data,
// for an account in the weekly site audit beta.
export async function cliWeek(request: Request, env: Env): Promise<Response> {
  const link = await linkOf(request, env)
  if (!link) return unlinked()
  if (!(await betaFlags(env, link.userId)).has('weekly-audit')) {
    return error(
      'not_in_beta',
      'The weekly summary is for accounts with the weekly site audit.',
      403,
    )
  }
  return json(await weekData(env, link.userId))
}

// seo sites on a linked machine: the account's paid usage (meter.ts), as
// the Usage JSON. 404 not_found while the usage plans are off.
export async function cliUsage(request: Request, env: Env): Promise<Response> {
  const link = await linkOf(request, env)
  if (!link) return unlinked()
  if (!plansOn(env)) {
    return error('not_found', 'This server has no usage plans.', 404)
  }
  const [accounts, keys] = await Promise.all([
    accountsOf(env, link.userId),
    keysOf(env, link.userId),
    touchCliLink(env, link.id),
  ])
  // A credit waiting for a site is decided before it is shown.
  await settleCredit(env, link.userId, directory(env, accounts)).catch(
    (failure) => console.error('credit: settling failed', failure),
  )
  return json(
    await usageOf(env, link.userId, Boolean(keys['x-dataforseo-login'])),
  )
}

// The most a store request body can hold: the longest saved issues list,
// with room for the property.
const STORE_BODY_MAX = SAVED_MAX + 1_000

// GET ?property= reads the site's issues list or business context; PUT with
// {property, issues} or {property, context} replaces it. Both are kept per
// account and property, like the hosted MCP's, and checked as strictly.
export async function cliStore(
  request: Request,
  env: Env,
  kind: 'issues' | 'context',
): Promise<Response> {
  const link = await linkOf(request, env)
  if (!link) return unlinked()
  const validProperty = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 300
  if (request.method === 'GET') {
    const property = new URL(request.url).searchParams.get('property')
    if (!validProperty(property)) {
      return error('invalid_input', 'property is missing or too long.')
    }
    return kind === 'issues'
      ? json({ issues: await siteIssues(env, link.userId).read(property) })
      : json({ context: await siteContext(env, link.userId).read(property) })
  }
  const text = await request.text()
  if (text.length > STORE_BODY_MAX) {
    return error('invalid_input', 'The body is too long. Nothing was saved.')
  }
  let body: { property?: unknown; issues?: unknown; context?: unknown }
  try {
    body = JSON.parse(text) ?? {}
  } catch {
    return error('invalid_input', 'The body is not JSON. Nothing was saved.')
  }
  const { property } = body
  if (!validProperty(property)) {
    return error('invalid_input', 'property is missing or too long.')
  }
  try {
    if (kind === 'issues') {
      const issues = parseSaved(
        JSON.stringify({ version: 1, sites: { [property]: body.issues } }),
        property,
      )
      await siteIssues(env, link.userId).write(property, issues)
    } else {
      const context = (body.context ?? {}) as {
        text?: unknown
        updated_at?: unknown
      }
      const updatedAt =
        typeof context.updated_at === 'string' &&
        Number.isFinite(Date.parse(context.updated_at))
          ? new Date(context.updated_at).toISOString()
          : new Date().toISOString()
      await siteContext(env, link.userId).write(property, {
        text: contextText(String(context.text ?? '')),
        updated_at: updatedAt,
      })
    }
  } catch (failure) {
    if (failure instanceof CommandError) {
      return error('invalid_input', failure.message)
    }
    throw failure
  }
  await touchCliLink(env, link.id)
  return json({ ok: true })
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const link = await linkOf(request, env)
  if (link) await removeCliLink(env, link.id)
  return json({ ok: true })
}
