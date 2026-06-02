import { listSites } from '../../gsc/client.js'
import { getDb } from '../../storage/database.js'
import { allocateIndexUrlsToProperties } from './index-plan.js'
import { indexWatch } from './index-watch.js'
import { fetchSitemapUrls } from './sitemaps.js'
import type { IndexMonitorReport } from './types.js'

type DueUrl = {
  url: string
  lastInspectedAt?: number
}

export type DueIndexUrl = DueUrl & {
  property: string
}

function latestInspectionTimes(
  property: string,
  urls: string[],
): Map<string, number> {
  if (!urls.length) return new Map()
  const latest = new Map<string, number>()
  const chunkSize = 500

  for (let index = 0; index < urls.length; index += chunkSize) {
    const chunk = urls.slice(index, index + chunkSize)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = getDb()
      .prepare(
        `SELECT url, MAX(inspected_at) AS inspected_at
        FROM index_watch_snapshots
        WHERE site_url = ? AND url IN (${placeholders})
        GROUP BY url`,
      )
      .all(property, ...chunk) as Array<{
      url: string
      inspected_at?: number | null
    }>

    for (const row of rows) {
      if (row.inspected_at) latest.set(row.url, row.inspected_at)
    }
  }

  return latest
}

function dueUrlsForProperty(
  property: string,
  urls: string[],
  limit: number,
): DueUrl[] {
  const latest = latestInspectionTimes(property, urls)
  return urls
    .map((url) => {
      const lastInspectedAt = latest.get(url)
      return lastInspectedAt ? { url, lastInspectedAt } : { url }
    })
    .sort((a, b) => (a.lastInspectedAt ?? 0) - (b.lastInspectedAt ?? 0))
    .slice(0, limit)
}

export function selectDueIndexUrls(input: {
  site: string
  urls: string[]
  accountProperties: string[]
  dailyLimit: number
  inspectLimit: number
}): DueIndexUrl[] {
  const allocations = allocateIndexUrlsToProperties({
    site: input.site,
    urls: input.urls,
    accountProperties: input.accountProperties,
  })
  const dueByProperty = allocations.map((allocation) => ({
    allocation,
    dueUrls: dueUrlsForProperty(
      allocation.property,
      allocation.urls,
      input.dailyLimit,
    ),
    cursor: 0,
  }))
  const selected: DueIndexUrl[] = []
  let remaining = input.inspectLimit
  const firstPassLimit = Math.max(
    1,
    Math.floor(input.inspectLimit / Math.max(1, dueByProperty.length)),
  )

  for (const item of dueByProperty) {
    if (remaining <= 0) break
    const propertyLimit = Math.min(firstPassLimit, remaining)
    const dueUrls = item.dueUrls.slice(0, propertyLimit)
    item.cursor = dueUrls.length
    selected.push(...withProperty(item.allocation.property, dueUrls))
    remaining -= dueUrls.length
  }

  for (const item of dueByProperty) {
    if (remaining <= 0) break
    const dueUrls = item.dueUrls.slice(item.cursor, item.cursor + remaining)
    selected.push(...withProperty(item.allocation.property, dueUrls))
    remaining -= dueUrls.length
  }

  return selected
}

function withProperty(property: string, urls: DueUrl[]): DueIndexUrl[] {
  return urls.map((dueUrl) => ({
    ...dueUrl,
    property,
  }))
}

export async function indexMonitor(input: {
  site: string
  sitemaps: string[]
  properties?: string[]
  dailyLimit?: number
  inspectLimit?: number
  maxUrls?: number
  languageCode?: string
  refresh?: boolean
}): Promise<IndexMonitorReport> {
  const dailyLimit = input.dailyLimit ?? 2_000
  const inspectLimit = input.inspectLimit ?? Math.min(dailyLimit, 100)
  const maxUrls = input.maxUrls ?? 50_000
  const sitemapResults = await Promise.all(
    input.sitemaps.map((sitemapUrl) =>
      fetchSitemapUrls({ sitemapUrl, limit: maxUrls }),
    ),
  )
  const inventoryUrls = [
    ...new Set(sitemapResults.flatMap((result) => result.urls)),
  ].slice(0, maxUrls)
  const warnings = sitemapResults.flatMap((result) => result.warnings)
  const accountProperties: string[] = input.properties
    ? [...input.properties]
    : await listSites(input.refresh).then((sites) =>
        sites.map((site) => site.siteUrl),
      )
  const allocations = allocateIndexUrlsToProperties({
    site: input.site,
    urls: inventoryUrls,
    accountProperties,
  })
  const selected = selectDueIndexUrls({
    site: input.site,
    urls: inventoryUrls,
    accountProperties,
    dailyLimit,
    inspectLimit,
  })
  const selectedByProperty = new Map<string, string[]>()
  for (const selectedUrl of selected) {
    const existing = selectedByProperty.get(selectedUrl.property) ?? []
    existing.push(selectedUrl.url)
    selectedByProperty.set(selectedUrl.property, existing)
  }

  const items: IndexMonitorReport['items'] = []
  const properties: IndexMonitorReport['properties'] = []

  for (const allocation of allocations) {
    const urls = selectedByProperty.get(allocation.property) ?? []
    if (!urls.length) {
      properties.push({
        property: allocation.property,
        inventoryUrls: allocation.urls.length,
        selectedUrls: 0,
        inspected: 0,
        changed: 0,
        alerts: 0,
        sampleUrls: allocation.urls.slice(0, 3),
      })
      continue
    }

    try {
      const report = await indexWatch({
        site: allocation.property,
        urls,
        languageCode: input.languageCode,
      })
      items.push(...report.items)
      properties.push({
        property: allocation.property,
        inventoryUrls: allocation.urls.length,
        selectedUrls: urls.length,
        inspected: report.summary.inspected,
        changed: report.summary.changed,
        alerts: report.summary.alerts,
        sampleUrls: urls.slice(0, 3),
      })
    } catch (error) {
      warnings.push(
        `Index inspection failed for ${allocation.property}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      properties.push({
        property: allocation.property,
        inventoryUrls: allocation.urls.length,
        selectedUrls: urls.length,
        inspected: 0,
        changed: 0,
        alerts: 0,
        sampleUrls: urls.slice(0, 3),
      })
    }
  }

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    summary: {
      inventoryUrls: inventoryUrls.length,
      properties: allocations.length,
      dailyCapacity: allocations.length * dailyLimit,
      selected: selected.length,
      inspected: items.length,
      changed: items.filter((item) => item.changed).length,
      alerts: items.filter((item) => item.alert).length,
      skipped: Math.max(0, inventoryUrls.length - selected.length),
    },
    properties,
    items,
    warnings,
  }
}
