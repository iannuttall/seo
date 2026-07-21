import {
  finalizeProviderSpend,
  reserveProviderSpend,
} from '../../storage/provider-spend.js'
import type Database from '../../storage/sqlite.js'
import type { ProviderRequestContext } from '../contracts.js'
import type { ProviderSpendLimits } from '../cost-limits.js'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import type {
  DataForSeoSerpReadyTask,
  DataForSeoSerpSnapshot,
  DataForSeoSerpTaskPostSnapshot,
} from './client-types.js'
import type { DataForSeoUnitPrice } from './paid-request.js'
import {
  dataForSeoResponseCostMicros,
  dataForSeoTaskErrorCode,
} from './response.js'
import {
  type DataForSeoSerpResponse,
  dataForSeoSerpResponseSchema,
} from './serp-schema.js'
import {
  dataForSeoSerpTaskPostResponseSchema,
  dataForSeoSerpTasksReadyResponseSchema,
} from './serp-task-schema.js'

export const MAX_SERP_TASKS_PER_POST = 100
export const SERP_TASK_POST_PATH = 'v3/serp/google/organic/task_post'
const SERP_TASKS_READY_PATH = 'v3/serp/google/organic/tasks_ready'
const SERP_TASK_GET_ADVANCED_PATH = 'v3/serp/google/organic/task_get/advanced/'

export type DataForSeoQueuedSerpRequest = {
  keyword: string
  language_code: string
  location_code?: number
  location_name?: string
  device: 'desktop' | 'mobile'
  depth: number
  tag: string
  priority: 1
  remove_from_url: ['srsltid']
}

type SerpTaskTransport = {
  authorization: string
  baseUrl: string
  fetch: ProviderFetch
  maxResponseBytes: number
  timeoutMs: number
  now: () => Date
  database: Database.Database | undefined
  spendLimits: ProviderSpendLimits | undefined
}

export function dataForSeoSerpRows(response: DataForSeoSerpResponse): number {
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

export function validateDataForSeoSerpTaskId(providerTaskId: string): void {
  if (!/^[a-zA-Z0-9-]{1,100}$/u.test(providerTaskId)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-task-get',
      code: 'configuration',
      message: 'Use a valid queued SERP task id.',
    })
  }
}

export async function postDataForSeoSerpTasks(
  input: {
    requests: DataForSeoQueuedSerpRequest[]
    context: ProviderRequestContext
    price: DataForSeoUnitPrice
  },
  transport: SerpTaskTransport,
): Promise<DataForSeoSerpTaskPostSnapshot> {
  const { price, requests } = input
  if (price.perRequestMicros === null || price.perResultMicros === null) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-task-post',
      code: 'invalid-response',
      message:
        'DataForSEO Standard SERP pricing is unavailable, so queued tasks were not posted.',
    })
  }
  const requestUnits = requests.reduce(
    (total, request) => total + Math.ceil(request.depth / 10),
    0,
  )
  const estimatedCostMicros =
    price.perRequestMicros * requestUnits +
    price.perResultMicros * requests.length
  const reservation = reserveProviderSpend(
    {
      provider: 'dataforseo',
      capability: 'serp-snapshot',
      endpoint: SERP_TASK_POST_PATH,
      projectId: input.context.projectId,
      reportId: input.context.reportId,
      reportRunId: input.context.reportRunId,
      requestedRows: requests.length,
      estimatedCostMicros,
    },
    {
      database: transport.database,
      limits: transport.spendLimits,
      now: transport.now().getTime(),
    },
  )
  let response
  try {
    response = await providerRequestJson({
      provider: 'dataforseo',
      operation: 'serp-task-post',
      url: new URL(SERP_TASK_POST_PATH, transport.baseUrl),
      fetch: transport.fetch,
      maxResponseBytes: transport.maxResponseBytes,
      timeoutMs: transport.timeoutMs,
      retry: 'never',
      schema: dataForSeoSerpTaskPostResponseSchema,
      init: {
        method: 'POST',
        headers: {
          authorization: transport.authorization,
          'content-type': 'application/json',
        },
        body: JSON.stringify(requests),
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
        database: transport.database,
        limits: transport.spendLimits,
        now: transport.now().getTime(),
      },
    )
    throw error
  }
  const taskReceipts = response.tasks.flatMap((task) =>
    task.id && task.data?.tag
      ? [{ providerTaskId: task.id, tag: task.data.tag }]
      : [],
  )
  const taskIds = taskReceipts.map((receipt) => receipt.providerTaskId)
  const expectedTags = new Set(requests.map((request) => request.tag))
  const returnedTags = new Set(taskReceipts.map((receipt) => receipt.tag))
  const receiptsMatch =
    expectedTags.size === requests.length &&
    returnedTags.size === expectedTags.size &&
    [...expectedTags].every((tag) => returnedTags.has(tag))
  const failedTasks = response.tasks.filter(
    (task) => task.status_code !== 20100 || !task.id || !task.data?.tag,
  )
  const actualCostMicros = dataForSeoResponseCostMicros(response)
  const state =
    failedTasks.length === 0 && response.tasks_error === 0
      ? 'succeeded'
      : failedTasks.length < response.tasks.length
        ? 'partial'
        : 'failed'
  const spendNotice = finalizeProviderSpend(
    reservation.id,
    {
      provider: 'dataforseo',
      state,
      actualCostMicros,
      returnedRows: taskIds.length,
      taskIds,
    },
    {
      database: transport.database,
      limits: transport.spendLimits,
      now: transport.now().getTime(),
    },
  )
  if (
    response.status_code !== 20000 ||
    failedTasks.length > 0 ||
    taskIds.length !== requests.length ||
    !receiptsMatch
  ) {
    const statusCode = failedTasks[0]?.status_code ?? response.status_code
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-task-post',
      code: dataForSeoTaskErrorCode(statusCode),
      message: `DataForSEO accepted ${taskIds.length} of ${requests.length} queued SERP tasks (${statusCode}).`,
    })
  }
  return {
    taskIds,
    taskReceipts,
    estimatedCostMicros,
    actualCostMicros,
    spendNotice,
    warnings: [],
    observedAt: transport.now().toISOString(),
  }
}

