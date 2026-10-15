import { signInPerson } from './oauth.ts'
import { view } from './page.ts'
import {
  bingSignedIn,
  bingSignInUrl,
  googleSignInUrl,
  revokeGoogle,
} from './providers.ts'
import { type Sealed, seal, unseal } from './seal.ts'
import {
  accountsOf,
  deleteUser,
  keysOf,
  linkAccount,
  removeAccount,
  setKey,
  userExists,
} from './store.ts'

// The account page: the person's linked Google accounts, Bing and research
// keys, with add, remove and delete everything. Google sign-in only; a
// cookie holds the sealed person id for 30 days.

const SESSION_TTL = 30 * 24 * 60 * 60_000
const FORM_TTL = 60 * 60_000
const STATE_TTL = 10 * 60_000
const COOKIE = 'seo_session'

export const KEY_FIELDS: { header: string; label: string; secret: boolean }[] =
  [
    {
      header: 'x-dataforseo-login',
      label: 'DataForSEO API login',
      secret: false,
    },
    {
      header: 'x-dataforseo-password',
      label: 'DataForSEO API password',
      secret: true,
    },
    { header: 'x-ahrefs-key', label: 'Ahrefs API key', secret: true },
  ]

const base = (env: Env) => new URL(env.PUBLIC_URL).pathname.replace(/\/$/, '')
const accountPath = (env: Env) => `${base(env)}/account`

