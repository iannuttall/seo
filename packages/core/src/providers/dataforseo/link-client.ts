import type { ZodType } from 'zod'
import type { ProviderCapability } from '../contracts.js'
import { ProviderError } from '../errors.js'
import type {
  DataForSeoAccountSnapshot,
  DataForSeoBacklinksRequest,
  DataForSeoLinkSummaryRequest,
  DataForSeoReferringDomainsRequest,
} from './client-types.js'
import {
  type DataForSeoBacklinksResponse,
  type DataForSeoLinkSummaryResponse,
  type DataForSeoReferringDomainsResponse,
  dataForSeoBacklinksResponseSchema,
  dataForSeoLinkSummaryResponseSchema,
  dataForSeoReferringDomainsResponseSchema,
} from './link-schema.js'
import type {
  DataForSeoPaidResponse,
  DataForSeoUnitPrice,
} from './paid-request.js'

export const DEFAULT_LINK_TTL_MS = 24 * 60 * 60 * 1_000
export const MAX_LINK_ROWS = 1_000
export const MAX_LINK_OFFSET = 20_000

export const LINK_ENDPOINTS = {
  summary: 'v3/backlinks/summary/live',
  backlinks: 'v3/backlinks/backlinks/live',
  referringDomains: 'v3/backlinks/referring_domains/live',
} as const

export type DataForSeoLinkPaidRequest<T extends DataForSeoPaidResponse> = {
  operation: string
  capability: ProviderCapability
  endpoint: string
  request: unknown
  schema: ZodType<T>
  requestedRows: number
  price: (account: DataForSeoAccountSnapshot) => DataForSeoUnitPrice
  context: DataForSeoLinkSummaryRequest['context']
  ttlMs: number
  refresh?: boolean
  rowCount: (response: T) => number
}

function resultRows(response: {
  tasks: Array<{ result?: Array<{ items?: unknown[] | null }> | null }>
}): number {
  return response.tasks.reduce(
    (taskTotal, task) =>
      taskTotal +
      (task.result ?? []).reduce(
        (resultTotal, result) => resultTotal + (result.items?.length ?? 0),
        0,
      ),
    0,
  )
}

function summaryRows(response: DataForSeoLinkSummaryResponse): number {
  return response.tasks.reduce(
    (total, task) => total + (task.result?.length ?? 0),
    0,
  )
}

function commonRequest(input: DataForSeoLinkSummaryRequest) {
  return {
    target: input.target,
    include_subdomains:
      input.scope === 'domain' ? input.includeSubdomains : false,
    include_indirect_links: true,
    exclude_internal_backlinks: true,
    backlinks_status_type: 'live',
    rank_scale: 'one_hundred',
  }
}

function validatePage(input: {
  limit: number
  offset: number
  operation: string
}): void {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_LINK_ROWS
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: input.operation,
      code: 'configuration',
      message: `Link row limit must be from 1 to ${MAX_LINK_ROWS}.`,
    })
  }
  if (
    !Number.isSafeInteger(input.offset) ||
    input.offset < 0 ||
    input.offset > MAX_LINK_OFFSET
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: input.operation,
      code: 'configuration',
      message: `Link row offset must be from 0 to ${MAX_LINK_OFFSET}.`,
    })
  }
}

export function linkSummaryPaidRequest(
  input: DataForSeoLinkSummaryRequest,
  ttlMs: number,
): DataForSeoLinkPaidRequest<DataForSeoLinkSummaryResponse> {
  return {
    operation: 'link-summary',
    capability: 'link-summary',
    endpoint: LINK_ENDPOINTS.summary,
    request: commonRequest(input),
    schema: dataForSeoLinkSummaryResponseSchema,
    requestedRows: 1,
    price: (account) => account.linkPrices.summary,
    context: input.context,
    ttlMs,
    refresh: input.refresh,
    rowCount: summaryRows,
  }
}

export function backlinksPaidRequest(
  input: DataForSeoBacklinksRequest,
  ttlMs: number,
): DataForSeoLinkPaidRequest<DataForSeoBacklinksResponse> {
  validatePage({
    limit: input.limit,
    offset: input.offset,
    operation: 'backlinks',
  })
  if (input.orderBy.length < 1 || input.orderBy.length > 3) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'backlinks',
      code: 'configuration',
      message: 'Backlink rows need from 1 to 3 sort rules.',
    })
  }
  return {
    operation: 'backlinks',
    capability: 'backlinks',
    endpoint: LINK_ENDPOINTS.backlinks,
    request: {
      ...commonRequest(input),
      mode: input.mode,
      backlinks_status_type: input.status,
      limit: input.limit,
      offset: input.offset,
      order_by: input.orderBy,
    },
    schema: dataForSeoBacklinksResponseSchema,
    requestedRows: input.limit,
    price: (account) => account.linkPrices.backlinks,
    context: input.context,
    ttlMs,
    refresh: input.refresh,
    rowCount: resultRows,
  }
}

export function referringDomainsPaidRequest(
  input: DataForSeoReferringDomainsRequest,
  ttlMs: number,
): DataForSeoLinkPaidRequest<DataForSeoReferringDomainsResponse> {
  validatePage({
    limit: input.limit,
    offset: input.offset,
    operation: 'referring-domains',
  })
  if (input.orderBy.length < 1 || input.orderBy.length > 3) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'referring-domains',
      code: 'configuration',
      message: 'Referring-domain rows need from 1 to 3 sort rules.',
    })
  }
  return {
    operation: 'referring-domains',
    capability: 'referring-domains',
    endpoint: LINK_ENDPOINTS.referringDomains,
    request: {
      ...commonRequest(input),
      limit: input.limit,
      offset: input.offset,
      order_by: input.orderBy,
    },
    schema: dataForSeoReferringDomainsResponseSchema,
    requestedRows: input.limit,
    price: (account) => account.linkPrices.referringDomains,
    context: input.context,
    ttlMs,
    refresh: input.refresh,
    rowCount: resultRows,
  }
}
