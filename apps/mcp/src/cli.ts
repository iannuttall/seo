import { CLICKY_ACCOUNT_KEY } from '@seo/core/commands'
import { refreshClicky } from './clicky.ts'
import { freshAccess } from './google.ts'
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
async function linkOf(request: Request, env: Env) {
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

const unlinked = () =>
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
  const [accounts, saved] = await Promise.all([
    accountsOf(env, link.userId),
    keysOf(env, link.userId),
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
  })
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const link = await linkOf(request, env)
  if (link) await removeCliLink(env, link.id)
  return json({ ok: true })
}
