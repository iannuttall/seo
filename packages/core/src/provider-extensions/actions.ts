import { z } from 'zod'
import {
  providerCredentialScope,
  readProviderCache,
  writeProviderCache,
} from '../providers/cache.js'
import { readProviderExtensionCredentials } from './credentials.js'
import {
  loadProviderExtensions,
  normalizeProviderExtensionAccount,
  type ProviderRuntimeOptions,
  runtimeForProvider,
  safeProviderAdapterError,
} from './runtime.js'
import type { SeoProviderJson, SeoProviderJsonSchema } from './sdk.js'

const MAX_ACTION_PARAM_BYTES = 64 * 1_024
const MAX_ACTION_PARAM_DEPTH = 16
const MAX_ACTION_PARAM_VALUES = 5_000
const MAX_ACTION_RESULT_BYTES = 10 * 1024 * 1024
const MAX_ACTION_RESULT_DEPTH = 20
const MAX_ACTION_RESULT_VALUES = 100_000

export type ProviderActionResult = {
  provider: string
  action: string
  cache: 'hit' | 'miss' | 'bypass' | 'disabled'
  data: unknown
}

function normalizedParams(
  params: Readonly<Record<string, SeoProviderJson>>,
): Record<string, SeoProviderJson> {
  const entries = Object.entries(params)
  if (entries.length > 100) {
    throw new Error('Provider action input is too large.')
  }
  for (const [key] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/u.test(key)) {
      throw new Error('Provider action parameter names are invalid.')
    }
  }
  const sorted = canonicalJson(Object.fromEntries(entries)) as Record<
    string,
    SeoProviderJson
  >
  boundedJson(sorted, {
    maxBytes: MAX_ACTION_PARAM_BYTES,
    maxDepth: MAX_ACTION_PARAM_DEPTH,
    maxValues: MAX_ACTION_PARAM_VALUES,
    message: 'Provider action input is too large.',
  })
  return sorted
}

function canonicalJson(value: unknown): SeoProviderJson {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalJson)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalJson(item)]),
  )
}

function boundedJson(
  value: unknown,
  limits: {
    maxBytes: number
    maxDepth: number
    maxValues: number
    message: string
  },
): unknown {
  let values = 0
  const seen = new WeakSet<object>()
  const visit = (item: unknown, depth: number): void => {
    values += 1
    if (values > limits.maxValues || depth > limits.maxDepth) {
      throw new Error(limits.message)
    }
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'boolean'
    ) {
      return
    }
    if (typeof item === 'number' && Number.isFinite(item)) return
    if (typeof item !== 'object') {
      throw new Error('Provider action result must contain JSON values only.')
    }
    if (seen.has(item)) {
      throw new Error('Provider action result must not contain cycles.')
    }
    seen.add(item)
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1)
    } else {
      for (const [key, child] of Object.entries(item)) {
        if (key.length > 256) {
          throw new Error(
            'Provider action result contains a key that is too long.',
          )
        }
        visit(child, depth + 1)
      }
    }
    seen.delete(item)
  }
  visit(value, 0)
  const json = JSON.stringify(value)
  if (Buffer.byteLength(json) > limits.maxBytes) {
    throw new Error(limits.message)
  }
  return JSON.parse(json) as unknown
}

function validateActionValue(
  schema: SeoProviderJsonSchema,
  value: unknown,
  label: 'input' | 'output',
): unknown {
  let validator: z.ZodType
  try {
    validator = z.fromJSONSchema(
      schema as Parameters<typeof z.fromJSONSchema>[0],
    )
  } catch {
    throw new Error(`Provider action ${label} schema is invalid.`)
  }
  const result = validator.safeParse(value)
  if (!result.success) {
    throw new Error(`Provider action ${label} does not match its JSON schema.`)
  }
  return result.data
}

async function actionCredentials(input: {
  providerId: string
  account: Readonly<Record<string, string>>
  fields: Parameters<typeof readProviderExtensionCredentials>[0]['fields']
  supplied?: Readonly<Record<string, string>>
}): Promise<Record<string, string>> {
  let credentials = { ...input.supplied }
  if (Object.keys(credentials).length === 0) {
    credentials = await readProviderExtensionCredentials({
      providerId: input.providerId,
      account: input.account,
      fields: input.fields,
    })
  }
  return credentials
}

export async function runProviderExtensionAction(input: {
  providerId: string
  actionId: string
  account: Readonly<Record<string, string>>
  credentials?: Readonly<Record<string, string>>
  params?: Readonly<Record<string, SeoProviderJson>>
  refresh?: boolean
  runtime?: ProviderRuntimeOptions
}): Promise<ProviderActionResult> {
  const loaded = await loadProviderExtensions()
  const provider = loaded.registry.get(input.providerId)
  const action = loaded.registry.action(input.providerId, input.actionId)
  if (!provider) {
    throw new Error(`Provider ${input.providerId} is not installed.`)
  }
  if (!action) {
    throw new Error(
      `Provider ${input.providerId} does not support action ${input.actionId}.`,
    )
  }
  const account = normalizeProviderExtensionAccount(provider, input.account)
  const params = canonicalJson(
    validateActionValue(
      action.inputSchema,
      normalizedParams(input.params ?? {}),
      'input',
    ),
  ) as Record<string, SeoProviderJson>
  const cacheKey = {
    provider: input.providerId,
    credentialScope: providerCredentialScope(
      input.providerId,
      JSON.stringify(account),
    ),
    operation: `action:${action.id}`,
    request: { account, params },
  }
  if (!input.refresh && action.cacheTtlMs) {
    const cached = readProviderCache(cacheKey, z.unknown())
    if (cached) {
      return {
        provider: input.providerId,
        action: action.id,
        cache: 'hit',
        data: canonicalJson(
          validateActionValue(action.outputSchema, cached.data, 'output'),
        ),
      }
    }
  }
  const credentials = await actionCredentials({
    providerId: input.providerId,
    account,
    fields: provider.connection.fields,
    supplied: input.credentials,
  })
  let raw: unknown
  try {
    raw = await action.run(
      { account, credentials, params },
      runtimeForProvider(input.providerId, input.runtime ?? {}),
    )
  } catch (error) {
    throw safeProviderAdapterError(input.providerId, error, credentials)
  }
  const data = canonicalJson(
    validateActionValue(
      action.outputSchema,
      boundedJson(raw, {
        maxBytes: MAX_ACTION_RESULT_BYTES,
        maxDepth: MAX_ACTION_RESULT_DEPTH,
        maxValues: MAX_ACTION_RESULT_VALUES,
        message: 'Provider action result is too large.',
      }),
      'output',
    ),
  )
  if (action.cacheTtlMs) {
    const rows =
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      Array.isArray((data as Record<string, unknown>).rows)
        ? ((data as Record<string, unknown>).rows as unknown[]).length
        : null
    writeProviderCache(cacheKey, {
      data,
      ttlMs: action.cacheTtlMs,
      rowCount: rows,
      sourceCostMicros: null,
      taskIds: [],
    })
  }
  return {
    provider: input.providerId,
    action: action.id,
    cache: action.cacheTtlMs ? (input.refresh ? 'bypass' : 'miss') : 'disabled',
    data,
  }
}