export async function listReadyDataForSeoSerpTasks(
  transport: SerpTaskTransport,
): Promise<DataForSeoSerpReadyTask[]> {
  const response = await providerRequestJson({
    provider: 'dataforseo',
    operation: 'serp-tasks-ready',
    url: new URL(SERP_TASKS_READY_PATH, transport.baseUrl),
    fetch: transport.fetch,
    maxResponseBytes: transport.maxResponseBytes,
    timeoutMs: transport.timeoutMs,
    retry: 'safe',
    schema: dataForSeoSerpTasksReadyResponseSchema,
    init: {
      method: 'GET',
      headers: { authorization: transport.authorization },
    },
  })
  const failedTask = response.tasks.find((task) => task.status_code !== 20000)
  if (response.status_code !== 20000 || failedTask) {
    const statusCode = failedTask?.status_code ?? response.status_code
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-tasks-ready',
      code: dataForSeoTaskErrorCode(statusCode),
      message: `DataForSEO could not list ready SERP tasks (${statusCode}).`,
      retryable: statusCode === 40202,
    })
  }
  return response.tasks.flatMap((task) =>
    (task.result ?? []).map((result) => ({
      providerTaskId: result.id,
      tag: result.tag ?? null,
    })),
  )
}

export async function getDataForSeoSerpTask(
  providerTaskId: string,
  transport: SerpTaskTransport,
): Promise<DataForSeoSerpSnapshot> {
  const response = await providerRequestJson({
    provider: 'dataforseo',
    operation: 'serp-task-get',
    url: new URL(
      `${SERP_TASK_GET_ADVANCED_PATH}${providerTaskId}`,
      transport.baseUrl,
    ),
    fetch: transport.fetch,
    maxResponseBytes: transport.maxResponseBytes,
    timeoutMs: transport.timeoutMs,
    retry: 'safe',
    schema: dataForSeoSerpResponseSchema,
    init: {
      method: 'GET',
      headers: { authorization: transport.authorization },
    },
  })
  const failedTask = response.tasks.find((task) => task.status_code !== 20000)
  if (response.status_code !== 20000 || failedTask) {
    const statusCode = failedTask?.status_code ?? response.status_code
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-task-get',
      code: dataForSeoTaskErrorCode(statusCode),
      message: `DataForSEO could not collect queued SERP task ${providerTaskId} (${statusCode}).`,
      retryable: statusCode === 40202,
    })
  }
  return {
    response,
    observedAt: transport.now().toISOString(),
    returnedRows: dataForSeoSerpRows(response),
    cache: {
      status: 'bypass',
      storedAt: null,
      expiresAt: null,
    },
    cost: {
      currency: 'USD',
      estimatedMicros: 0,
      actualMicros: dataForSeoResponseCostMicros(response) ?? 0,
      taskIds: [providerTaskId],
    },
    spendNotice: null,
    warnings: [],
  }
}
