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
  verifyProviderExtension,
} from './runtime.js'
import type {
  SeoLandingPageVisitsCapability,
  SeoLandingPageVisitsResult,
} from './sdk.js'

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000

const landingPageResultSchema = z
  .object({
    metric: z.literal('landing-page-visits'),
    rows: z
      .array(
        z
          .object({
            path: z.string().min(1).max(4_096),
            visits: z.number().int().nonnegative().safe(),
          })
          .strict(),
      )
      .max(5_000),
    returnedRows: z.number().int().nonnegative().max(5_000).safe(),
    availableRows: z.number().int().nonnegative().safe().optional(),
    retainedRowLimit: z.number().int().min(1).max(5_000),
    retainedRowLimitReached: z.boolean(),
    dataStatus: z.enum(['complete', 'partial']),
    qualityWarnings: z.array(z.string().min(1).max(500)).max(20),
  })
  .strict()

function normalizedLandingPageResult(
  value: z.infer<typeof landingPageResultSchema>,
): SeoLandingPageVisitsResult {
  const visitsByPath = new Map<string, number>()
  for (const row of value.rows) {
    if (!row.path.startsWith('/') || /[?#]/u.test(row.path)) {
      throw new Error('Analytics provider returned an invalid landing path.')
    }
    const visits = (visitsByPath.get(row.path) ?? 0) + row.visits
    if (!Number.isSafeInteger(visits)) {
      throw new Error('Analytics provider returned an invalid visit total.')
    }
    visitsByPath.set(row.path, visits)
  }
  return {
    ...value,
    rows: [...visitsByPath.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([path, visits]) => ({ path, visits })),
  }
}

export type AnalyticsProviderRuntimeOptions = ProviderRuntimeOptions

export async function verifyAnalyticsProvider(input: {
  providerId: string
  account: Readonly<Record<string, string>>
  credentials: Readonly<Record<string, string>>
  runtime?: AnalyticsProviderRuntimeOptions
}): Promise<void> {
  await verifyProviderExtension(input)
}

export async function runAnalyticsProviderLandingPages(input: {
  providerId: string
  account: Readonly<Record<string, string>>
  credentials?: Readonly<Record<string, string>>
  startDate: string
  endDate: string
  limit: number
  refresh?: boolean
  runtime?: AnalyticsProviderRuntimeOptions
}): Promise<SeoLandingPageVisitsResult> {
  const loaded = await loadProviderExtensions()
  const provider = loaded.registry.get(input.providerId)
  const capability = loaded.registry.capability(
    input.providerId,
    'landing-page-visits',
  ) as SeoLandingPageVisitsCapability | undefined
  if (!provider || !capability) {
    throw new Error(`Analytics provider ${input.providerId} is not installed.`)
  }
  const account = normalizeProviderExtensionAccount(provider, input.account)
  const cacheKey = {
    provider: input.providerId,
    credentialScope: providerCredentialScope(
      input.providerId,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(account).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        ),
      ),
    ),
    operation: 'landing-pages',
    request: {
      account,
      startDate: input.startDate,
      endDate: input.endDate,
      limit: input.limit,
    },
  }
  const cached = input.refresh
    ? null
    : readProviderCache(cacheKey, landingPageResultSchema)
  if (cached) return normalizedLandingPageResult(cached.data)
  let credentials = { ...input.credentials }
  if (Object.keys(credentials).length === 0) {
    credentials = await readProviderExtensionCredentials({
      providerId: input.providerId,
      account,
      fields: provider.connection.fields,
    })
  }
  let result: unknown
  try {
    result = await capability.run(
      {
        account,
        credentials,
        startDate: input.startDate,
        endDate: input.endDate,
        limit: input.limit,
      },
      runtimeForProvider(input.providerId, input.runtime ?? {}),
    )
  } catch (error) {
    throw safeProviderAdapterError(input.providerId, error, credentials)
  }
  const parsed = normalizedLandingPageResult(
    landingPageResultSchema.parse(result),
  )
  writeProviderCache(cacheKey, {
    data: parsed,
    ttlMs: CACHE_TTL_MS,
    rowCount: parsed.returnedRows,
    sourceCostMicros: null,
    taskIds: [],
  })
  return parsed
}
