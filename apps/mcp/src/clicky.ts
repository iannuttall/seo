import {
  CLICKY_ACCOUNT_KEY,
  CLICKY_KEY_PREFIX,
  type ClickyLogin,
  clickyAccountSites,
  clickyKeyValue,
  clickyLogin,
  clickyLoginValue,
  clickySites,
} from '@seo/core/commands'
import { keysOf, setKey } from './store.ts'

// A saved Clicky account: its login is sealed like any key, and each of its
// sites is saved as a site key marked as coming from the account. Reading
// the list again adds new Clicky sites and drops ones that are gone. A site
// added by hand is never changed here.

export type ClickyChange = { set: Record<string, string>; removed: string[] }

export async function importClicky(
  env: Env,
  userId: string,
  login: ClickyLogin,
  saved?: Record<string, string>,
): Promise<ClickyChange> {
  const sites = await clickyAccountSites(login)
  const keys = new Headers(saved ?? (await keysOf(env, userId)))
  const current = clickySites(keys)
  const byHand = new Set(
    current.filter((site) => !site.account).map((site) => site.siteId),
  )
  const change: ClickyChange = { set: {}, removed: [] }
  const found = new Set(sites.map((site) => site.siteId))
  for (const site of current) {
    if (site.account && !found.has(site.siteId)) {
      change.removed.push(`${CLICKY_KEY_PREFIX}${site.siteId}`)
    }
  }
  for (const site of sites) {
    if (byHand.has(site.siteId)) continue
    change.set[`${CLICKY_KEY_PREFIX}${site.siteId}`] = clickyKeyValue(
      site.sitekey,
      site.domain,
      true,
    )
  }
  change.set[CLICKY_ACCOUNT_KEY] = clickyLoginValue(login)
  await Promise.all([
    ...change.removed.map((name) => setKey(env, userId, name, null)),
    ...Object.entries(change.set)
      .filter(([name, value]) => keys.get(name) !== value)
      .map(([name, value]) => setKey(env, userId, name, value)),
  ])
  return change
}

// Removes the Clicky account login and the sites it added.
export async function removeClickyAccount(
  env: Env,
  userId: string,
): Promise<void> {
  const keys = new Headers(await keysOf(env, userId))
  await Promise.all([
    setKey(env, userId, CLICKY_ACCOUNT_KEY, null),
    ...clickySites(keys)
      .filter((site) => site.account)
      .map((site) =>
        setKey(env, userId, `${CLICKY_KEY_PREFIX}${site.siteId}`, null),
      ),
  ])
}

// Reads the saved account's sites again, or returns null without one.
export async function refreshClicky(
  env: Env,
  userId: string,
): Promise<ClickyChange | null> {
  const saved = await keysOf(env, userId)
  const login = clickyLogin(new Headers(saved))
  return login ? importClicky(env, userId, login, saved) : null
}
