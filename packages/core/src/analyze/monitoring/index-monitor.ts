import { SeoError } from '../../errors.js'
import { listSites } from '../../gsc/client.js'
import {
  assertUrlMatchesGscProperty,
  normalizeHttpUrl,
} from '../../gsc/property-url.js'
import { getDb } from '../../storage/database.js'
import { integerOption } from '../site-diagnostics/quick-wins-report-input.js'
import { allocateIndexUrlsToProperties } from './index-plan.js'
import { indexWatch } from './index-watch.js'
import { fetchSitemapUrls } from './sitemaps.js'
import type { IndexMonitorReport } from './types.js'

type DueUrl = {
  url: string
  lastInspectedAt?: number
  dueReason: 'never-attempted' | 'never-succeeded' | 'stale'
}

type InspectionState = {
  latestAttemptAt?: number
  latestSuccessAt?: number
  latestAttemptSucceeded: boolean
}

export type DueIndexUrl = DueUrl & {
  property: string
}

export type DueIndexSelection = {
  selected: DueIndexUrl[]
  summary: {
    neverAttempted: number
    neverSucceeded: number
    retryWaiting: number
    fresh: number
    stale: number
    due: number
    unselectedDue: number
  }
}

function latestInspectionStates(
  rootSite: string,
  urls: string[],
): Map<string, InspectionState> {
  if (!urls.length) return new Map()
  const latest = new Map<string, InspectionState>()
  const chunkSize = 500

  for (let index = 0; index < urls.length; index += chunkSize) {
    const chunk = urls.slice(index, index + chunkSize)
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = getDb()
      .prepare(
        `WITH ranked AS (
          SELECT url, inspected_at, inspection_status, error_code,
            MAX(CASE
              WHEN inspection_status = 'succeeded' AND error_code IS NULL
              THEN inspected_at
            END) OVER (PARTITION BY url) AS latest_success_at,
            ROW_NUMBER() OVER (
              PARTITION BY url ORDER BY inspected_at DESC, id DESC
            ) AS attempt_rank
          FROM index_watch_snapshots
          WHERE root_site_url = ? AND url IN (${placeholders})
        )
        SELECT * FROM ranked WHERE attempt_rank = 1`,
      )
      .all(rootSite, ...chunk) as Array<{
      url: string
      inspected_at?: number | null
      latest_success_at?: number | null
      inspection_status?: string | null
      error_code?: string | null
    }>

    for (const row of rows) {
      latest.set(row.url, {
        latestAttemptAt: row.inspected_at ?? undefined,
        latestSuccessAt: row.latest_success_at ?? undefined,
        latestAttemptSucceeded:
          row.inspection_status === 'succeeded' && !row.error_code,
      })
    }
  }

  return latest
}

