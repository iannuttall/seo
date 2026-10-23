import {
  bingCall,
  CLICKY_KEY_PREFIX,
  ClickyError,
  clickyDomain,
  clickyKeyValue,
  clickyLogin,
  clickySites,
  isClickySiteId,
  isClickySitekey,
  listBingSites,
} from '@seo/core/commands'
import { ALERTS, isAlertType } from './alerts/registry.ts'
import {
  alertSettings,
  rotateSecret,
  saveAlertSettings,
  turnOff,
  webhookUrlProblem,
} from './alerts/settings.ts'
import { forgetChoices, propertyChoices } from './audit/choices.ts'
import {
  addProperties,
  recordAdded,
  writeSignInUrl,
} from './audit/properties.ts'
import {
  addAuditSite,
  auditSites,
  MAX_SITES,
  removeAllAuditSites,
  removeAuditSite,
} from './audit/schedule.ts'
import { BETA, betaFlags } from './beta.ts'
import { loginUrl, newToken } from './cli.ts'
import { importClicky, removeClickyAccount } from './clicky.ts'
import { directory } from './google.ts'
import { signInPerson } from './oauth.ts'
import { view } from './page.ts'
import {
  bingSignedIn,
  bingSignInUrl,
  googleSignInUrl,
  revokeGoogle,
} from './providers.ts'
import { type Sealed, seal, unseal } from './seal.ts'
import { firstTouch, userAgentOf } from './signup.ts'
import {
  accountsOf,
  approveLogin,
  cliLinksOf,
  deleteUser,
  keysOf,
  linkAccount,
  pendingLogin,
  removeAccount,
  removeCliLink,
  setKey,
  userExists,
} from './store.ts'

// The account page: the person's linked Google accounts, Bing, research
// keys, Clicky sites and machines linked with `seo login`, with add, remove
// and delete everything. Google sign-in only; a cookie holds the sealed person id for
// 30 days.

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
    { header: 'x-typesafe-key', label: 'TypeSafe API key', secret: true },
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

function signInPage(env: Env, message = '', link?: string): Promise<Response> {
  return view(env, {
    view: 'signin',
    message: message || undefined,
    ...(link ? { link } : {}),
  })
}

// A `seo login` code from the link the CLI printed, if it looks like one.
const linkCode = (value: string | null) =>
  value && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value) ? value : undefined

