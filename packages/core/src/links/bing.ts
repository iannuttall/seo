import type {
  BingLinkCountRow,
  BingUrlLinkRow,
  BingWebmasterClient,
} from '../bing/client.js'
import { createBingWebmasterClient } from '../bing/credentials.js'
import { SeoError } from '../errors.js'
import {
  compareLinkEvidence,
  linkEvidenceKey,
  normalizeLinkEvidenceRow,
} from './normalize.js'
import type {
  CollectedLinkEvidence,
  LinkEvidenceRow,
  LinkTargetCount,
} from './types.js'

const MAX_COUNT_PAGES = 5
const DEFAULT_TARGET_LIMIT = 20
const MAX_TARGET_LIMIT = 50
const DEFAULT_DETAIL_PAGES = 1
const MAX_DETAIL_PAGES = 3
const DEFAULT_ROW_LIMIT = 500
const MAX_ROW_LIMIT = 1_000
const MAX_CONCURRENCY = 3

function integer(
  value: number | undefined,
  fallback: number,
  max: number,
  name: string,
): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > max) {
    throw new SeoError('INVALID_INPUT', `${name} must be between 1 and ${max}.`)
  }
  return resolved
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  work: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length)
  let next = 0
  async function worker() {
    while (next < values.length) {
      const index = next
      next += 1
      const value = values[index]
      if (value !== undefined) output[index] = await work(value)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () =>
      worker(),
    ),
  )
  return output
}

async function targetDetails(input: {
  client: BingWebmasterClient
  site: string
  target: BingLinkCountRow
  pages: number
}): Promise<{
  rows: BingUrlLinkRow[]
  requestedPages: number
  invalidRows: number
  returnedRows: number
  partial: boolean
  failed: boolean
}> {
  const rows: BingUrlLinkRow[] = []
  let requestedPages = 0
  let invalidRows = 0
  let returnedRows = 0
  let partial = false
  let totalPages = 0
  for (let page = 0; page < input.pages; page += 1) {
    requestedPages += 1
    let response
    try {
      response = await input.client.getUrlLinks(
        input.site,
        input.target.url,
        page,
      )
    } catch (error) {
      if (
        error instanceof SeoError &&
        (error.code === 'AUTH_REQUIRED' || error.code === 'ACCESS_DENIED')
      ) {
        throw error
      }
      return {
        rows,
        requestedPages,
        invalidRows,
        returnedRows,
        partial: true,
        failed: true,
      }
    }
    invalidRows += response.invalidRows
    returnedRows += response.returnedRows
    rows.push(...response.rows)
    totalPages = response.totalPages
    partial ||= response.capped
    if (page + 1 >= response.totalPages || response.rows.length === 0) break
  }
  partial ||= requestedPages < totalPages
  return {
    rows,
    requestedPages,
    invalidRows,
    returnedRows,
    partial,
    failed: false,
  }
}