function cookie(env: Env, value: string, maxAge: number): string {
  return `${COOKIE}=${value}; Path=${accountPath(env)}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
}

function redirect(location: string, setCookie?: string): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' })
  if (setCookie) headers.set('set-cookie', setCookie)
  return new Response(null, { status: 303, headers })
}

async function sessionUser(request: Request, env: Env): Promise<string | null> {
  const value = request.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)
  const session = await unseal(env.SEAL_KEY, value, 'session')
  if (!session || !(await userExists(env, session.userId))) return null
  return session.userId
}

function signInPage(env: Env, message = ''): Promise<Response> {
  return view(env, { view: 'signin', message: message || undefined })
}

async function accountPage(
  env: Env,
  userId: string,
  message = '',
): Promise<Response> {
  const [accounts, keys] = await Promise.all([
    accountsOf(env, userId),
    keysOf(env, userId),
  ])
  const bing = accounts.find((account) => account.provider === 'bing')
  return view(env, {
    view: 'account',
    message: message || undefined,
    account: {
      form: await seal(env.SEAL_KEY, {
        k: 'form',
        userId,
        exp: Date.now() + FORM_TTL,
      }),
      google: accounts
        .filter((account) => account.provider === 'google')
        .map((account) => ({ email: account.label, subject: account.subject })),
      bing: bing ? { subject: bing.subject } : null,
      bingReady: Boolean(env.BING_CLIENT_ID),
      keys: KEY_FIELDS.map((field) => field.header).filter(
        (name) => keys[name],
      ),
    },
  })
}

// GET /account and every POST /account/* action.
export async function account(
  request: Request,
  env: Env,
  path: string,
): Promise<Response> {
  const home = `${env.PUBLIC_URL}/account`
  if (request.method === 'GET' && path === '/account') {
    const userId = await sessionUser(request, env)
    return userId ? accountPage(env, userId) : signInPage(env)
  }
  if (request.method !== 'POST') {
    return new Response('Not found', { status: 404 })
  }
  if (path === '/account/signin') {
    return redirect(
      googleSignInUrl(
        env,
        await seal(env.SEAL_KEY, {
          k: 'web',
          userId: null,
          exp: Date.now() + STATE_TTL,
        }),
      ),
    )
  }
  const userId = await sessionUser(request, env)
  const data = await request.formData().catch(() => null)
  const form = await unseal(
    env.SEAL_KEY,
    String(data?.get('form') ?? ''),
    'form',
  )
  if (!userId || form?.userId !== userId) {
    return signInPage(env, 'Your session ended. Sign in again.')
  }
  const field = (name: string) => String(data?.get(name) ?? '').trim()
  switch (path) {
    case '/account/google':
      return redirect(
        googleSignInUrl(
          env,
          await seal(env.SEAL_KEY, {
            k: 'web',
            userId,
            exp: Date.now() + STATE_TTL,
          }),
        ),
      )
    case '/account/bing':
      if (!env.BING_CLIENT_ID) {
        return accountPage(env, userId, 'Bing sign-in is not set up yet.')
      }
      return redirect(
        bingSignInUrl(
          env,
          await seal(env.SEAL_KEY, {
            k: 'bing',
            userId,
            exp: Date.now() + STATE_TTL,
          }),
        ),
      )
    case '/account/remove': {
      const provider = field('provider')
      if (provider !== 'google' && provider !== 'bing') break
      const accounts = await accountsOf(env, userId)
      const target = accounts.find(
        (item) =>
          item.provider === provider && item.subject === field('subject'),
      )
      if (!target) break
      if (
        provider === 'google' &&
        accounts.filter((item) => item.provider === 'google').length < 2
      ) {
        return accountPage(
          env,
          userId,
          'You need one Google account. To remove it, delete everything.',
        )
      }
      await removeAccount(env, userId, provider, target.subject)
      if (provider === 'google') await revokeGoogle(target.refresh)
      return redirect(home)
    }
    case '/account/keys':
      for (const key of KEY_FIELDS) {
        const value = field(key.header)
        if (value) await setKey(env, userId, key.header, value.slice(0, 500))
      }
      return redirect(home)
    case '/account/keys/remove':
      for (const key of KEY_FIELDS) await setKey(env, userId, key.header, null)
      return redirect(home)
    case '/account/delete': {
      const accounts = await accountsOf(env, userId)
      await Promise.all(
        accounts
          .filter((item) => item.provider === 'google')
          .map((item) => revokeGoogle(item.refresh)),
      )
      await deleteUser(env, userId)
      return view(
        env,
        {
          view: 'notice',
          notice: {
            title: 'Deleted',
            text: 'SEO Skill no longer has your Google or Bing sign-ins or keys. Your agents will ask you to sign in again if you use SEO Skill later.',
          },
        },
        200,
        cookie(env, '', 0),
      )
    }
    case '/account/signout':
      return redirect(home, cookie(env, '', 0))
  }
  return redirect(home)
}

// Google sends account page sign-ins to /oauth/callback with a "web" state.
export async function accountCallback(
  request: Request,
  env: Env,
  state: Extract<Sealed, { k: 'web' }>,
): Promise<Response> {
  const code = new URL(request.url).searchParams.get('code')
  if (!code) return redirect(`${env.PUBLIC_URL}/account`)
  if (state.userId && !(await userExists(env, state.userId))) {
    return signInPage(env, 'Your session ended. Sign in again.')
  }
  const userId = await signInPerson(env, code, state.userId)
  if (!userId) {
    return signInPage(env, 'Google did not return a sign-in. Try again.')
  }
  const session = await seal(env.SEAL_KEY, {
    k: 'session',
    userId,
    exp: Date.now() + SESSION_TTL,
  })
  return redirect(
    `${env.PUBLIC_URL}/account`,
    cookie(env, session, SESSION_TTL / 1000),
  )
}

// Bing sends its sign-in back to /oauth/bing/callback.
export async function bingCallback(
  request: Request,
  env: Env,
): Promise<Response> {
  const params = new URL(request.url).searchParams
  const state = await unseal(env.SEAL_KEY, params.get('state'), 'bing')
  const code = params.get('code')
  if (!state || !(await userExists(env, state.userId))) {
    return signInPage(env, 'This Bing sign-in expired. Sign in and try again.')
  }
  if (!code) return redirect(`${env.PUBLIC_URL}/account`)
  const tokens = await bingSignedIn(env, code).catch(() => null)
  if (!tokens?.refresh) {
    return accountPage(
      env,
      state.userId,
      'Bing did not return a sign-in. Try again.',
    )
  }
  // One Bing connection per person; connecting again replaces it.
  await linkAccount(env, state.userId, {
    provider: 'bing',
    subject: state.userId,
    label: 'Bing Webmaster Tools',
    refresh: tokens.refresh,
    access: tokens.access,
    accessExp: tokens.accessExp,
  })
  return redirect(`${env.PUBLIC_URL}/account`)
}
