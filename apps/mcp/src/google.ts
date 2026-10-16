import { bingCall, CommandError, LinkedAccounts } from '@seo/core/commands'
import { refreshBing, refreshGoogle } from './providers.ts'
import { type Account, saveAccess } from './store.ts'

// One person's linked accounts for one request. Access tokens refresh here
// when they expire; the routing of sites to accounts is shared in core.
// Nothing about the sites is kept.

export function accountUrl(env: Env): string {
  return `${env.PUBLIC_URL}/account`
}

// What an agent should do with an account page link: open it for the person,
// wait for them, then try the call again.
export function openForPerson(url: string, task: string): string {
  return `Open ${url} in the person's browser (with \`open <url>\`, \`xdg-open <url>\` or \`start <url>\` when you have a shell, otherwise show them the link), ask them to ${task}, then run the same call again.`
}

export function signInHint(env: Env): string {
  return openForPerson(
    `${accountUrl(env)}#google`,
    'add or reconnect the Google account',
  )
}

// A current access token for a linked account, refreshed and saved when it
// has expired.
export async function freshAccess(
  env: Env,
  account: Account,
): Promise<{ token: string; expiresAt: number }> {
  if (account.access && account.accessExp > Date.now()) {
    return { token: account.access, expiresAt: account.accessExp }
  }
  try {
    const fresh =
      account.provider === 'google'
        ? await refreshGoogle(env, account.refresh)
        : await refreshBing(env, account.refresh)
    await saveAccess(env, account, fresh.access, fresh.accessExp, fresh.refresh)
    return { token: fresh.access, expiresAt: fresh.accessExp }
  } catch {
    throw new CommandError(
      'NOT_CONNECTED',
      `The ${account.provider === 'google' ? 'Google' : 'Bing'} sign-in for ${account.label} expired or was removed. ${signInHint(env)}`,
    )
  }
}

function tokenFor(env: Env, account: Account): () => Promise<string> {
  let token: Promise<string> | undefined
  return () => {
    token ??= freshAccess(env, account).then((fresh) => fresh.token)
    return token
  }
}

// The person's linked accounts for one request, with tokens from D1.
export function directory(env: Env, accounts: Account[]): LinkedAccounts {
  return new LinkedAccounts(
    {
      google: accounts
        .filter((account) => account.provider === 'google')
        .map((account) => ({
          email: account.label,
          token: tokenFor(env, account),
        })),
      bing: accounts
        .filter((account) => account.provider === 'bing')
        .map((account) =>
          bingCall(
            { accessToken: tokenFor(env, account) },
            { signIn: signInHint(env) },
          ),
        ),
    },
    {
      signIn: signInHint(env),
      addGoogle: openForPerson(
        `${accountUrl(env)}#google`,
        'add the Google account that can read it',
      ),
    },
  )
}
