import {
  type BingCall,
  bingCall,
  CommandError,
  type GoogleAccount,
  matchProperty,
  readableSites,
} from '@seo/core/commands'
import {
  bearerFetch,
  type GoogleFetch,
  inspectSearchConsoleUrl,
  type SearchAnalyticsQuery,
  searchAnalyticsRows,
} from '@seo/core/hosted'
import { refreshBing, refreshGoogle } from './providers.ts'
import { type Account, saveAccess } from './store.ts'

// One person's linked accounts for one request. Access tokens refresh here
// when they expire. Each site goes to the linked Google account that can read
// it. Nothing about the sites is kept.

// Most rows read per request when a report does not set its own limit.
export const MAX_ROWS = 100_000

const RANK: Record<string, number> = {
  siteOwner: 0,
  siteFullUser: 1,
  siteRestrictedUser: 2,
}

export type Linked = {
  email: string
  google: GoogleFetch
}

export function accountUrl(env: Env): string {
  return `${env.PUBLIC_URL}/account`
}

export function signInHint(env: Env): string {
  return `Add or reconnect the account at ${accountUrl(env)}.`
}

function tokenFor(env: Env, account: Account): () => Promise<string> {
  let token: Promise<string> | undefined
  return () => {
    token ??= (async () => {
      if (account.access && account.accessExp > Date.now()) {
        return account.access
      }
      try {
        const fresh =
          account.provider === 'google'
            ? await refreshGoogle(env, account.refresh)
            : await refreshBing(env, account.refresh)
        await saveAccess(
          env,
          account,
          fresh.access,
          fresh.accessExp,
          fresh.refresh,
        )
        return fresh.access
      } catch {
        throw new CommandError(
          'NOT_CONNECTED',
          `The ${account.provider === 'google' ? 'Google' : 'Bing'} sign-in for ${account.label} expired or was removed. ${signInHint(env)}`,
        )
      }
    })()
    return token
  }
}

export class Directory {
  readonly google: Linked[]
  readonly bing: BingCall | null
  private readonly sites = new Map<
    Linked,
    Promise<{ siteUrl: string; permissionLevel: string }[]>
  >()
  private owners: Promise<Map<string, Linked>> | undefined
  private readonly env: Env

  constructor(env: Env, accounts: Account[]) {
    this.env = env
    this.google = accounts
      .filter((account) => account.provider === 'google')
      .map((account) => ({
        email: account.label,
        google: bearerFetch(tokenFor(env, account)),
      }))
    const bing = accounts.find((account) => account.provider === 'bing')
    this.bing = bing
      ? bingCall(
          { accessToken: tokenFor(env, bing) },
          { signIn: signInHint(env) },
        )
      : null
  }

  accounts(): GoogleAccount[] {
    return this.google.map((linked) => ({
      email: linked.email,
      google: linked.google,
    }))
  }

  private sitesOf(linked: Linked) {
    let found = this.sites.get(linked)
    if (!found) {
      found = readableSites(linked.google, signInHint(this.env))
      this.sites.set(linked, found)
    }
    return found
  }

  // Each property and the linked account with the most access to it.
  private ownerMap(): Promise<Map<string, Linked>> {
    this.owners ??= (async () => {
      const lists = await Promise.all(
        this.google.map(async (linked) => ({
          linked,
          sites: await this.sitesOf(linked).catch((error: unknown) => {
            if (this.google.length === 1) throw error
            return []
          }),
        })),
      )
      const best = new Map<string, { linked: Linked; rank: number }>()
      for (const { linked, sites } of lists) {
        for (const site of sites) {
          const rank = RANK[site.permissionLevel] ?? 3
          const found = best.get(site.siteUrl)
          if (!found || rank < found.rank) {
            best.set(site.siteUrl, { linked, rank })
          }
        }
      }
      return new Map([...best].map(([site, { linked }]) => [site, linked]))
    })()
    return this.owners
  }

  // The property the caller means: an exact property, else the closest
  // domain property, else a URL-prefix property for the same origin.
  async resolve(site: string): Promise<string> {
    if (this.google.length === 0) {
      throw new CommandError(
        'NOT_CONNECTED',
        `No Google account is connected. ${signInHint(this.env)}`,
      )
    }
    const owners = await this.ownerMap()
    const found = matchProperty([...owners.keys()], site)
    if (found) return found
    throw new CommandError(
      'NO_ACCESS',
      `None of the connected Google accounts (${this.google.map((linked) => linked.email).join(', ')}) has a Search Console property for ${site}. Add the Google account that can read it at ${accountUrl(this.env)}, then call seo_sites.`,
    )
  }

  private async owner(property: string): Promise<Linked> {
    const owner = (await this.ownerMap()).get(await this.resolve(property))
    if (!owner) throw new CommandError('NO_ACCESS', `No access to ${property}.`)
    return owner
  }

  searchAnalytics(): SearchAnalyticsQuery {
    return async (site, body) =>
      searchAnalyticsRows(
        (await this.owner(site)).google,
        site,
        { ...body, maxRows: body.maxRows ?? body.rowLimit ?? MAX_ROWS },
        { signIn: signInHint(this.env) },
      )
  }

  async inspect(site: string, url: string) {
    return inspectSearchConsoleUrl((await this.owner(site)).google, site, url, {
      signIn: signInHint(this.env),
      languageCode: 'en-US',
    })
  }
}
