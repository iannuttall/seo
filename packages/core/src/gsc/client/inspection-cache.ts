import type { IndexStatus } from '../../commands/types.js'
import {
  cacheDb,
  noteCacheWrite,
  writeToCache,
} from '../../storage/database.js'

// URL Inspection results saved on this machine, keyed by property and URL,
// so `seo index` can page rows or show full detail without inspecting
// again. Each row is the flat IndexStatus shape (indexStatusFrom) and when
// it was inspected. Best-effort: when the cache cannot be read or written,
// the run inspects as if nothing were saved.

// A saved result is reused for 7 days, the same rule the hosted store uses:
// one weekly run inspects again, and every call in between reuses it.
export const INSPECTION_FRESH_MS = 7 * 86_400_000

export type SavedInspection = { status: IndexStatus; inspectedAt: string }

export function readSavedInspections(
  site: string,
  urls: string[],
  now = Date.now(),
): Map<string, SavedInspection> {
  const found = new Map<string, SavedInspection>()
  try {
    const statement = cacheDb().prepare(
      `SELECT status_json, fetched_at FROM url_inspection_cache
      WHERE site_url = ? AND url = ? AND fetched_at > ?`,
    )
    for (const url of urls) {
      const row = statement.get(site, url, now - INSPECTION_FRESH_MS) as
        | { status_json: string; fetched_at: number }
        | undefined
      if (!row) continue
      found.set(url, {
        status: JSON.parse(row.status_json) as IndexStatus,
        inspectedAt: new Date(row.fetched_at).toISOString(),
      })
    }
  } catch {
    return new Map()
  }
  return found
}

export function saveInspection(
  site: string,
  url: string,
  status: IndexStatus,
  now = Date.now(),
): void {
  const json = JSON.stringify(status)
  writeToCache((database) => {
    database
      .prepare(
        `INSERT OR REPLACE INTO url_inspection_cache
        (site_url, url, status_json, fetched_at, expires_at)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .run(site, url, json, now, now + INSPECTION_FRESH_MS)
    noteCacheWrite(Buffer.byteLength(json) + url.length, database)
  })
}
