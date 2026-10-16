import type { BingCall } from '../bing/api.js'
import {
  bearerFetch,
  type GoogleFetch,
  inspectSearchConsoleUrl,
  searchAnalyticsRows,
} from '../google/api.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { matchProperty } from './shared.js'
import { type GoogleAccount, readableSites } from './sites.js'
import { CommandError } from './types.js'

// A person's linked Google and Bing accounts as one. Each Search Console
// property goes to the Google account with the most access to it, and each
// Bing site to the Bing account that has it verified. The hosted MCP and a
// CLI linked to the same account both use this, each with its own tokens.

// Most rows read per request when a report does not set its own limit.
const MAX_ROWS = 100_000

// Search Console access levels, most access first.
export const PERMISSION_RANK: Record<string, number> = {
  siteOwner: 0,
  siteFullUser: 1,
  siteRestrictedUser: 2,
}

export type Linked = { email: string; google: GoogleFetch }

type Site = { Url?: unknown; IsVerified?: unknown }

// One Bing call over every linked Bing account: the site list joins all of
// them, and a call for one site goes to the account that has it verified.
export function bingRouter(calls: BingCall[]): BingCall | null {
  if (calls.length === 0) return null
  const only = calls[0]
  if (calls.length === 1 && only) return only
  let lists: Promise<{ call: BingCall; sites: Site[] }[]> | undefined
  const sitesOf = () => {
    lists ??= Promise.all(
      calls.map(async (call) => ({
        call,
        sites: await call('GetUserSites')
          .then((data) => (Array.isArray(data) ? (data as Site[]) : []))
          .catch(() => []),
      })),
    )
    return lists
  }
  return async (method, params = {}) => {
    const all = await sitesOf()
    if (method === 'GetUserSites') return all.flatMap((item) => item.sites)
    // Reports pass the exact Bing site URL from the joined list.
    const owner = all.find((item) =>
      item.sites.some(
        (entry) => entry.IsVerified === true && entry.Url === params.siteUrl,
      ),
    )
    return (owner?.call ?? (only as BingCall))(method, params)
  }
}

export class LinkedAccounts {
  readonly google: Linked[]
  readonly bing: BingCall | null
  private readonly sites = new Map<
    Linked,
    Promise<{ siteUrl: string; permissionLevel: string }[]>
  >()
  private owners: Promise<Map<string, Linked>> | undefined

  constructor(
    input: {
      google: { email: string; token: () => Promise<string> }[]
      bing: BingCall[]
    },
    // What to do when a sign-in is missing or cannot read a site, such as
    // "Open https://seoskill.dev/account#google ...".
    private readonly hint: { signIn: string; addGoogle: string },
  ) {
    this.google = input.google.map((account) => ({
      email: account.email,
      google: bearerFetch(account.token),
    }))
    this.bing = bingRouter(input.bing)
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
      found = readableSites(linked.google, this.hint.signIn)
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
          const rank = PERMISSION_RANK[site.permissionLevel] ?? 3
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
        `No Google account is connected. ${this.hint.signIn}`,
      )
    }
    const owners = await this.ownerMap()
    const found = matchProperty([...owners.keys()], site)
    if (found) return found
    throw new CommandError(
      'NO_ACCESS',
      `None of the connected Google accounts (${this.google.map((linked) => linked.email).join(', ')}) has a Search Console property for ${site}. ${this.hint.addGoogle}`,
    )
  }

  // The linked Google account that reads a site or property.
  async owner(site: string): Promise<Linked> {
    const owner = (await this.ownerMap()).get(await this.resolve(site))
    if (!owner) throw new CommandError('NO_ACCESS', `No access to ${site}.`)
    return owner
  }

  searchAnalytics(): SearchAnalyticsQuery {
    return async (site, body) =>
      searchAnalyticsRows(
        (await this.owner(site)).google,
        site,
        { ...body, maxRows: body.maxRows ?? body.rowLimit ?? MAX_ROWS },
        { signIn: this.hint.signIn },
      )
  }

  async inspect(site: string, url: string) {
    return inspectSearchConsoleUrl((await this.owner(site)).google, site, url, {
      signIn: this.hint.signIn,
      languageCode: 'en-US',
    })
  }
}