async function accountPage(
  env: Env,
  userId: string,
  message = '',
  extra: { link?: string; token?: string; tab?: string; ok?: boolean } = {},
): Promise<Response> {
  const [accounts, keys, machines, login, beta] = await Promise.all([
    accountsOf(env, userId),
    keysOf(env, userId),
    cliLinksOf(env, userId),
    extra.link ? pendingLogin(env, extra.link) : null,
    betaFlags(env, userId),
  ])
  const audits = beta.has('weekly-audit') ? await auditSites(env, userId) : []
  const alerts = await alertSettings(env, userId)
  const held = alerts.types.length
    ? await env.DB.prepare(
        "SELECT count(*) AS n FROM alerts WHERE user_id = ? AND email = 'held'",
      )
        .bind(userId)
        .first<{ n: number }>()
    : null
  return view(env, {
    view: 'account',
    message:
      (extra.link && !login
        ? 'This link expired or was already used. Run `seo login` again.'
        : message) || undefined,
    // Every account page message is an error unless the caller says ok.
    error: Boolean(message || (extra.link && !login)) && !extra.ok,
    account: {
      form: await seal(env.SEAL_KEY, {
        k: 'form',
        userId,
        exp: Date.now() + FORM_TTL,
      }),
      google: accounts
        .filter((account) => account.provider === 'google')
        .map((account) => ({ email: account.label, subject: account.subject })),
      bing: accounts
        .filter((account) => account.provider === 'bing')
        .map((account) => ({ label: account.label, subject: account.subject })),
      bingReady: Boolean(env.BING_CLIENT_ID),
      keys: KEY_FIELDS.map((field) => field.header).filter(
        (name) => keys[name],
      ),
      clicky: clickySites(new Headers(keys)).map(
        ({ siteId, domain, account }) => ({ siteId, domain, account }),
      ),
      clickyAccount: clickyLogin(new Headers(keys))?.username ?? null,
      machines: machines.map((machine) => ({
        id: machine.id,
        label: machine.label,
        usedAt: machine.usedAt,
      })),
      ...(login
        ? { login: { code: login.code ?? '', label: login.label } }
        : {}),
      // Only granted beta features; none for everyone else.
      ...(beta.size
        ? {
            beta: [...beta].sort().map((id) => ({
              id,
              title: BETA[id].title,
              text: BETA[id].text,
            })),
            ...(beta.has('weekly-audit')
              ? {
                  audit: {
                    max: MAX_SITES,
                    sites: audits.map((site) => ({
                      property: site.property,
                      lastFinishedAt: site.lastFinishedAt,
                      lastStatus: site.lastStatus,
                      pages: site.pagesFetched,
                      open: site.openFindings,
                      new: site.newFindings,
                      error: site.lastError,
                      coverage: site.coverage,
                      nextRunAt: site.nextRunAt,
                      monitor: site.monitor,
                    })),
                  },
                }
              : {}),
            ...(alerts.types.length
              ? {
                  alerts: {
                    email:
                      accounts.find((item) => item.provider === 'google')
                        ?.label ?? null,
                    types: alerts.types.map((item) => ({
                      ...item,
                      title: ALERTS[item.id].title,
                      text: ALERTS[item.id].text,
                    })),
                    webhookUrl: alerts.webhookUrl,
                    webhookSecret: alerts.webhookSecret,
                    webhookLast: alerts.webhookLast,
                    held: held?.n ?? 0,
                  },
                }
              : {}),
          }
        : {}),
      ...(extra.token ? { token: extra.token } : {}),
      ...(extra.tab ? { tab: extra.tab } : {}),
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
    const link = linkCode(new URL(request.url).searchParams.get('link'))
    return userId
      ? accountPage(env, userId, '', { link })
      : signInPage(env, '', link)
  }
  // The link in an alert email, opened (GET) or one-click (POST, RFC 8058).
  if (path === '/account/alerts/off') {
    return alertsOff(request, env)
  }
  // The Sites tab's property picker: what the linked Google accounts can
  // read, fetched once when the picker opens.
  if (request.method === 'GET' && path === '/account/audit/choices') {
    const userId = await sessionUser(request, env)
    if (!userId || !(await betaFlags(env, userId)).has('weekly-audit')) {
      return Response.json({ error: 'not_signed_in' }, { status: 403 })
    }
    const [found, audited] = await Promise.all([
      propertyChoices(env, userId, await accountsOf(env, userId)),
      auditSites(env, userId),
    ])
    const added = new Set(audited.map((site) => site.property))
    return Response.json(
      {
        choices: found.choices.map((item) => ({
          ...item,
          audited: added.has(item.property),
        })),
        failed: found.failed,
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  }
  if (request.method !== 'POST') {
    return new Response('Not found', { status: 404 })
  }
  const data = await request.formData().catch(() => null)
  if (path === '/account/signin') {
    const link = linkCode(String(data?.get('link') ?? ''))
    return redirect(
      googleSignInUrl(
        env,
        await seal(env.SEAL_KEY, {
          k: 'web',
          userId: null,
          ...(link ? { link } : {}),
          exp: Date.now() + STATE_TTL,
        }),
      ),
    )
  }
  const userId = await sessionUser(request, env)
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
      forgetChoices(userId)
      if (provider === 'google') await revokeGoogle(target.refresh)
      return redirect(`${home}#${provider}`)
    }
    case '/account/link': {
      const code = linkCode(field('code'))
      if (code && (await approveLogin(env, code, userId))) {
        return accountPage(
          env,
          userId,
          'Linked. Go back to your terminal or agent: `seo login` finishes there.',
          { ok: true },
        )
      }
      return accountPage(
        env,
        userId,
        'This link expired or was already used. Run `seo login` again.',
      )
    }
    case '/account/cli/new':
      return accountPage(env, userId, '', {
        token: await newToken(env, userId),
      })
    case '/account/cli/remove':
      await removeCliLink(env, field('id'), userId)
      return redirect(`${home}#machines`)
    case '/account/keys':
      for (const key of KEY_FIELDS) {
        const value = field(key.header)
        if (value) await setKey(env, userId, key.header, value.slice(0, 500))
      }
      return redirect(`${home}#keys`)
    case '/account/keys/remove':
      for (const key of KEY_FIELDS) await setKey(env, userId, key.header, null)
      return redirect(`${home}#keys`)
    case '/account/clicky': {
      const siteId = field('clicky-site')
      const sitekey = field('clicky-sitekey')
      if (!isClickySiteId(siteId) || !isClickySitekey(sitekey)) {
        return accountPage(
          env,
          userId,
          'Clicky needs the numeric site ID and the sitekey from Clicky (Preferences, Info).',
          { tab: 'keys' },
        )
      }
      // Checks the key, and finds the site's domain so agents can name it.
      const domain = await clickyDomain({ siteId, sitekey }).catch(
        (failure: unknown) => failure as Error,
      )
      if (domain instanceof Error) {
        return accountPage(
          env,
          userId,
          domain instanceof ClickyError && domain.code === 'auth'
            ? 'Clicky did not accept that site ID and sitekey. Check them in Clicky (Preferences, Info).'
            : 'Could not check the key with Clicky. Try again in a minute.',
          { tab: 'keys' },
        )
      }
      await setKey(
        env,
        userId,
        `${CLICKY_KEY_PREFIX}${siteId}`,
        clickyKeyValue(sitekey, domain),
      )
      return redirect(`${home}#clicky`)
    }
    case '/account/clicky/account': {
      const username = field('clicky-username').slice(0, 200)
      const password = String(data?.get('clicky-password') ?? '').slice(0, 200)
      if (!username || !password) {
        return accountPage(
          env,
          userId,
          'Clicky needs your Clicky username or email and your Clicky password.',
          { tab: 'keys' },
        )
      }
      const change = await importClicky(env, userId, {
        username,
        password,
      }).catch((failure: unknown) => failure as Error)
      if (change instanceof Error) {
        return accountPage(
          env,
          userId,
          change instanceof ClickyError && change.code === 'auth'
            ? 'Clicky did not accept that username and password. This does not work if your Clicky account uses two-factor sign-in or Sign in with Google. Add each site below instead.'
            : 'Could not reach Clicky. Try again in a minute.',
          { tab: 'keys' },
        )
      }
      const count = Object.keys(change.set).length - 1
      return accountPage(
        env,
        userId,
        `Clicky account saved: ${count} site${count === 1 ? '' : 's'}. New Clicky sites appear when an agent asks for them.`,
        { tab: 'keys', ok: true },
      )
    }
    case '/account/clicky/account/remove':
      await removeClickyAccount(env, userId)
      return redirect(`${home}#clicky`)
    case '/account/clicky/remove': {
      const siteId = field('id')
      if (isClickySiteId(siteId)) {
        await setKey(env, userId, `${CLICKY_KEY_PREFIX}${siteId}`, null)
      }
      return redirect(`${home}#clicky`)
    }
    case '/account/audit': {
      if (!(await betaFlags(env, userId)).has('weekly-audit')) break
      // Only a property from the picker's list: one the person's Google
      // accounts can read, from the same short-lived cache.
      const wanted = field('property')
      const property = (
        await propertyChoices(env, userId, await accountsOf(env, userId))
      ).choices.find((item) => item.property === wanted)?.property
      if (!property) {
        return accountPage(
          env,
          userId,
          'None of your linked Google accounts can read that property in Search Console. Pick one from the list.',
          { tab: 'sites' },
        )
      }
      const added = await addAuditSite(env, userId, property)
      return accountPage(
        env,
        userId,
        added === 'full'
          ? `The beta audits up to ${MAX_SITES} sites. Remove one first.`
          : added === 'exists'
            ? `${property} is already audited.`
            : `Added ${property}. The first crawl has started.`,
        { tab: 'sites', ok: added !== 'full' },
      )
    }
    // Create the suggested folders as Search Console properties: ask for the
    // write scope now, for the Google account that reads the site.
    case '/account/audit/properties': {
      if (!(await betaFlags(env, userId)).has('weekly-audit')) break
      const property = field('property')
      const site = (await auditSites(env, userId)).find(
        (item) => item.property === property,
      )
      const owner = site?.coverage?.suggestions.some((item) => !item.added)
        ? await directory(env, await accountsOf(env, userId))
            .owner(property)
            .catch(() => null)
        : null
      if (!owner) return redirect(`${home}#sites`)
      return redirect(
        writeSignInUrl(
          env,
          await seal(env.SEAL_KEY, {
            k: 'gsc-write',
            userId,
            property,
            exp: Date.now() + STATE_TTL,
          }),
          owner.email,
        ),
      )
    }
    case '/account/alerts': {
      const settings = await alertSettings(env, userId)
      if (!settings.types.length) break
      const url = field('webhook_url') || null
      const problem = url ? webhookUrlProblem(url) : null
      if (problem) {
        return accountPage(env, userId, problem, { tab: 'beta' })
      }
      await saveAlertSettings(env, userId, {
        types: settings.types.map((item) => ({
          id: item.id,
          email: data?.get(`email:${item.id}`) === 'on',
          webhook: data?.get(`webhook:${item.id}`) === 'on',
        })),
        webhookUrl: url,
      })
      return accountPage(env, userId, 'Saved your alert settings.', {
        tab: 'beta',
        ok: true,
      })
    }
    case '/account/alerts/secret':
      await rotateSecret(env, userId)
      return accountPage(
        env,
        userId,
        'Made a new signing secret. Update it where you check webhook signatures.',
        { tab: 'beta', ok: true },
      )
    case '/account/audit/remove':
      await removeAuditSite(env, userId, field('property'))
      return redirect(`${home}#sites`)
    case '/account/delete': {
      await removeAllAuditSites(env, userId)
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
            text: 'SEO Skill no longer has your Google or Bing sign-ins, keys or linked machines. Your agents will ask you to sign in again if you use SEO Skill later.',
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
  const userId = await signInPerson(env, code, state.userId, async () => {
    // A sign-in from a `seo login` link counts as the CLI's.
    const login = state.link ? await pendingLogin(env, state.link) : null
    return {
      entry: state.link ? 'cli' : 'web',
      client: login?.agent ?? null,
      clientName: null,
      userAgent: state.link ? (login?.userAgent ?? null) : userAgentOf(request),
      ...firstTouch(request),
    }
  })
  if (!userId) {
    return signInPage(env, 'Google did not return a sign-in. Try again.')
  }
  // A newly linked Google account can read more properties.
  forgetChoices(userId)
  const session = await seal(env.SEAL_KEY, {
    k: 'session',
    userId,
    exp: Date.now() + SESSION_TTL,
  })
  return redirect(
    state.link ? loginUrl(env, state.link) : `${env.PUBLIC_URL}/account`,
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
  // Bing's sign-in names no account, so each link gets its own id and is
  // named by its sites. Linking the same sites again replaces that link.
  const label = await bingLabel(tokens.access)
  const existing = (await accountsOf(env, state.userId)).find(
    (item) => item.provider === 'bing' && item.label === label,
  )
  await linkAccount(env, state.userId, {
    provider: 'bing',
    subject: existing?.subject ?? crypto.randomUUID(),
    label,
    refresh: tokens.refresh,
    access: tokens.access,
    accessExp: tokens.accessExp,
  })
  return redirect(`${env.PUBLIC_URL}/account`)
}

// "example.com and 31 more", from the account's verified sites.
async function bingLabel(access: string): Promise<string> {
  const sites = await listBingSites(
    bingCall({ accessToken: () => access }, { signIn: '' }),
  ).catch(() => null)
  const verified = (sites ?? [])
    .filter((site) => site.verified)
    .map((site) => site.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))
  const first = verified[0]
  if (!first) return 'Bing Webmaster account'
  return verified.length > 1
    ? `${first} and ${verified.length - 1} more`
    : first
}

// Google sends the write-scope sign-in back here: add each folder still to
// add, then show what Google says about each.
export async function propertiesCallback(
  request: Request,
  env: Env,
  state: Extract<Sealed, { k: 'gsc-write' }>,
): Promise<Response> {
  const home = `${env.PUBLIC_URL}/account`
  const userId = await sessionUser(request, env)
  if (userId !== state.userId) {
    return signInPage(env, 'Your session ended. Sign in again.')
  }
  const code = new URL(request.url).searchParams.get('code')
  const site = (await auditSites(env, userId)).find(
    (item) => item.property === state.property,
  )
  if (
    !code ||
    !site?.coverage ||
    !(await betaFlags(env, userId)).has('weekly-audit')
  ) {
    return redirect(`${home}#sites`)
  }
  const wanted = site.coverage.suggestions
    .filter((item) => !item.added)
    .map((item) => item.property)
  const added = await addProperties(env, code, wanted)
  if (added === 'no-scope') {
    return accountPage(
      env,
      userId,
      'Google did not give permission to add properties, so nothing was added.',
      { tab: 'sites' },
    )
  }
  await recordAdded(env, userId, state.property, site.coverage, added)
  const lines = added.map((item) =>
    item.state === 'verified'
      ? `${item.property}: added and verified.`
      : item.state === 'unverified'
        ? `${item.property}: added, not verified. Verify it in Search Console before it can check URLs.`
        : `${item.property}: not added (${item.error}).`,
  )
  return accountPage(env, userId, lines.join(' '), {
    tab: 'sites',
    ok: added.every((item) => item.state === 'verified'),
  })
}

// Turns off one alert type's email from the link in that email. The sealed
// token names the person and the type, so no sign-in is needed.
async function alertsOff(request: Request, env: Env): Promise<Response> {
  const off = await unseal(
    env.SEAL_KEY,
    new URL(request.url).searchParams.get('t'),
    'alert-off',
  )
  if (
    !off ||
    !isAlertType(off.type) ||
    !(request.method === 'GET' || request.method === 'POST') ||
    !(await userExists(env, off.userId))
  ) {
    return view(
      env,
      {
        view: 'notice',
        notice: {
          title: 'Link not recognised',
          text: 'Sign in to your account page to change your alerts.',
        },
      },
      404,
    )
  }
  await turnOff(env, off.userId, off.type, 'email')
  if (request.method === 'POST') return new Response(null, { status: 204 })
  return view(env, {
    view: 'notice',
    notice: {
      title: 'Alert emails off',
      text: `You will get no more ${ALERTS[off.type].title.toLowerCase()} emails. Turn them back on under Alerts on the Beta tab of your account page.`,
    },
  })
}
