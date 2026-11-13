import {
  CommandError,
  exchangeIndexMySiteCode,
  IndexMySite,
  IndexMySiteGrantError,
  indexMySiteAuthorizeUrl,
  pkcePair,
  refreshIndexMySite,
  revokeIndexMySite,
  type SubmitAccess,
} from '@seo/core/commands'
import { accountUrl, openForPerson } from './google.ts'
import { seal, unseal } from './seal.ts'

// Index My Site on the hosted MCP: Connect Index My Site on the account
// page is an OAuth sign-in into the person's Index My Site account, as
// SEO Skill's confidential client. The refresh token and access token are
// sealed in D1 (migrations/0018_indexing.sql) and refreshed here; a linked
// CLI gets only a short-lived access token (cli.ts). seo submit's IndexNow
// keys are kept per person and host.

const STATE_TTL = 10 * 60_000

export const indexMySiteReady = (env: Env) =>
  Boolean(env.INDEXMYSITE_CLIENT_ID && env.INDEXMYSITE_CLIENT_SECRET)

const client = (env: Env) => ({
  clientId: env.INDEXMYSITE_CLIENT_ID,
  clientSecret: env.INDEXMYSITE_CLIENT_SECRET,
})

const redirectUri = (env: Env) => `${env.PUBLIC_URL}/oauth/indexmysite/callback`

const close = (env: Env, value: string) =>
  seal(env.SEAL_KEY, { k: 'secret', value })
const open = async (env: Env, value: string | null) =>
  value ? ((await unseal(env.SEAL_KEY, value, 'secret'))?.value ?? null) : null

// Where the account page's Connect button sends the person.
export async function indexMySiteSignInUrl(
  env: Env,
  userId: string,
): Promise<string> {
  const { verifier, challenge } = await pkcePair()
  return indexMySiteAuthorizeUrl({
    clientId: env.INDEXMYSITE_CLIENT_ID,
    redirectUri: redirectUri(env),
    state: await seal(env.SEAL_KEY, {
      k: 'indexmysite',
      userId,
      verifier,
      exp: Date.now() + STATE_TTL,
    }),
    challenge,
  })
}

