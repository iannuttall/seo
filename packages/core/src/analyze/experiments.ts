import { randomUUID } from 'node:crypto'
import {
  querySearchAnalytics,
  type SearchAnalyticsRequest,
} from '../gsc/client.js'
import { getDb } from '../storage/database.js'
import type { GscRow } from '../types.js'

export type ContentGroupDimension = 'page' | 'query'
export type ContentGroupMatchType = 'equals' | 'contains' | 'regex'

export type ContentGroup = {
  id: string
  site: string
  name: string
  dimension: ContentGroupDimension
  matchType: ContentGroupMatchType
  pattern: string
  createdAt: string
}

export type ChangeScope = 'site' | 'page' | 'query' | 'group'

export type SeoChange = {
  id: string
  site: string
  scope: ChangeScope
  target: string
  title: string
  description?: string
  changedAt: string
  createdAt: string
}

export type TestMetrics = {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type ChangeMeasurement = {
  change: SeoChange
  before: { startDate: string; endDate: string; metrics: TestMetrics }
  after: { startDate: string; endDate: string; metrics: TestMetrics }
  delta: {
    clicks: number
    clickPct: number | null
    impressions: number
    impressionPct: number | null
    ctr: number
    position: number
  }
  verdict: 'positive' | 'negative' | 'mixed' | 'flat' | 'not-enough-data'
  confidence: 'high' | 'medium' | 'low'
  note: string
}

type ContentGroupRow = {
  id: string
  site_url: string
  name: string
  dimension: ContentGroupDimension
  match_type: ContentGroupMatchType
  pattern: string
  created_at: number
}

type ChangeRow = {
  id: string
  site_url: string
  scope: ChangeScope
  target: string
  title: string
  description?: string | null
  changed_at: string
  created_at: number
}

function toIsoDate(value: number): string {
  return new Date(value).toISOString()
}

function groupFromRow(row: ContentGroupRow): ContentGroup {
  return {
    id: row.id,
    site: row.site_url,
    name: row.name,
    dimension: row.dimension,
    matchType: row.match_type,
    pattern: row.pattern,
    createdAt: toIsoDate(row.created_at),
  }
}

function changeFromRow(row: ChangeRow): SeoChange {
  return {
    id: row.id,
    site: row.site_url,
    scope: row.scope,
    target: row.target,
    title: row.title,
    description: row.description ?? undefined,
    changedAt: row.changed_at,
    createdAt: toIsoDate(row.created_at),
  }
}

function dateShift(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function latestGscDate(): string {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 4)
  return end.toISOString().slice(0, 10)
}

function pct(after: number, before: number): number | null {
  if (before === 0) return after === 0 ? 0 : null
  return Number((((after - before) / before) * 100).toFixed(2))
}

function fixed(value: number, digits = 3): number {
  return Number(value.toFixed(digits))
}

function summarizeRows(rows: GscRow[]): TestMetrics {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  const ctr = impressions > 0 ? clicks / impressions : 0
  const position =
    impressions > 0
      ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
        impressions
      : 0

  return {
    clicks: fixed(clicks),
    impressions: fixed(impressions),
    ctr: fixed(ctr, 4),
    position: fixed(position),
  }
}

function groupOperator(matchType: ContentGroupMatchType) {
  return matchType === 'regex'
    ? 'includingRegex'
    : matchType === 'contains'
      ? 'contains'
      : 'equals'
}

function filterForChange(
  change: SeoChange,
  group?: ContentGroup,
): SearchAnalyticsRequest['dimensionFilterGroups'] {
  if (change.scope === 'site') return undefined

  const dimension = change.scope === 'group' ? group?.dimension : change.scope
  const expression = change.scope === 'group' ? group?.pattern : change.target
  if (!dimension || !expression) return undefined

  const operator =
    change.scope === 'group' && group
      ? groupOperator(group.matchType)
      : 'equals'

  return [
    {
      groupType: 'and',
      filters: [{ dimension, operator, expression }],
    },
  ]
}

function classify(input: {
  before: TestMetrics
  after: TestMetrics
  clickPct: number | null
  clickDelta: number
  positionDelta: number
}): Pick<ChangeMeasurement, 'verdict' | 'confidence' | 'note'> {
  const totalImpressions = input.before.impressions + input.after.impressions
  if (totalImpressions < 100) {
    return {
      verdict: 'not-enough-data',
      confidence: 'low',
      note: 'The comparison windows have fewer than 100 impressions total.',
    }
  }

  const pctValue = input.clickPct ?? 0
  const betterPosition = input.positionDelta < -0.5
  const worsePosition = input.positionDelta > 0.5
  const positive = input.clickDelta > 0 && (pctValue >= 10 || betterPosition)
  const negative = input.clickDelta < 0 && (pctValue <= -10 || worsePosition)

  const confidence =
    Math.abs(input.clickDelta) >= 50 && Math.abs(pctValue) >= 30
      ? 'high'
      : Math.abs(input.clickDelta) >= 10 && Math.abs(pctValue) >= 10
        ? 'medium'
        : 'low'

  if (positive) {
    return {
      verdict: 'positive',
      confidence,
      note: 'Clicks improved after the change. Confirm with segment breakdown before rolling out widely.',
    }
  }
  if (negative) {
    return {
      verdict: 'negative',
      confidence,
      note: 'Clicks declined after the change. Check query mix, ranking movement, and indexability before reverting.',
    }
  }
  if (betterPosition || worsePosition) {
    return {
      verdict: 'mixed',
      confidence,
      note: 'Ranking movement and click movement disagree. Inspect SERP layout, CTR, and query demand.',
    }
  }
  return {
    verdict: 'flat',
    confidence,
    note: 'No material movement detected in this window.',
  }
}

export function createContentGroup(input: {
  site: string
  name: string
  dimension?: ContentGroupDimension
  matchType?: ContentGroupMatchType
  pattern: string
}): ContentGroup {
  const group: ContentGroup = {
    id: randomUUID(),
    site: input.site,
    name: input.name,
    dimension: input.dimension ?? 'page',
    matchType: input.matchType ?? 'contains',
    pattern: input.pattern,
    createdAt: new Date().toISOString(),
  }

  getDb()
    .prepare(
      `INSERT INTO content_groups
      (id, site_url, name, dimension, match_type, pattern, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      group.id,
      group.site,
      group.name,
      group.dimension,
      group.matchType,
      group.pattern,
      Date.parse(group.createdAt),
    )

  return group
}

export function listContentGroups(site?: string): ContentGroup[] {
  const sql = site
    ? 'SELECT * FROM content_groups WHERE site_url = ? ORDER BY created_at DESC'
    : 'SELECT * FROM content_groups ORDER BY created_at DESC'
  const rows = site
    ? (getDb().prepare(sql).all(site) as ContentGroupRow[])
    : (getDb().prepare(sql).all() as ContentGroupRow[])
  return rows.map(groupFromRow)
}

export function getContentGroup(id: string): ContentGroup | undefined {
  const row = getDb()
    .prepare('SELECT * FROM content_groups WHERE id = ?')
    .get(id) as ContentGroupRow | undefined
  return row ? groupFromRow(row) : undefined
}

export function deleteContentGroup(id: string): boolean {
  return (
    getDb().prepare('DELETE FROM content_groups WHERE id = ?').run(id).changes >
    0
  )
}

export function recordChange(input: {
  site: string
  scope: ChangeScope
  target: string
  title: string
  description?: string
  changedAt: string
}): SeoChange {
  const change: SeoChange = {
    id: randomUUID(),
    site: input.site,
    scope: input.scope,
    target: input.target,
    title: input.title,
    description: input.description,
    changedAt: input.changedAt,
    createdAt: new Date().toISOString(),
  }

  getDb()
    .prepare(
      `INSERT INTO seo_changes
      (id, site_url, scope, target, title, description, changed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      change.id,
      change.site,
      change.scope,
      change.target,
      change.title,
      change.description ?? null,
      change.changedAt,
      Date.parse(change.createdAt),
    )

  return change
}

export function listChanges(
  input: { site?: string; limit?: number } = {},
): SeoChange[] {
  const limit = input.limit ?? 25
  const rows = input.site
    ? (getDb()
        .prepare(
          'SELECT * FROM seo_changes WHERE site_url = ? ORDER BY changed_at DESC, created_at DESC LIMIT ?',
        )
        .all(input.site, limit) as ChangeRow[])
    : (getDb()
        .prepare(
          'SELECT * FROM seo_changes ORDER BY changed_at DESC, created_at DESC LIMIT ?',
        )
        .all(limit) as ChangeRow[])
  return rows.map(changeFromRow)
}

export function getChange(id: string): SeoChange | undefined {
  const row = getDb()
    .prepare('SELECT * FROM seo_changes WHERE id = ?')
    .get(id) as ChangeRow | undefined
  return row ? changeFromRow(row) : undefined
}

export function deleteChange(id: string): boolean {
  return (
    getDb().prepare('DELETE FROM seo_changes WHERE id = ?').run(id).changes > 0
  )
}

async function queryMetrics(input: {
  site: string
  startDate: string
  endDate: string
  filters?: SearchAnalyticsRequest['dimensionFilterGroups']
  refresh?: boolean
}): Promise<TestMetrics> {
  const result = await querySearchAnalytics(
    input.site,
    {
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: ['date'],
      type: 'web',
      dataState: 'final',
      dimensionFilterGroups: input.filters,
    },
    { refresh: input.refresh },
  )
  return summarizeRows(result.rows)
}

export async function measureChange(input: {
  id?: string
  site?: string
  scope?: ChangeScope
  target?: string
  title?: string
  changedAt?: string
  beforeDays?: number
  afterDays?: number
  refresh?: boolean
}): Promise<ChangeMeasurement> {
  const stored = input.id ? getChange(input.id) : undefined
  const change =
    stored ??
    ({
      id: 'adhoc',
      site: input.site,
      scope: input.scope,
      target: input.target,
      title: input.title ?? 'Ad hoc change measurement',
      changedAt: input.changedAt,
      createdAt: new Date().toISOString(),
    } as SeoChange)

  if (!change.site || !change.scope || !change.target || !change.changedAt) {
    throw new Error(
      'Pass a change id, or provide site, scope, target, and changedAt.',
    )
  }

  const beforeDays = input.beforeDays ?? 28
  const afterDays = input.afterDays ?? beforeDays
  const before = {
    startDate: dateShift(change.changedAt, -beforeDays),
    endDate: dateShift(change.changedAt, -1),
  }
  const desiredAfterEnd = dateShift(change.changedAt, afterDays - 1)
  const after = {
    startDate: change.changedAt,
    endDate:
      desiredAfterEnd > latestGscDate() ? latestGscDate() : desiredAfterEnd,
  }

  const group =
    change.scope === 'group' ? getContentGroup(change.target) : undefined
  if (change.scope === 'group' && !group) {
    throw new Error(`Content group ${change.target} was not found.`)
  }

  const filters = filterForChange(change, group)
  const [beforeMetrics, afterMetrics] = await Promise.all([
    queryMetrics({
      site: change.site,
      ...before,
      filters,
      refresh: input.refresh,
    }),
    queryMetrics({
      site: change.site,
      ...after,
      filters,
      refresh: input.refresh,
    }),
  ])

  const clickDelta = fixed(afterMetrics.clicks - beforeMetrics.clicks)
  const impressionDelta = fixed(
    afterMetrics.impressions - beforeMetrics.impressions,
  )
  const positionDelta = fixed(afterMetrics.position - beforeMetrics.position)
  const clickPct = pct(afterMetrics.clicks, beforeMetrics.clicks)
  const verdict = classify({
    before: beforeMetrics,
    after: afterMetrics,
    clickPct,
    clickDelta,
    positionDelta,
  })

  return {
    change,
    before: { ...before, metrics: beforeMetrics },
    after: { ...after, metrics: afterMetrics },
    delta: {
      clicks: clickDelta,
      clickPct,
      impressions: impressionDelta,
      impressionPct: pct(afterMetrics.impressions, beforeMetrics.impressions),
      ctr: fixed(afterMetrics.ctr - beforeMetrics.ctr, 4),
      position: positionDelta,
    },
    ...verdict,
  }
}
