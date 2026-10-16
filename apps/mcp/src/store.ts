import { seal, unseal } from './seal.ts'

// The D1 store: people, their linked Google and Bing accounts, their
// research keys and the machines they linked with `seo login`. Refresh tokens, access tokens and keys are sealed with
// SEAL_KEY before they are written. Nothing else is kept.

export type Provider = 'google' | 'bing'

export type Account = {
  provider: Provider
  subject: string
  label: string
  refresh: string
  access: string | null
  accessExp: number
}

type AccountRow = {
  provider: Provider
  subject: string
  label: string
  refresh: string
  access: string | null
  access_exp: number
}

async function open(env: Env, value: string | null): Promise<string | null> {
  if (!value) return null
  return (await unseal(env.SEAL_KEY, value, 'secret'))?.value ?? null
}

const close = (env: Env, value: string) =>
  seal(env.SEAL_KEY, { k: 'secret', value })

export async function userExists(env: Env, userId: string): Promise<boolean> {
  return Boolean(
    await env.DB.prepare('SELECT 1 FROM users WHERE id = ?')
      .bind(userId)
      .first(),
  )
}

// The person who owns a Google or Bing account, if any.
export async function ownerOf(
  env: Env,
  provider: Provider,
  subject: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT user_id FROM accounts WHERE provider = ? AND subject = ?',
  )
    .bind(provider, subject)
    .first<{ user_id: string }>()
  return row?.user_id ?? null
}

export async function createUser(env: Env): Promise<string> {
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)')
    .bind(id, Date.now())
    .run()
  return id
}

// Links an account to a person, or moves it to them. A person left with no
// Google account is deleted, so their old MCP tokens stop working.
export async function linkAccount(
  env: Env,
  userId: string,
  account: Omit<Account, 'access' | 'accessExp'> & {
    access?: string
    accessExp?: number
  },
): Promise<void> {
  const previous = await ownerOf(env, account.provider, account.subject)
  await env.DB.prepare(
    `INSERT INTO accounts (provider, subject, user_id, label, refresh, access, access_exp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, subject) DO UPDATE SET
       user_id = excluded.user_id, label = excluded.label,
       refresh = excluded.refresh, access = excluded.access,
       access_exp = excluded.access_exp`,
  )
    .bind(
      account.provider,
      account.subject,
      userId,
      account.label,
      await close(env, account.refresh),
      account.access ? await close(env, account.access) : null,
      account.accessExp ?? 0,
      Date.now(),
    )
    .run()
  if (previous && previous !== userId) await dropIfEmpty(env, previous)
}

async function dropIfEmpty(env: Env, userId: string): Promise<void> {
  const left = await env.DB.prepare(
    "SELECT 1 FROM accounts WHERE user_id = ? AND provider = 'google'",
  )
    .bind(userId)
    .first()
  if (!left) await deleteUser(env, userId)
}

export async function accountsOf(env: Env, userId: string): Promise<Account[]> {
  const { results } = await env.DB.prepare(
    'SELECT provider, subject, label, refresh, access, access_exp FROM accounts WHERE user_id = ? ORDER BY provider, created_at',
  )
    .bind(userId)
    .all<AccountRow>()
  return Promise.all(
    results.map(async (row) => ({
      provider: row.provider,
      subject: row.subject,
      label: row.label,
      refresh: (await open(env, row.refresh)) ?? '',
      access: await open(env, row.access),
      accessExp: row.access_exp,
    })),
  )
}

export async function saveAccess(
  env: Env,
  account: Pick<Account, 'provider' | 'subject'>,
  access: string,
  accessExp: number,
  refresh?: string,
): Promise<void> {
  if (refresh) {
    await env.DB.prepare(
      'UPDATE accounts SET access = ?, access_exp = ?, refresh = ? WHERE provider = ? AND subject = ?',
    )
      .bind(
        await close(env, access),
        accessExp,
        await close(env, refresh),
        account.provider,
        account.subject,
      )
      .run()
    return
  }
  await env.DB.prepare(
    'UPDATE accounts SET access = ?, access_exp = ? WHERE provider = ? AND subject = ?',
  )
    .bind(
      await close(env, access),
      accessExp,
      account.provider,
      account.subject,
    )
    .run()
}

export async function removeAccount(
  env: Env,
  userId: string,
  provider: Provider,
  subject: string,
): Promise<void> {
  await env.DB.prepare(
    'DELETE FROM accounts WHERE user_id = ? AND provider = ? AND subject = ?',
  )
    .bind(userId, provider, subject)
    .run()
}