export async function collectBingLinkEvidence(input: {
  site: string
  client?: BingWebmasterClient
  targetLimit?: number
  detailPagesPerTarget?: number
  rowLimit?: number
}): Promise<CollectedLinkEvidence> {
  if (!input.site.trim()) {
    throw new SeoError('INVALID_INPUT', 'Pass a Bing Webmaster site URL.')
  }
  const targetLimit = integer(
    input.targetLimit,
    DEFAULT_TARGET_LIMIT,
    MAX_TARGET_LIMIT,
    'Bing link target limit',
  )
  const detailPages = integer(
    input.detailPagesPerTarget,
    DEFAULT_DETAIL_PAGES,
    MAX_DETAIL_PAGES,
    'Bing detail page limit',
  )
  const rowLimit = integer(
    input.rowLimit,
    DEFAULT_ROW_LIMIT,
    MAX_ROW_LIMIT,
    'Bing link row limit',
  )
  const client = input.client ?? (await createBingWebmasterClient()).client

  const countRows: BingLinkCountRow[] = []
  let countPagesRequested = 0
  let invalidRows = 0
  let countInvalidRows = 0
  let countRowsReturned = 0
  let partial = false
  let totalCountPages = 0
  for (let page = 0; page < MAX_COUNT_PAGES; page += 1) {
    const response = await client.getLinkCounts(input.site, page)
    countPagesRequested += 1
    invalidRows += response.invalidRows
    countInvalidRows += response.invalidRows
    countRowsReturned += response.returnedRows
    countRows.push(...response.rows)
    totalCountPages = response.totalPages
    partial ||= response.capped
    if (
      countRows.length >= targetLimit ||
      page + 1 >= response.totalPages ||
      response.rows.length === 0
    ) {
      break
    }
  }
  partial ||= countPagesRequested < totalCountPages
  const countsByUrl = new Map<string, number>()
  for (const row of countRows) {
    countsByUrl.set(row.url, Math.max(row.count, countsByUrl.get(row.url) ?? 0))
  }
  const counts = [...countsByUrl].map(([url, count]) => ({ url, count }))
  counts.sort((a, b) => b.count - a.count || a.url.localeCompare(b.url, 'en'))
  const selectedTargets = counts.slice(0, targetLimit)
  partial ||= counts.length > targetLimit

  const details = await mapConcurrent(
    selectedTargets,
    MAX_CONCURRENCY,
    async (target) =>
      targetDetails({
        client,
        site: input.site,
        target,
        pages: detailPages,
      }),
  )
  const rows: LinkEvidenceRow[] = []
  const keys = new Set<string>()
  let duplicateRows = 0
  let detailPagesRequested = 0
  let detailInvalidRows = 0
  let detailRowsReturned = 0
  let failedTargets = 0
  for (const [index, detail] of details.entries()) {
    const target = selectedTargets[index]
    if (!target) continue
    detailPagesRequested += detail.requestedPages
    if (detail.failed) failedTargets += 1
    invalidRows += detail.invalidRows
    detailInvalidRows += detail.invalidRows
    detailRowsReturned += detail.returnedRows
    partial ||= detail.partial
    for (const source of detail.rows) {
      if (rows.length >= rowLimit) {
        partial = true
        break
      }
      const row = normalizeLinkEvidenceRow({
        sourceUrl: source.url,
        targetUrl: target.url,
        anchorText: source.anchorText,
      })
      if (!row) {
        invalidRows += 1
        continue
      }
      const key = linkEvidenceKey(row)
      if (keys.has(key)) {
        duplicateRows += 1
        continue
      }
      keys.add(key)
      rows.push(row)
    }
  }
  rows.sort(compareLinkEvidence)
  const targetCounts: LinkTargetCount[] = selectedTargets.map((target) => ({
    targetUrl: target.url,
    providerReportedLinks: target.count,
    observedLinks: rows.filter((row) => row.targetUrl === target.url).length,
  }))
  const observedAt = new Date().toISOString()

  return {
    rows,
    targetCounts,
    provenance: {
      provider: 'bing-webmaster',
      observedAt,
      cached: false,
      suppliedRows: detailRowsReturned + detailInvalidRows,
      validRows: rows.length,
      invalidRows,
      duplicateRows,
      capped: partial,
      rowLimit,
      completeness: partial ? 'partial' : 'unknown',
      providerRequests: {
        methods: ['GetLinkCounts', 'GetUrlLinks'],
        targetPagesRequested: countPagesRequested,
        detailPagesRequested,
        maxConcurrentRequests: MAX_CONCURRENCY,
      },
      providerCoverage: {
        targetCountRows: {
          returnedRows: countRowsReturned,
          retainedRows: counts.length,
          invalidRows: countInvalidRows,
        },
        detailRows: {
          returnedRows: detailRowsReturned,
          retainedRows: rows.length,
          invalidRows: detailInvalidRows,
        },
      },
    },
    warnings: [
      ...(partial
        ? [
            'Bing link evidence was bounded by provider pagination, failed requests, or report limits.',
          ]
        : []),
      ...(failedTargets
        ? [
            `${failedTargets} target detail request${failedTargets === 1 ? '' : 's'} failed while other evidence was retained.`,
          ]
        : []),
    ],
  }
}
