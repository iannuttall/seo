import { exchangeGoogleCode, readJsonOrUndefined } from '@seo/core/hosted'
import type { AuditCoverage } from './schedule.ts'
import { siteObject } from './schedule.ts'

// "Create these in Search Console" on the Beta tab (the weekly-audit beta).
// Search Console's sites.add needs the read and write scope, which the
// server asks for only when the button is clicked: an incremental sign-in
// for that one Google account, online access, so Google returns no refresh
// token and the access token is used for this request and then dropped.
// A URL-prefix property under a domain property the person already owns is
// verified by the parent's method. One that is not stays
// siteUnverifiedUser, and the page says so; it checks URLs only once Google
// lists it as verified.

export const WRITE_SCOPE = 'https://www.googleapis.com/auth/webmasters'
const SITES = 'https://www.googleapis.com/webmasters/v3/sites'

export function writeSignInUrl(env: Env, state: string, email: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${env.PUBLIC_URL}/oauth/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', WRITE_SCOPE)
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('access_type', 'online')
  url.searchParams.set('login_hint', email)
  url.searchParams.set('state', state)
  return url.toString()
}

export type Added = {
  property: string
  state: 'verified' | 'unverified' | 'failed'
  error?: string
}

// Swaps the code for a short-lived token, adds each folder and reads back
// whether Google counts the person as a verified owner of it.
export async function addProperties(
  env: Env,
  code: string,
  properties: string[],
): Promise<Added[] | 'no-scope'> {
  const tokens = await exchangeGoogleCode({
    clientConfig: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    code,
    redirectUri: `${env.PUBLIC_URL}/oauth/callback`,
  }).catch(() => null)
  if (!tokens?.scope.split(' ').includes(WRITE_SCOPE)) return 'no-scope'
  const headers = { authorization: `Bearer ${tokens.access_token}` }
  const added: Added[] = []
  for (const property of properties) {
    const url = `${SITES}/${encodeURIComponent(property)}`
    const put = await fetch(url, {
      method: 'PUT',
      headers,
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null)
    if (!put?.ok) {
      const body = put
        ? await readJsonOrUndefined<{ error?: { message?: string } }>(
            put,
            'Search Console',
          )
        : undefined
      added.push({
        property,
        state: 'failed',
        error:
          body?.error?.message ??
          `Search Console answered ${put?.status ?? 'nothing'}`,
      })
      continue
    }
    await put.body?.cancel()
    const got = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null)
    const site = got?.ok
      ? await readJsonOrUndefined<{ permissionLevel?: string }>(
          got,
          'Search Console',
        )
      : undefined
    added.push({
      property,
      state:
        site?.permissionLevel && site.permissionLevel !== 'siteUnverifiedUser'
          ? 'verified'
          : 'unverified',
    })
  }
  return added
}

// Marks the folders on the site's D1 row, so the Beta tab shows what was
// added until the next day's plan replaces the list, and asks the site
// object to count new properties from its next wake.
export async function recordAdded(
  env: Env,
  userId: string,
  site: string,
  coverage: AuditCoverage,
  added: Added[],
): Promise<void> {
  const state = new Map(added.map((item) => [item.property, item.state]))
  const next: AuditCoverage = {
    ...coverage,
    suggestions: coverage.suggestions.map((item) => {
      const done = state.get(item.property)
      return done && done !== 'failed' ? { ...item, added: done } : item
    }),
  }
  await env.DB.prepare(
    'UPDATE audit_sites SET coverage = ? WHERE user_id = ? AND property = ?',
  )
    .bind(JSON.stringify(next), userId, site)
    .run()
  if (added.some((item) => item.state === 'verified')) {
    await siteObject(env, userId, site).refreshProperties()
  }
}
