import { cloudGoogleEmails, cloudLinked } from '../../cloud.js'
import { PERMISSION_RANK } from '../../commands/linked.js'
import {
  listSearchConsoleSites,
  type SearchConsoleSite,
} from '../../google/api.js'
import { getDb } from '../../storage/database.js'
import { getAuthorized, googleFetchFor, LOCAL_SIGN_IN } from './fetch.js'

export async function listSites(
  _refresh = false,
  accountEmail?: string,
): Promise<
  Array<{ siteUrl: string; permissionLevel?: string; siteType?: string }>
> {
  const entries =
    !accountEmail && cloudLinked()
      ? await allCloudSites()
      : await listSearchConsoleSites(
          googleFetchFor((await getAuthorized(accountEmail)).client),
          LOCAL_SIGN_IN,
        )
  const db = getDb()
  const insert = db.prepare(
    'INSERT OR REPLACE INTO sites (site_url, display_name, permission, added_at, is_default) VALUES (?, ?, ?, ?, COALESCE((SELECT is_default FROM sites WHERE site_url = ?), 0))',
  )

  for (const site of entries) {
    insert.run(
      site.siteUrl,
      site.siteUrl,
      site.permissionLevel ?? null,
      Date.now(),
      site.siteUrl,
    )
  }

  return entries
}

// Every property the seoskill.dev account's Google sign-ins can read, each
// once with its highest access.
async function allCloudSites(): Promise<SearchConsoleSite[]> {
  const lists = await Promise.all(
    (await cloudGoogleEmails()).map(async (email) =>
      listSearchConsoleSites(
        googleFetchFor((await getAuthorized(email)).client),
        LOCAL_SIGN_IN,
      ),
    ),
  )
  const best = new Map<string, SearchConsoleSite>()
  const rank = (site: SearchConsoleSite) =>
    PERMISSION_RANK[site.permissionLevel ?? ''] ?? 3
  for (const site of lists.flat()) {
    const found = best.get(site.siteUrl)
    if (!found || rank(site) < rank(found)) best.set(site.siteUrl, site)
  }
  return [...best.values()]
}
