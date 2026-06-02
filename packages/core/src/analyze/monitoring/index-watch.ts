import { randomUUID } from 'node:crypto'
import { inspectUrl, type UrlInspectionResult } from '../../gsc/client.js'
import { getDb } from '../../storage/database.js'
import type {
  IndexWatchItem,
  IndexWatchReport,
  IndexWatchRow,
} from './types.js'

function statusFromInspection(result: UrlInspectionResult): IndexWatchItem {
  const status = result.inspectionResult?.indexStatusResult
  return {
    url: '',
    verdict: status?.verdict,
    coverageState: status?.coverageState,
    indexingState: status?.indexingState,
    robotsTxtState: status?.robotsTxtState,
    pageFetchState: status?.pageFetchState,
    googleCanonical: status?.googleCanonical,
    userCanonical: status?.userCanonical,
    lastCrawlTime: status?.lastCrawlTime,
    changed: false,
    alert: false,
  }
}

function latestIndexWatch(
  site: string,
  url: string,
): IndexWatchRow | undefined {
  return getDb()
    .prepare(
      `SELECT verdict, coverage_state, indexing_state, robots_txt_state
      FROM index_watch_snapshots
      WHERE site_url = ? AND url = ?
      ORDER BY inspected_at DESC LIMIT 1`,
    )
    .get(site, url) as IndexWatchRow | undefined
}

function insertIndexWatch(site: string, item: IndexWatchItem): void {
  getDb()
    .prepare(
      `INSERT INTO index_watch_snapshots
      (id, site_url, url, verdict, coverage_state, indexing_state,
       robots_txt_state, page_fetch_state, google_canonical, user_canonical,
       last_crawl_time, inspected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      site,
      item.url,
      item.verdict ?? null,
      item.coverageState ?? null,
      item.indexingState ?? null,
      item.robotsTxtState ?? null,
      item.pageFetchState ?? null,
      item.googleCanonical ?? null,
      item.userCanonical ?? null,
      item.lastCrawlTime ?? null,
      Date.now(),
    )
}

export async function indexWatch(input: {
  site: string
  urls: string[]
  languageCode?: string
}): Promise<IndexWatchReport> {
  const items: IndexWatchItem[] = []
  for (const url of input.urls) {
    const previous = latestIndexWatch(input.site, url)
    const result = await inspectUrl({
      siteUrl: input.site,
      inspectionUrl: url,
      languageCode: input.languageCode,
    })
    const item = { ...statusFromInspection(result), url }
    item.previous = previous
      ? {
          verdict: previous.verdict ?? undefined,
          coverageState: previous.coverage_state ?? undefined,
          indexingState: previous.indexing_state ?? undefined,
          robotsTxtState: previous.robots_txt_state ?? undefined,
        }
      : undefined
    item.changed = Boolean(
      previous &&
        (previous.verdict !== item.verdict ||
          previous.coverage_state !== item.coverageState ||
          previous.indexing_state !== item.indexingState ||
          previous.robots_txt_state !== item.robotsTxtState),
    )
    item.alert = Boolean(
      item.changed &&
        (item.verdict !== 'PASS' ||
          /not indexed|excluded|blocked|error/i.test(item.coverageState ?? '')),
    )
    insertIndexWatch(input.site, item)
    items.push(item)
  }

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    summary: {
      inspected: items.length,
      changed: items.filter((item) => item.changed).length,
      alerts: items.filter((item) => item.alert).length,
    },
    items,
  }
}

export function latestIndexWatchSummary(site: string): {
  inspectedUrls: number
  latestInspectedAt?: string
  nonPass: number
  blocked: number
} {
  const row = getDb()
    .prepare(
      `WITH latest AS (
        SELECT snapshot.*
        FROM index_watch_snapshots snapshot
        INNER JOIN (
          SELECT url, MAX(inspected_at) AS inspected_at
          FROM index_watch_snapshots
          WHERE site_url = ?
          GROUP BY url
        ) latest_snapshot
          ON latest_snapshot.url = snapshot.url
          AND latest_snapshot.inspected_at = snapshot.inspected_at
        WHERE snapshot.site_url = ?
      )
      SELECT
        COUNT(*) AS inspected_urls,
        MAX(inspected_at) AS latest_inspected_at,
        COALESCE(SUM(CASE WHEN verdict IS NOT NULL AND verdict != 'PASS' THEN 1 ELSE 0 END), 0) AS non_pass,
        COALESCE(SUM(CASE WHEN lower(COALESCE(coverage_state, '') || ' ' || COALESCE(robots_txt_state, '')) LIKE '%blocked%' THEN 1 ELSE 0 END), 0) AS blocked
      FROM latest`,
    )
    .get(site, site) as
    | {
        inspected_urls: number
        latest_inspected_at?: number
        non_pass: number
        blocked: number
      }
    | undefined

  return {
    inspectedUrls: row?.inspected_urls ?? 0,
    latestInspectedAt: row?.latest_inspected_at
      ? new Date(row.latest_inspected_at).toISOString()
      : undefined,
    nonPass: row?.non_pass ?? 0,
    blocked: row?.blocked ?? 0,
  }
}
