import type { ZodType } from 'zod'
import {
  finalizeProviderSpend,
  type ProviderSpendNotice,
  reserveProviderSpend,
} from '../../storage/provider-spend.js'
import type Database from '../../storage/sqlite.js'
import { readProviderCache, writeProviderCache } from '../cache.js'
import type {
  ProviderCacheEvidence,
  ProviderCapability,
  ProviderCostEvidence,
  ProviderRequestContext,
  ProviderWarning,
} from '../contracts.js'
import type { ProviderSpendLimits } from '../cost-limits.js'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import type { DataForSeoCredentials } from './credentials.js'

export type DataForSeoPaidResponse = {
  status_code: number
  status_message?: string
  cost?: number
  tasks_error: number
  tasks: Array<{
    id?: string
    status_code: number
    status_message?: string
    cost?: number
  }>
}

export type DataForSeoUnitPrice = {
  perRequestMicros: number | null
  perResultMicros: number | null
}

export type DataForSeoPaidSnapshot<T> = {
  response: T
  observedAt: string
  returnedRows: number
  cache: ProviderCacheEvidence
  cost: ProviderCostEvidence
  spendNotice: ProviderSpendNotice | null
  warnings: ProviderWarning[]
}

function usdToMicros(value: number | undefined): number | null {
  if (value === undefined) return null
  return Math.round(value * 1_000_000)
}

function responseTaskIds(response: DataForSeoPaidResponse): string[] {
  return [
    ...new Set(response.tasks.flatMap((task) => (task.id ? [task.id] : []))),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

function responseCostMicros(response: DataForSeoPaidResponse): number | null {
  if (response.cost !== undefined) return usdToMicros(response.cost)
  if (response.tasks.some((task) => task.cost === undefined)) return null
  return response.tasks.reduce(
    (sum, task) => sum + (usdToMicros(task.cost) ?? 0),
    0,
  )
}

function taskErrorCode(
  statusCode: number,
): 'authentication' | 'rate-limit' | 'remote-error' {
  if (statusCode >= 40100 && statusCode < 40200) return 'authentication'
  if (statusCode === 40202) return 'rate-limit'
  return 'remote-error'
}

export async function dataForSeoPaidPost<
  T extends DataForSeoPaidResponse,
>(input: {
  operation: string
  capability: ProviderCapability
  endpoint: string
  request: unknown
  schema: ZodType<T>
  requestedRows: number
  estimatedRequestUnits?: number
  price: () => Promise<DataForSeoUnitPrice>
  context: ProviderRequestContext
  ttlMs: number
  refresh?: boolean
  rowCount: (response: T) => number
  credentials: DataForSeoCredentials
  credentialScope: string
  baseUrl: string
  fetch: ProviderFetch
  maxResponseBytes: number
  timeoutMs: number
  now: () => Date
  database?: Database.Database
  spendLimits?: ProviderSpendLimits
}): Promise<DataForSeoPaidSnapshot<T>> {
  const cacheKey = {
    provider: 'dataforseo' as const,
    credentialScope: input.credentialScope,
    operation: input.operation,
    request: input.request,
  }
  const cached = input.refresh
    ? null
    : readProviderCache(cacheKey, input.schema, {
        database: input.database,
        now: input.now().getTime(),
      })
  if (cached) {
    return {
      response: cached.data,
      observedAt: cached.storedAt,
      returnedRows: cached.rowCount ?? input.rowCount(cached.data),
      cache: {
        status: 'hit',
        storedAt: cached.storedAt,
        expiresAt: cached.expiresAt,
      },
      cost: {
        currency: 'USD',
        estimatedMicros: 0,
        actualMicros: 0,
        taskIds: cached.taskIds,
      },
      spendNotice: null,
      warnings: [],
    }
  }

  const price = await input.price()
  if (price.perRequestMicros === null || price.perResultMicros === null) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: input.operation,
      code: 'invalid-response',
      message: `DataForSEO account pricing for ${input.operation} is unavailable, so the paid request was not started.`,
    })
  }
  const estimatedCostMicros =
    price.perRequestMicros * (input.estimatedRequestUnits ?? 1) +
    price.perResultMicros * input.requestedRows
  const reservation = reserveProviderSpend(
    {
      provider: 'dataforseo',
      capability: input.capability,
      endpoint: input.endpoint,
      projectId: input.context.projectId,
      reportId: input.context.reportId,
      reportRunId: input.context.reportRunId,
      requestedRows: input.requestedRows,
      estimatedCostMicros,
    },
    {
      database: input.database,
      limits: input.spendLimits,
      now: input.now().getTime(),
    },
  )

  let response: T
  try {
    response = await providerRequestJson({
      provider: 'dataforseo',
      operation: input.operation,
      url: new URL(input.endpoint, input.baseUrl),
      fetch: input.fetch,
      maxResponseBytes: input.maxResponseBytes,
      timeoutMs: input.timeoutMs,
      retry: 'never',
      schema: input.schema,
      init: {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(
            `${input.credentials.login}:${input.credentials.password}`,
          ).toString('base64')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify([input.request]),
      },
    })
  } catch (error) {
    finalizeProviderSpend(
      reservation.id,
      {
        provider: 'dataforseo',
        state: 'failed',
        actualCostMicros: null,
        returnedRows: null,
        taskIds: [],
      },
      {
        database: input.database,
        limits: input.spendLimits,
        now: input.now().getTime(),
      },
    )
    throw error
  }

  const actualCostMicros = responseCostMicros(response)
  const returnedRows = input.rowCount(response)
  const taskIds = responseTaskIds(response)
  const failedTasks = response.tasks.filter(
    (task) => task.status_code !== 20000,
  )
  const failed =
    response.status_code !== 20000 ||
    response.tasks_error > 0 ||
    failedTasks.length > 0
  const state = failed
    ? failedTasks.length < response.tasks.length
      ? 'partial'
      : 'failed'
    : 'succeeded'
  const spendNotice = finalizeProviderSpend(
    reservation.id,
    {
      provider: 'dataforseo',
      state,
      actualCostMicros,
      returnedRows,
      taskIds,
    },
    {
      database: input.database,
      limits: input.spendLimits,
      now: input.now().getTime(),
    },
  )
  if (failed) {
    const failedTask = failedTasks[0]
    const statusCode = failedTask?.status_code ?? response.status_code
    const statusMessage =
      failedTask?.status_message?.trim() || response.status_message?.trim()
    throw new ProviderError({
      provider: 'dataforseo',
      operation: input.operation,
      code: taskErrorCode(statusCode),
      message: `DataForSEO could not complete ${input.operation} (${statusCode}${statusMessage ? `: ${statusMessage}` : ''}).`,
      retryable: statusCode === 40202,
    })
  }

  const warnings: ProviderWarning[] = []
  try {
    writeProviderCache(
      cacheKey,
      {
        data: response,
        ttlMs: input.ttlMs,
        rowCount: returnedRows,
        sourceCostMicros: actualCostMicros,
        taskIds,
      },
      { database: input.database, now: input.now().getTime() },
    )
  } catch {
    warnings.push({
      code: 'cache-write-failed',
      message:
        'The provider result is valid, but it could not be saved to the local cache.',
    })
  }

  return {
    response,
    observedAt: input.now().toISOString(),
    returnedRows,
    cache: {
      status: input.refresh ? 'bypass' : 'miss',
      storedAt: null,
      expiresAt: null,
    },
    cost: {
      currency: 'USD',
      estimatedMicros: estimatedCostMicros,
      actualMicros: actualCostMicros,
      taskIds,
    },
    spendNotice,
    warnings,
  }
}