// Index My Site sends the person to /oauth/indexmysite/callback, outside
// the account cookie's path, so it passes the code on to the account page,
// which checks the sign-in there.
export function indexMySiteHandOff(request: Request, env: Env): Response {
  const from = new URL(request.url)
  return new Response(null, {
    status: 303,
    headers: {
      location: `${env.PUBLIC_URL}/account/indexmysite/done${from.search}`,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  })
}

// GET /account/indexmysite/done: saves the connection for the signed-in
// person who started it, or says why not. message is null when it
// connected.
export async function indexMySiteCallback(
  request: Request,
  env: Env,
  signedIn: string | null,
): Promise<{ userId: string | null; message: string | null }> {
  const params = new URL(request.url).searchParams
  const state = await unseal(env.SEAL_KEY, params.get('state'), 'indexmysite')
  if (!state) {
    return {
      userId: null,
      message: 'This Index My Site sign-in expired. Try again.',
    }
  }
  // A link someone else started never connects their account here.
  if (state.userId !== signedIn) {
    return {
      userId: null,
      message: 'Sign in, then choose Connect Index My Site again.',
    }
  }
  const code = params.get('code')
  if (!code) {
    return {
      userId: state.userId,
      message: 'Index My Site was not connected.',
    }
  }
  const tokens = await exchangeIndexMySiteCode(client(env), {
    code,
    redirectUri: redirectUri(env),
    verifier: state.verifier,
  }).catch(() => null)
  if (!tokens) {
    return {
      userId: state.userId,
      message: 'Index My Site did not return a sign-in. Try again.',
    }
  }
  await env.DB.prepare(
    `INSERT INTO indexmysite (user_id, refresh, access, access_exp, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET refresh = excluded.refresh,
       access = excluded.access, access_exp = excluded.access_exp,
       created_at = excluded.created_at`,
  )
    .bind(
      state.userId,
      await close(env, tokens.refresh),
      await close(env, tokens.access),
      tokens.accessExp,
      Date.now(),
    )
    .run()
  return { userId: state.userId, message: null }
}

type Row = {
  refresh: string
  access: string | null
  access_exp: number
  created_at: number
}

const rowOf = (env: Env, userId: string) =>
  env.DB.prepare(
    'SELECT refresh, access, access_exp, created_at FROM indexmysite WHERE user_id = ?',
  )
    .bind(userId)
    .first<Row>()

// When the person connected Index My Site, or null.
export async function indexMySiteConnectedAt(
  env: Env,
  userId: string,
): Promise<number | null> {
  return (await rowOf(env, userId))?.created_at ?? null
}

export async function removeIndexMySite(
  env: Env,
  userId: string,
): Promise<void> {
  const row = await rowOf(env, userId)
  if (!row) return
  const refresh = await open(env, row.refresh)
  if (refresh && indexMySiteReady(env)) {
    await revokeIndexMySite(client(env), refresh)
  }
  await env.DB.prepare('DELETE FROM indexmysite WHERE user_id = ?')
    .bind(userId)
    .run()
}

const reconnect = (env: Env) =>
  openForPerson(
    `${accountUrl(env)}#indexmysite`,
    'choose Connect Index My Site',
  )

// A current access token, refreshed and saved (with Index My Site's new
// refresh token) when it is about to expire, or null when the person has
// not connected Index My Site. A refresh token Index My Site no longer
// accepts removes the connection.
export async function indexMySiteAccess(
  env: Env,
  userId: string,
): Promise<{ token: string; expiresAt: number } | null> {
  const row = await rowOf(env, userId)
  if (!row) return null
  const access = await open(env, row.access)
  if (access && row.access_exp > Date.now()) {
    return { token: access, expiresAt: row.access_exp }
  }
  const refresh = await open(env, row.refresh)
  try {
    if (!refresh) throw new IndexMySiteGrantError('unreadable')
    const fresh = await refreshIndexMySite(client(env), refresh)
    await env.DB.prepare(
      'UPDATE indexmysite SET refresh = ?, access = ?, access_exp = ? WHERE user_id = ?',
    )
      .bind(
        await close(env, fresh.refresh),
        await close(env, fresh.access),
        fresh.accessExp,
        userId,
      )
      .run()
    return { token: fresh.access, expiresAt: fresh.accessExp }
  } catch (error) {
    if (error instanceof IndexMySiteGrantError) {
      await env.DB.prepare('DELETE FROM indexmysite WHERE user_id = ?')
        .bind(userId)
        .run()
      throw new CommandError(
        'NOT_CONNECTED',
        `Index My Site no longer accepts this connection (it was removed or replaced). ${reconnect(env)}`,
      )
    }
    throw error
  }
}

export async function indexNowKeysOf(
  env: Env,
  userId: string,
): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare(
    'SELECT host, key FROM indexnow_keys WHERE user_id = ? ORDER BY host LIMIT 500',
  )
    .bind(userId)
    .all<{ host: string; key: string }>()
  return Object.fromEntries(results.map((row) => [row.host, row.key]))
}

// seo submit's access on the hosted MCP.
export function hostedSubmitAccess(env: Env, userId: string): SubmitAccess {
  const connect = indexMySiteReady(env)
    ? reconnect(env)
    : 'Index My Site cannot be connected on this server yet; use the seo CLI with `seo providers indexmysite connect`.'
  return {
    indexNowKey: async (host) =>
      (
        await env.DB.prepare(
          'SELECT key FROM indexnow_keys WHERE user_id = ? AND host = ?',
        )
          .bind(userId, host)
          .first<{ key: string }>()
      )?.key ?? null,
    saveIndexNowKey: async (host, key) => {
      await env.DB.prepare(
        `INSERT INTO indexnow_keys (user_id, host, key) VALUES (?, ?, ?)
         ON CONFLICT (user_id, host) DO UPDATE SET key = excluded.key`,
      )
        .bind(userId, host, key)
        .run()
    },
    indexMySite: async () => {
      if (!(await rowOf(env, userId))) return null
      return new IndexMySite(async () => {
        const fresh = await indexMySiteAccess(env, userId)
        if (!fresh) {
          throw new CommandError(
            'NOT_CONNECTED',
            `Index My Site is not connected. ${connect}`,
          )
        }
        return fresh.token
      })
    },
    connectIndexMySite: async () =>
      (await rowOf(env, userId))
        ? 'Index My Site is connected to this seoskill.dev account.'
        : connect,
    indexMySiteConnect: connect,
  }
}