export async function keysOf(
  env: Env,
  userId: string,
): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare(
    'SELECT name, value FROM keys WHERE user_id = ?',
  )
    .bind(userId)
    .all<{ name: string; value: string }>()
  const keys: Record<string, string> = {}
  for (const row of results) {
    const value = await open(env, row.value)
    if (value) keys[row.name] = value
  }
  return keys
}

export async function setKey(
  env: Env,
  userId: string,
  name: string,
  value: string | null,
): Promise<void> {
  if (value === null) {
    await env.DB.prepare('DELETE FROM keys WHERE user_id = ? AND name = ?')
      .bind(userId, name)
      .run()
    return
  }
  await env.DB.prepare(
    `INSERT INTO keys (user_id, name, value) VALUES (?, ?, ?)
     ON CONFLICT (user_id, name) DO UPDATE SET value = excluded.value`,
  )
    .bind(userId, name, await close(env, value))
    .run()
}

// Deletes a person and everything kept for them.
export async function deleteUser(env: Env, userId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM keys WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM cli_links WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM accounts WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ])
}

// Machines linked with `seo login`. See migrations/0002_cli_links.sql.

export const LOGIN_TTL = 10 * 60_000

export type CliLink = {
  id: string
  userId: string | null
  label: string
  code: string | null
  createdAt: number
  usedAt: number | null
}

type CliLinkRow = {
  id: string
  user_id: string | null
  label: string
  code: string | null
  created_at: number
  used_at: number | null
}

const cliLink = (row: CliLinkRow): CliLink => ({
  id: row.id,
  userId: row.user_id,
  label: row.label,
  code: row.code,
  createdAt: row.created_at,
  usedAt: row.used_at,
})

// A new link: waiting for approval when it has a code, else already the
// person's (a token made on the account page).
export async function createCliLink(
  env: Env,
  input: { label: string; code: string | null; userId: string | null },
): Promise<string> {
  const id = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM cli_links WHERE code IS NOT NULL AND created_at < ?',
    ).bind(Date.now() - LOGIN_TTL),
    env.DB.prepare(
      'INSERT INTO cli_links (id, user_id, label, code, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(id, input.userId, input.label, input.code, Date.now()),
  ])
  return id
}

export async function cliLinkById(
  env: Env,
  id: string,
): Promise<CliLink | null> {
  const row = await env.DB.prepare('SELECT * FROM cli_links WHERE id = ?')
    .bind(id)
    .first<CliLinkRow>()
  return row ? cliLink(row) : null
}

// A login still waiting for approval, by the code the person sees.
export async function pendingLogin(
  env: Env,
  code: string,
): Promise<CliLink | null> {
  const row = await env.DB.prepare(
    'SELECT * FROM cli_links WHERE code = ? AND user_id IS NULL AND created_at > ?',
  )
    .bind(code, Date.now() - LOGIN_TTL)
    .first<CliLinkRow>()
  return row ? cliLink(row) : null
}

export async function approveLogin(
  env: Env,
  code: string,
  userId: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    'UPDATE cli_links SET user_id = ? WHERE code = ? AND user_id IS NULL AND created_at > ?',
  )
    .bind(userId, code, Date.now() - LOGIN_TTL)
    .run()
  return result.meta.changes > 0
}

// Clears the code once the CLI has its token, so it is issued only once.
export async function issueLogin(env: Env, id: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'UPDATE cli_links SET code = NULL, used_at = ? WHERE id = ? AND user_id IS NOT NULL AND code IS NOT NULL',
  )
    .bind(Date.now(), id)
    .run()
  return result.meta.changes > 0
}

export async function touchCliLink(env: Env, id: string): Promise<void> {
  await env.DB.prepare('UPDATE cli_links SET used_at = ? WHERE id = ?')
    .bind(Date.now(), id)
    .run()
}

export async function cliLinksOf(env: Env, userId: string): Promise<CliLink[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM cli_links WHERE user_id = ? AND code IS NULL ORDER BY created_at',
  )
    .bind(userId)
    .all<CliLinkRow>()
  return results.map(cliLink)
}

export async function removeCliLink(
  env: Env,
  id: string,
  userId?: string,
): Promise<void> {
  await (userId
    ? env.DB.prepare('DELETE FROM cli_links WHERE id = ? AND user_id = ?').bind(
        id,
        userId,
      )
    : env.DB.prepare('DELETE FROM cli_links WHERE id = ?').bind(id)
  ).run()
}
