import { getDb } from '../../storage/database.js'
import { authedFetch, getAuthorized } from './fetch.js'

export async function listSites(
  _refresh = false,
): Promise<
  Array<{ siteUrl: string; permissionLevel?: string; siteType?: string }>
> {
  const { client } = await getAuthorized()
  const response = await authedFetch(
    client,
    'https://www.googleapis.com/webmasters/v3/sites',
  )
  if (!response.ok) {
    throw new Error(`GSC site list failed with ${response.status}.`)
  }

  const json = (await response.json()) as {
    siteEntry?: Array<{
      siteUrl: string
      permissionLevel?: string
      siteType?: string
    }>
  }

  const entries = json.siteEntry ?? []
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
