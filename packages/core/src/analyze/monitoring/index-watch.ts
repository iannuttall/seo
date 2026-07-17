import { randomUUID } from 'node:crypto'
import { SeoError, toSeoError } from '../../errors.js'
import { UrlInspectionQuotaError } from '../../gsc/client/inspection-quota.js'
import {
  inspectUrl,
  type UrlInspectionRequest,
  type UrlInspectionResult,
} from '../../gsc/client.js'
import { assertUrlMatchesGscProperty } from '../../gsc/property-url.js'
import { getDb } from '../../storage/database.js'
import { integerOption } from '../site-diagnostics/quick-wins-report-input.js'
import {
  indexWatchFailureItem,
  indexWatchIssueCodes,
  indexWatchItemFromInspection,
} from './index-watch-analysis.js'
import type {
  IndexWatchItem,
  IndexWatchPrevious,
  IndexWatchReport,
  IndexWatchRow,
} from './types.js'

const MAX_DIRECT_INSPECTIONS = 100
export const INDEX_WATCH_ATTEMPT_RETENTION = 20

type InspectUrl = (input: UrlInspectionRequest) => Promise<UrlInspectionResult>

export type IndexWatchStore = {
  latest(rootSite: string, url: string): IndexWatchPrevious | undefined
  insert(item: IndexWatchItem): void
}

export type IndexWatchDependencies = {
  inspectUrl: InspectUrl
  now: () => Date
  store: IndexWatchStore
}

function previousFromRow(row: IndexWatchRow): IndexWatchPrevious | undefined {
  if (!row.inspected_at) return undefined
  return {
    inspectedAt: new Date(row.inspected_at).toISOString(),
    verdict: row.verdict ?? undefined,
    coverageState: row.coverage_state ?? undefined,
    indexingState: row.indexing_state ?? undefined,
    robotsTxtState: row.robots_txt_state ?? undefined,
    pageFetchState: row.page_fetch_state ?? undefined,
    googleCanonical: row.google_canonical ?? undefined,
    userCanonical: row.user_canonical ?? undefined,
    lastCrawlTime: row.last_crawl_time ?? undefined,
  }
}

export function pruneIndexWatchSnapshots(
  rootSite: string,
  url: string,
  database: ReturnType<typeof getDb> = getDb(),
): number {
  return database
    .prepare(
      `WITH attempts AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY root_site_url, url
            ORDER BY inspected_at DESC, id DESC
          ) AS attempt_rank
        FROM index_watch_snapshots
        WHERE root_site_url = ? AND url = ?
      ), latest_success AS (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (
              ORDER BY inspected_at DESC, id DESC
            ) AS success_rank
          FROM index_watch_snapshots
          WHERE root_site_url = ? AND url = ?
            AND inspection_status = 'succeeded'
            AND error_code IS NULL
        )
        WHERE success_rank = 1
      )
      DELETE FROM index_watch_snapshots
      WHERE id IN (
        SELECT attempts.id
        FROM attempts
        LEFT JOIN latest_success ON latest_success.id = attempts.id
        WHERE attempts.attempt_rank > ? AND latest_success.id IS NULL
      )`,
    )
    .run(rootSite, url, rootSite, url, INDEX_WATCH_ATTEMPT_RETENTION).changes
}

