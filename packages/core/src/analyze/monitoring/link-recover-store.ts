import { randomUUID } from 'node:crypto'
import { getDb } from '../../storage/database.js'
import type { LinkRecoverReport } from './link-recover.js'

export const LINK_RECOVER_RUN_RETENTION = 20

export type LinkRecoverSummary = {
  id: string
  site: string
  createdAt: string
  range: {
    startDate: string
    endDate: string
    days: number
  }
  checked: number
  recoverable: number
  high: number
  medium: number
  low: number
  clicksAtRisk: number
  impressionsAtRisk: number
  topIssue?: string
  topUrl?: string
  topAction?: string
  repeatedUrls: number
  repeatedTopUrl?: string
}

type LinkRecoverRunRow = {
  id: string
  site_url: string
  created_at: number
  start_date: string
  end_date: string
  days: number
  checked: number
  recoverable: number
  high: number
  medium: number
  low: number
  clicks_at_risk: number
  impressions_at_risk: number
  top_issue?: string | null
  top_url?: string | null
  top_action?: string | null
  repeated_urls?: number | null
  repeated_top_url?: string | null
}

type LinkRecoverItemRow = {
  url: string
  seen_count: number
}

function toSummary(row: LinkRecoverRunRow): LinkRecoverSummary {
  return {
    id: row.id,
    site: row.site_url,
    createdAt: new Date(row.created_at).toISOString(),
    range: {
      startDate: row.start_date,
      endDate: row.end_date,
      days: row.days,
    },
    checked: row.checked,
    recoverable: row.recoverable,
    high: row.high,
    medium: row.medium,
    low: row.low,
    clicksAtRisk: row.clicks_at_risk,
    impressionsAtRisk: row.impressions_at_risk,
    topIssue: row.top_issue ?? undefined,
    topUrl: row.top_url ?? undefined,
    topAction: row.top_action ?? undefined,
    repeatedUrls: row.repeated_urls ?? 0,
    repeatedTopUrl: row.repeated_top_url ?? undefined,
  }
}

export function insertLinkRecoverRun(report: LinkRecoverReport): string {
  const top = report.items[0]
  const id = randomUUID()
  const db = getDb()
  const insertRun = db.prepare(
    `INSERT INTO link_recover_runs
      (id, site_url, created_at, start_date, end_date, days, checked,
       recoverable, high, medium, low, clicks_at_risk, impressions_at_risk,
       top_issue, top_url, top_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertItem = db.prepare(
    `INSERT INTO link_recover_items
    (run_id, site_url, url, final_url, issue, issues_json, severity,
     clicks, impressions, position, action, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const createdAt = Date.parse(report.generatedAt)

  db.transaction(() => {
    insertRun.run(
      id,
      report.site,
      createdAt,
      report.range.startDate,
      report.range.endDate,
      report.range.days,
      report.summary.checked,
      report.summary.recoverable,
      report.summary.high,
      report.summary.medium,
      report.summary.low,
      report.summary.clicksAtRisk,
      report.summary.impressionsAtRisk,
      top?.issue ?? null,
      top?.url ?? null,
      top?.recommendation.action ?? null,
    )

    for (const item of report.items) {
      insertItem.run(
        id,
        report.site,
        item.url,
        item.finalUrl,
        item.issue,
        JSON.stringify(item.issues),
        item.severity,
        item.clicks,
        item.impressions,
        item.position,
        item.recommendation.action,
        createdAt,
      )
    }
  })()

  db.prepare(
    `DELETE FROM link_recover_runs
    WHERE site_url = ?
      AND id NOT IN (
        SELECT id FROM link_recover_runs
        WHERE site_url = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      )`,
  ).run(report.site, report.site, LINK_RECOVER_RUN_RETENTION)

  return id
}

export function latestLinkRecoverSummary(
  site: string,
): LinkRecoverSummary | undefined {
  const row = getDb()
    .prepare(
      `SELECT *
      FROM link_recover_runs
      WHERE site_url = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    )
    .get(site) as LinkRecoverRunRow | undefined

  if (!row) return undefined

  const repeated = getRepeatedLinkRecoverUrls(site, 5)
  return toSummary({
    ...row,
    repeated_urls: repeated.length,
    repeated_top_url: repeated[0]?.url,
  })
}

export function getRepeatedLinkRecoverUrls(
  site: string,
  runLimit = 5,
): Array<{ url: string; seenCount: number }> {
  const db = getDb()
  const runs = db
    .prepare(
      `SELECT id
      FROM link_recover_runs
      WHERE site_url = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    )
    .all(site, runLimit) as Array<{ id: string }>

  if (runs.length < 2) return []

  const placeholders = runs.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT url, COUNT(DISTINCT run_id) AS seen_count
      FROM link_recover_items
      WHERE site_url = ? AND run_id IN (${placeholders})
      GROUP BY url
      HAVING seen_count >= 2
      ORDER BY seen_count DESC, MAX(created_at) DESC`,
    )
    .all(site, ...runs.map((run) => run.id)) as LinkRecoverItemRow[]

  return rows.map((row) => ({
    url: row.url,
    seenCount: row.seen_count,
  }))
}