function dueUrlsForProperty(
  rootSite: string,
  urls: string[],
  limit: number,
  dueBefore: number,
  retryBefore: number,
): {
  dueUrls: DueUrl[]
  counts: Omit<DueIndexSelection['summary'], 'due' | 'unselectedDue'>
} {
  const latest = latestInspectionStates(rootSite, urls)
  const counts = {
    neverAttempted: 0,
    neverSucceeded: 0,
    retryWaiting: 0,
    fresh: 0,
    stale: 0,
  }
  const dueUrls: DueUrl[] = []
  for (const url of urls) {
    const state = latest.get(url)
    if (!state) {
      counts.neverAttempted += 1
      dueUrls.push({ url, dueReason: 'never-attempted' })
      continue
    }
    if (
      !state.latestAttemptSucceeded &&
      state.latestAttemptAt &&
      state.latestAttemptAt > retryBefore
    ) {
      counts.retryWaiting += 1
      continue
    }
    if (!state.latestSuccessAt) {
      counts.neverSucceeded += 1
      dueUrls.push({ url, dueReason: 'never-succeeded' })
      continue
    }
    if (state.latestSuccessAt <= dueBefore) {
      counts.stale += 1
      dueUrls.push({
        url,
        lastInspectedAt: state.latestSuccessAt,
        dueReason: 'stale',
      })
      continue
    }
    counts.fresh += 1
  }
  return {
    counts,
    dueUrls: dueUrls
      .sort(
        (a, b) =>
          (a.lastInspectedAt ?? 0) - (b.lastInspectedAt ?? 0) ||
          (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
      )
      .slice(0, limit),
  }
}

export function planDueIndexUrls(input: {
  site: string
  urls: string[]
  accountProperties: string[]
  dailyLimit: number
  inspectLimit: number
  staleAfterDays?: number
  failureRetryHours?: number
  now?: Date
}): DueIndexSelection {
  const dailyLimit = integerOption({
    value: input.dailyLimit,
    fallback: 2_000,
    minimum: 1,
    maximum: 2_000,
    label: 'dailyLimit',
  })
  const inspectLimit = integerOption({
    value: input.inspectLimit,
    fallback: Math.min(dailyLimit, 100),
    minimum: 1,
    maximum: 100,
    label: 'inspectLimit',
  })
  const staleAfterDays = integerOption({
    value: input.staleAfterDays,
    fallback: 1,
    minimum: 1,
    maximum: 365,
    label: 'staleAfterDays',
  })
  const failureRetryHours = integerOption({
    value: input.failureRetryHours,
    fallback: 24,
    minimum: 1,
    maximum: 168,
    label: 'failureRetryHours',
  })
  const now = (input.now ?? new Date()).getTime()
  const dueBefore = now - staleAfterDays * 86_400_000
  const retryBefore = now - failureRetryHours * 3_600_000
  const allocations = allocateIndexUrlsToProperties({
    site: input.site,
    urls: input.urls,
    accountProperties: input.accountProperties,
  })
  const dueByProperty = allocations.map((allocation) => {
    const due = dueUrlsForProperty(
      input.site,
      allocation.urls,
      dailyLimit,
      dueBefore,
      retryBefore,
    )
    return { allocation, ...due, cursor: 0 }
  })
  const selected: DueIndexUrl[] = []
  let remaining = inspectLimit
  const firstPassLimit = Math.max(
    1,
    Math.floor(inspectLimit / Math.max(1, dueByProperty.length)),
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

  const counts = dueByProperty.reduce(
    (total, item) => ({
      neverAttempted: total.neverAttempted + item.counts.neverAttempted,
      neverSucceeded: total.neverSucceeded + item.counts.neverSucceeded,
      retryWaiting: total.retryWaiting + item.counts.retryWaiting,
      fresh: total.fresh + item.counts.fresh,
      stale: total.stale + item.counts.stale,
    }),
    {
      neverAttempted: 0,
      neverSucceeded: 0,
      retryWaiting: 0,
      fresh: 0,
      stale: 0,
    },
  )
  const due = counts.neverAttempted + counts.neverSucceeded + counts.stale
  return {
    selected,
    summary: {
      ...counts,
      due,
      unselectedDue: Math.max(0, due - selected.length),
    },
  }
}

export function selectDueIndexUrls(
  input: Parameters<typeof planDueIndexUrls>[0],
): DueIndexUrl[] {
  return planDueIndexUrls(input).selected
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
  const staleAfterDays = 1
  const failureRetryHours = 24
  if (!input.sitemaps.length || input.sitemaps.length > 20) {
    throw new SeoError('INVALID_INPUT', 'Pass between 1 and 20 sitemap URLs.')
  }
  const sitemaps = input.sitemaps.map(normalizeHttpUrl)
  const dailyLimit = integerOption({
    value: input.dailyLimit,
    fallback: 2_000,
    minimum: 1,
    maximum: 2_000,
    label: 'dailyLimit',
  })
  const inspectLimit = integerOption({
    value: input.inspectLimit,
    fallback: Math.min(dailyLimit, 100),
    minimum: 1,
    maximum: 100,
    label: 'inspectLimit',
  })
  const maxUrls = integerOption({
    value: input.maxUrls,
    fallback: 50_000,
    minimum: 1,
    maximum: 250_000,
    label: 'maxUrls',
  })
  const sitemapResults = await Promise.all(
    sitemaps.map((sitemapUrl) =>
      fetchSitemapUrls({ sitemapUrl, limit: maxUrls }),
    ),
  )
  const discoveredUrls = [
    ...new Set(sitemapResults.flatMap((result) => result.urls)),
  ].slice(0, maxUrls)
  const warnings = sitemapResults.flatMap((result) => result.warnings)
  const inventoryUrls: string[] = []
  let invalidUrls = 0
  for (const url of discoveredUrls) {
    try {
      inventoryUrls.push(assertUrlMatchesGscProperty(input.site, url))
    } catch (error) {
      invalidUrls += 1
      warnings.push(error instanceof Error ? error.message : String(error))
    }
  }
  const possiblyTruncated = sitemapResults.some(
    (result) =>
      result.urls.length >= maxUrls || result.nestedSitemaps.length >= 50,
  )
  if (possiblyTruncated) {
    warnings.push(
      'Sitemap discovery reached a configured URL or nested-sitemap boundary; inventory and skipped counts may be incomplete.',
    )
  }
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
  const selection = planDueIndexUrls({
    site: input.site,
    urls: inventoryUrls,
    accountProperties,
    dailyLimit,
    inspectLimit,
    staleAfterDays,
    failureRetryHours,
  })
  const selected = selection.selected
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
        attempted: 0,
        inspected: 0,
        failed: 0,
        quotaBlocked: 0,
        deferred: 0,
        currentIssues: 0,
        changed: 0,
        regressions: 0,
        recoveries: 0,
        alerts: 0,
        sampleUrls: allocation.urls.slice(0, 3),
      })
      continue
    }

    const report = await indexWatch({
      site: allocation.property,
      rootSite: input.site,
      urls,
      languageCode: input.languageCode,
      dailyLimit,
      continueOnPropertyError: true,
    })
    items.push(...report.items)
    warnings.push(...report.warnings)
    properties.push({
      property: allocation.property,
      inventoryUrls: allocation.urls.length,
      selectedUrls: urls.length,
      attempted: report.summary.attempted,
      inspected: report.summary.inspected,
      failed: report.summary.failed,
      quotaBlocked: report.summary.quotaBlocked,
      deferred: report.summary.deferred,
      currentIssues: report.summary.currentIssues,
      changed: report.summary.changed,
      regressions: report.summary.regressions,
      recoveries: report.summary.recoveries,
      alerts: report.summary.alerts,
      sampleUrls: urls.slice(0, 3),
    })
  }

  return {
    schemaVersion: 1,
    methodology: 'index-monitor-v2',
    site: input.site,
    generatedAt: new Date().toISOString(),
    dataStatus:
      possiblyTruncated ||
      warnings.length > 0 ||
      items.some((item) => item.inspectionStatus !== 'succeeded')
        ? 'partial'
        : 'complete',
    source: {
      type: 'sitemap-url-inspection-indexed-snapshot',
      sitemaps,
      maxUrls,
      dailyLimit,
      inspectLimit,
      staleAfterDays,
      failureRetryHours,
      possiblyTruncated,
      discoveredUrls: discoveredUrls.length,
      invalidUrls,
    },
    summary: {
      inventoryUrls: inventoryUrls.length,
      properties: allocations.length,
      dailyCapacity: allocations.length * dailyLimit,
      neverAttempted: selection.summary.neverAttempted,
      neverSucceeded: selection.summary.neverSucceeded,
      retryWaiting: selection.summary.retryWaiting,
      fresh: selection.summary.fresh,
      stale: selection.summary.stale,
      due: selection.summary.due,
      selected: selected.length,
      unselectedDue: selection.summary.unselectedDue,
      attempted: items.filter((item) => item.requestSent).length,
      inspected: items.filter((item) => item.inspectionStatus === 'succeeded')
        .length,
      failed: items.filter((item) => item.inspectionStatus === 'failed').length,
      quotaBlocked: items.filter(
        (item) => item.inspectionStatus === 'quota-blocked',
      ).length,
      deferred: items.filter((item) => item.inspectionStatus === 'deferred')
        .length,
      currentIssues: items.filter((item) => item.currentIssue).length,
      changed: items.filter((item) => item.changed).length,
      regressions: items.filter((item) => item.regression).length,
      recoveries: items.filter((item) => item.recovery).length,
      alerts: items.filter((item) => item.alert).length,
      skipped: Math.max(0, inventoryUrls.length - selected.length),
    },
    properties,
    items,
    caveats: [
      "URL Inspection reports Google's indexed snapshot for one URL, not a live test of the current page.",
      'Due URLs are never-attempted, never-successful, or at least one day past their latest successful inspection. Failed attempts wait 24 hours before retry.',
      'Selected URLs are a bounded oldest-first sample across matching Search Console properties; current issue counts describe the selected results, not every sitemap URL.',
      'Excluded and canonical-difference issue codes require review against the intended URL state and are not automatically defects.',
      'The local quota ledger uses a conservative UTC-day safety cap and cannot see URL Inspection calls made by other machines or Google clients.',
    ],
    warnings,
  }
}