const sqliteIndexWatchStore: IndexWatchStore = {
  latest(rootSite, url) {
    const row = getDb()
      .prepare(
        `SELECT *
        FROM index_watch_snapshots
        WHERE root_site_url = ? AND url = ? AND error_code IS NULL
        ORDER BY inspected_at DESC, id DESC
        LIMIT 1`,
      )
      .get(rootSite, url) as IndexWatchRow | undefined
    return row ? previousFromRow(row) : undefined
  },
  insert(item) {
    const db = getDb()
    db.prepare(
      `INSERT INTO index_watch_snapshots
        (id, site_url, root_site_url, property_site_url, url, verdict,
         coverage_state, indexing_state, robots_txt_state, page_fetch_state,
         google_canonical, user_canonical, last_crawl_time, inspection_status,
         error_code, error_message, inspected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      item.property,
      item.rootSite,
      item.property,
      item.url,
      item.verdict ?? null,
      item.coverageState ?? null,
      item.indexingState ?? null,
      item.robotsTxtState ?? null,
      item.pageFetchState ?? null,
      item.googleCanonical ?? null,
      item.userCanonical ?? null,
      item.lastCrawlTime ?? null,
      item.inspectionStatus,
      item.errorCode ?? null,
      item.errorMessage ?? null,
      Date.parse(item.inspectedAt),
    )
    pruneIndexWatchSnapshots(item.rootSite, item.url, db)
  },
}

const defaultDependencies: IndexWatchDependencies = {
  inspectUrl,
  now: () => new Date(),
  store: sqliteIndexWatchStore,
}

function validateLanguageCode(value?: string): string | undefined {
  const code = value?.trim()
  if (!code) return undefined
  if (code.length > 35 || !/^[A-Za-z0-9-]+$/.test(code)) {
    throw new SeoError(
      'INVALID_INPUT',
      'languageCode must be a valid BCP 47 tag.',
    )
  }
  return code
}

function normalizedUrls(property: string, urls: string[]): string[] {
  if (!urls.length) {
    throw new SeoError('INVALID_INPUT', 'Pass at least one URL to inspect.')
  }
  if (urls.length > MAX_DIRECT_INSPECTIONS) {
    throw new SeoError(
      'INVALID_INPUT',
      `Direct index watch accepts at most ${MAX_DIRECT_INSPECTIONS} URLs per run.`,
    )
  }
  return [
    ...new Set(urls.map((url) => assertUrlMatchesGscProperty(property, url))),
  ]
}

function failureCode(error: unknown): string {
  return error instanceof SeoError
    ? error.code.toLowerCase()
    : 'inspection_failed'
}

function isFatalBatchError(error: SeoError): boolean {
  return ['AUTH_CONFIG_REQUIRED', 'AUTH_EXPIRED', 'AUTH_REQUIRED'].includes(
    error.code,
  )
}

export async function indexWatch(
  input: {
    site: string
    rootSite?: string
    urls: string[]
    languageCode?: string
    dailyLimit?: number
    continueOnPropertyError?: boolean
  },
  dependencies: IndexWatchDependencies = defaultDependencies,
): Promise<IndexWatchReport> {
  const languageCode = validateLanguageCode(input.languageCode)
  const dailyLimit = integerOption({
    value: input.dailyLimit,
    fallback: 2_000,
    minimum: 1,
    maximum: 2_000,
    label: 'dailyLimit',
  })
  const urls = normalizedUrls(input.site, input.urls)
  const rootSite = input.rootSite ?? input.site
  const items: IndexWatchItem[] = []
  const warnings: string[] = []

  for (const [index, url] of urls.entries()) {
    const inspectedAt = dependencies.now().toISOString()
    try {
      const result = await dependencies.inspectUrl({
        siteUrl: input.site,
        inspectionUrl: url,
        languageCode,
        quotaLimit: dailyLimit,
      })
      const item = indexWatchItemFromInspection({
        rootSite,
        property: input.site,
        url,
        inspectedAt,
        result,
        previous: dependencies.store.latest(rootSite, url),
      })
      dependencies.store.insert(item)
      items.push(item)
    } catch (error) {
      const normalized = toSeoError(error)
      if (isFatalBatchError(normalized)) throw normalized
      const propertyError = ['ACCESS_DENIED', 'PROPERTY_NOT_FOUND'].includes(
        normalized.code,
      )
      if (propertyError && !input.continueOnPropertyError) throw normalized
      const quotaBlocked = normalized.code === 'RATE_LIMITED'
      const requestSent =
        normalized instanceof UrlInspectionQuotaError
          ? normalized.requestSent
          : true
      const retryAt =
        normalized instanceof UrlInspectionQuotaError
          ? normalized.resetAt
          : undefined
      const item = indexWatchFailureItem({
        rootSite,
        property: input.site,
        url,
        inspectedAt,
        errorCode: failureCode(normalized),
        errorMessage: normalized.message,
        quotaBlocked,
        requestSent,
        retryAt,
      })
      dependencies.store.insert(item)
      items.push(item)
      warnings.push(`${url}: ${normalized.message}`)

      if (quotaBlocked || propertyError) {
        for (const blockedUrl of urls.slice(index + 1)) {
          const blocked = indexWatchFailureItem({
            rootSite,
            property: input.site,
            url: blockedUrl,
            inspectedAt: dependencies.now().toISOString(),
            errorCode: quotaBlocked
              ? 'rate_limited'
              : normalized.code.toLowerCase(),
            errorMessage: quotaBlocked
              ? 'URL Inspection quota is blocked for this property; no request was sent.'
              : `URL Inspection stopped for this property after ${normalized.code}; no request was sent.`,
            quotaBlocked,
            deferred: true,
            requestSent: false,
            retryAt,
          })
          items.push(blocked)
        }
        break
      }
    }
  }

  const inspected = items.filter(
    (item) => item.inspectionStatus === 'succeeded',
  ).length
  const failed = items.filter(
    (item) => item.inspectionStatus === 'failed',
  ).length
  const quotaBlocked = items.filter(
    (item) => item.inspectionStatus === 'quota-blocked',
  ).length
  const deferred = items.filter(
    (item) => item.inspectionStatus === 'deferred',
  ).length
  const currentIssues = items.filter((item) => item.currentIssue).length
  return {
    schemaVersion: 1,
    methodology: 'index-watch-v2',
    site: rootSite,
    generatedAt: dependencies.now().toISOString(),
    dataStatus: failed || quotaBlocked || deferred ? 'partial' : 'complete',
    source: {
      type: 'url-inspection-indexed-snapshot',
      property: input.site,
      dailyLimit,
      languageCode,
    },
    summary: {
      requested: input.urls.length,
      unique: urls.length,
      attempted: items.filter((item) => item.requestSent).length,
      inspected,
      failed,
      quotaBlocked,
      deferred,
      currentIssues,
      changed: items.filter((item) => item.changed).length,
      regressions: items.filter((item) => item.regression).length,
      recoveries: items.filter((item) => item.recovery).length,
      alerts: items.filter((item) => item.alert).length,
    },
    caveats: [
      "URL Inspection reports Google's indexed snapshot for one URL, not a live test of the current page.",
      'PASS, NEUTRAL, and FAIL map to indexed, excluded, and invalid. Translated coverage text is display evidence only.',
      'An excluded URL or canonical difference may be intentional. Issue codes mean review the URL against its intended state, not that every URL is defective.',
      'The local quota ledger uses a conservative UTC-day safety cap and cannot see URL Inspection calls made by other machines or Google clients.',
    ],
    warnings,
    items,
  }
}

export function latestIndexWatchSummary(site: string): {
  inspectedUrls: number
  earliestInspectedAt?: string
  latestInspectedAt?: string
  currentIssues: number
  failed: number
  nonPass: number
  blocked: number
} {
  const rows = getDb()
    .prepare(
      `WITH attempts AS (
        SELECT snapshot.*,
          ROW_NUMBER() OVER (
            PARTITION BY url
            ORDER BY inspected_at DESC, id DESC
          ) AS attempt_rank
        FROM index_watch_snapshots snapshot
        WHERE root_site_url = ?
      ), successes AS (
        SELECT snapshot.*,
          ROW_NUMBER() OVER (
            PARTITION BY url
            ORDER BY inspected_at DESC, id DESC
          ) AS success_rank
        FROM index_watch_snapshots snapshot
        WHERE root_site_url = ?
          AND inspection_status = 'succeeded'
          AND error_code IS NULL
      )
      SELECT
        attempts.url,
        attempts.inspected_at AS attempt_inspected_at,
        attempts.error_code AS latest_error_code,
        successes.inspected_at AS success_inspected_at,
        successes.verdict,
        successes.indexing_state,
        successes.robots_txt_state,
        successes.page_fetch_state,
        successes.google_canonical,
        successes.user_canonical
      FROM attempts
      LEFT JOIN successes
        ON successes.url = attempts.url AND successes.success_rank = 1
      WHERE attempts.attempt_rank = 1`,
    )
    .all(site, site) as Array<
    IndexWatchRow & {
      attempt_inspected_at?: number | null
      latest_error_code?: string | null
      success_inspected_at?: number | null
    }
  >
  const timestamps = rows
    .map((row) => row.success_inspected_at)
    .filter((value): value is number => Boolean(value))
  const earliestTimestamp = timestamps.reduce(
    (earliest, timestamp) => Math.min(earliest, timestamp),
    Number.POSITIVE_INFINITY,
  )
  const successful = rows.filter((row) => Boolean(row.success_inspected_at))
  const issues = successful.map((row) =>
    indexWatchIssueCodes({
      verdict: row.verdict ?? undefined,
      indexingState: row.indexing_state ?? undefined,
      robotsTxtState: row.robots_txt_state ?? undefined,
      pageFetchState: row.page_fetch_state ?? undefined,
      googleCanonical: row.google_canonical ?? undefined,
      userCanonical: row.user_canonical ?? undefined,
    }),
  )

  return {
    inspectedUrls: rows.length,
    earliestInspectedAt: timestamps.length
      ? new Date(earliestTimestamp).toISOString()
      : undefined,
    latestInspectedAt: rows.length
      ? new Date(
          Math.max(...rows.map((row) => row.attempt_inspected_at ?? 0)),
        ).toISOString()
      : undefined,
    currentIssues: issues.filter((codes) => codes.length > 0).length,
    failed: rows.filter((row) => Boolean(row.latest_error_code)).length,
    nonPass: successful.filter((row) => row.verdict && row.verdict !== 'PASS')
      .length,
    blocked: issues.filter((codes) =>
      codes.some((code) =>
        [
          'indexing_blocked_header',
          'indexing_blocked_meta',
          'page_fetch_failed',
          'robots_disallowed',
        ].includes(code),
      ),
    ).length,
  }
}
