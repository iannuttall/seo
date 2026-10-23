import { PERMISSION_RANK } from '@seo/core/commands'
import { readJson } from '@seo/core/hosted'
import { freshAccess } from '../google.ts'
import type { Account } from '../store.ts'

// The Search Console properties the person can add to the weekly audit, for
// the Sites tab's picker: one sites.list call per linked Google account,
// each bounded, with the account that has the most access to each property.
// The page fetches this once and filters as the person types. Kept in this
// Worker's memory for a few minutes, so reloading the page does not call
// Google again; never written anywhere.

export type Choice = { property: string; email: string }

const SITES = 'https://www.googleapis.com/webmasters/v3/sites'
const TIMEOUT_MS = 10_000
const MAX_BYTES = 2_000_000
const MAX_PER_ACCOUNT = 1000
const TTL_MS = 5 * 60_000
const MAX_CACHED = 200

const cache = new Map<string, { at: number; choices: Choice[] }>()

export function forgetChoices(userId: string): void {
  cache.delete(userId)
}

export async function propertyChoices(
  env: Env,
  userId: string,
  accounts: Account[],
): Promise<{ choices: Choice[]; failed: string[] }> {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { choices: hit.choices, failed: [] }
  }
  const google = accounts.filter((account) => account.provider === 'google')
  const failed: string[] = []
  const lists = await Promise.all(
    google.map(async (account) => {
      try {
        const { token } = await freshAccess(env, account)
        const response = await fetch(SITES, {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!response.ok) {
          await response.body?.cancel()
          throw new Error(`HTTP ${response.status}`)
        }
        const json = await readJson<{
          siteEntry?: { siteUrl?: string; permissionLevel?: string }[]
        }>(response, 'Search Console', { maxBytes: MAX_BYTES })
        return (json.siteEntry ?? [])
          .filter(
            (entry) =>
              typeof entry.siteUrl === 'string' &&
              entry.permissionLevel !== 'siteUnverifiedUser',
          )
          .slice(0, MAX_PER_ACCOUNT)
          .map((entry) => ({
            property: entry.siteUrl as string,
            email: account.label,
            rank: PERMISSION_RANK[entry.permissionLevel ?? ''] ?? 3,
          }))
      } catch {
        failed.push(account.label)
        return []
      }
    }),
  )
  // The same account wins a property that LinkedAccounts.owner() picks.
  const best = new Map<string, { email: string; rank: number }>()
  for (const item of lists.flat()) {
    const found = best.get(item.property)
    if (!found || item.rank < found.rank) best.set(item.property, item)
  }
  const choices = [...best]
    .map(([property, { email }]) => ({ property, email }))
    .sort((a, b) => sortKey(a.property).localeCompare(sortKey(b.property)))
  if (!failed.length) {
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value ?? '')
    cache.set(userId, { at: Date.now(), choices })
  }
  return { choices, failed: failed.sort() }
}

// By host, with a domain property before the URL-prefix ones under it.
function sortKey(property: string): string {
  const domain = property.startsWith('sc-domain:')
  const rest = domain
    ? property.slice('sc-domain:'.length)
    : property.replace(/^https?:\/\//, '')
  return `${rest.replace(/^www\./, '')} ${domain ? 0 : 1} ${property}`
}
