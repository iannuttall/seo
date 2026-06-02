import { randomUUID } from 'node:crypto'
import { getDb } from '../../storage/database.js'
import type { LinkRecoverReport } from './link-recover.js'

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
  }
}

export function insertLinkRecoverRun(report: LinkRecoverReport): string {
  const top = report.items[0]
  const id = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO link_recover_runs
      (id, site_url, created_at, start_date, end_date, days, checked,
       recoverable, high, medium, low, clicks_at_risk, impressions_at_risk,
       top_issue, top_url, top_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      report.site,
      Date.parse(report.generatedAt),
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

  return row ? toSummary(row) : undefined
}
