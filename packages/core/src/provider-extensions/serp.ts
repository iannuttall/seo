import { z } from 'zod'
import type { InstalledSerp } from '../commands/research.js'
import { CommandError } from '../commands/types.js'
import { readProviderExtensionAccount } from './connections.js'
import { readProviderExtensionCredentials } from './credentials.js'
import {
  loadProviderExtensions,
  normalizeProviderExtensionAccount,
  runtimeForProvider,
  safeProviderAdapterError,
} from './runtime.js'
import type {
  SeoSearchMarket,
  SeoSerpSnapshotCapability,
  SeoSerpSnapshotResult,
} from './sdk.js'

// seo research serp from an installed package's serp-snapshot capability.
// The package's result is checked against the SDK shape and bounded before
// any row is used.

const nullableText = z.string().max(50_000).nullable()

const serpSnapshotResultSchema: z.ZodType<SeoSerpSnapshotResult> = z
  .object({
    observedAt: z.string().max(100),
    effectiveKeyword: z.string().trim().min(1).max(1_000),
    searchEngineDomain: z.string().max(253).nullable(),
    checkUrl: z.url().max(8_192).nullable(),
    resultCount: z.number().int().nonnegative().safe().nullable(),
    pagesCount: z.number().int().nonnegative().max(100).safe().nullable(),
    features: z.array(z.string().trim().min(1).max(100)).max(100),
    organicResults: z
      .array(
        z
          .object({
            rankGroup: z.number().int().positive().safe(),
            rankAbsolute: z.number().int().positive().safe(),
            page: z.number().int().positive().max(100).safe(),
            domain: z.string().trim().min(1).max(253),
            url: z.url().max(8_192),
            title: z.string().max(10_000).nullable(),
            description: nullableText,
            isFeaturedSnippet: z.boolean().nullable(),
          })
          .strict(),
      )
      .max(100),
    // The local pack is part of the shape; serp rows use organic results.
    localPack: z
      .object({
        present: z.boolean(),
        returnedRows: z.number().int().nonnegative().max(100).safe(),
        retainedRows: z.number().int().nonnegative().max(100).safe(),
        invalidRows: z.number().int().nonnegative().max(100).safe(),
        results: z.array(z.unknown()).max(100),
      })
      .strict(),
    coverage: z
      .object({
        returnedRows: z.number().int().nonnegative().max(10_000).safe(),
        retainedRows: z.number().int().nonnegative().max(100).safe(),
        invalidRows: z.number().int().nonnegative().max(10_000).safe(),
        providerTotalRows: z.number().int().nonnegative().safe().nullable(),
        completeness: z.enum(['complete', 'partial', 'capped']),
        nextCursor: z.string().max(500).nullable(),
      })
      .strict(),
    request: z
      .object({
        endpoint: z.string().trim().min(1).max(500),
        filters: z.record(
          z.string().min(1).max(100),
          z.union([z.string().max(1_000), z.number().finite(), z.boolean()]),
        ),
        sort: z.array(z.string().min(1).max(200)).max(20),
      })
      .strict(),
    cost: z
      .object({
        estimatedMicros: z.number().int().nonnegative().safe().nullable(),
        actualMicros: z.number().int().nonnegative().safe().nullable(),
        taskIds: z.array(z.string().min(1).max(500)).max(20),
        native: z
          .object({
            unit: z.string().trim().min(1).max(100),
            estimatedUnits: z.number().finite().nonnegative().nullable(),
            actualUnits: z.number().finite().nonnegative().nullable(),
            remainingBefore: z.number().finite().nonnegative().nullable(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    qualityWarnings: z
      .array(
        z
          .object({
            code: z.string().trim().min(1).max(100),
            message: z.string().trim().min(1).max(500),
            field: z.string().max(200).optional(),
            row: z.number().int().positive().safe().optional(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict() as z.ZodType<SeoSerpSnapshotResult>

const same = (list: readonly string[] | undefined, value: string) =>
  !list || list.some((item) => item.toLowerCase() === value.toLowerCase())

function supports(
  capability: SeoSerpSnapshotCapability,
  market: SeoSearchMarket,
): boolean {
  return capability.markets.some(
    (entry) =>
      same(entry.searchEngines, market.searchEngine) &&
      same(entry.countryCodes, market.countryCode) &&
      same(entry.languageCodes, market.languageCode) &&
      same(entry.devices, market.device ?? 'desktop'),
  )
}

export const installedProviderSerp: InstalledSerp = async (input) => {
  const loaded = await loadProviderExtensions()
  const provider = loaded.registry.get(input.provider)
  if (!provider) {
    throw new CommandError(
      'INVALID_INPUT',
      `No provider ${input.provider} is installed. The built-in providers are dataforseo and ahrefs; \`seo providers list\` shows installed packages.`,
    )
  }
  const capability = loaded.registry.capability(provider.id, 'serp-snapshot') as
    | SeoSerpSnapshotCapability
    | undefined
  if (!capability) {
    throw new CommandError(
      'INVALID_INPUT',
      `${provider.displayName} has no live search results (serp-snapshot), so it cannot answer serp. \`seo providers describe ${provider.id}\` lists its own actions.`,
    )
  }
  const market: SeoSearchMarket = {
    searchEngine: 'google',
    countryCode: input.country.toUpperCase(),
    languageCode: input.language,
    device: input.device,
  }
  if (!supports(capability, market)) {
    throw new CommandError(
      'INVALID_INPUT',
      `${provider.displayName} has no ${input.device} Google results for country ${input.country} in language ${input.language}.`,
    )
  }
  let account: Record<string, string>
  let credentials: Record<string, string>
  try {
    account = normalizeProviderExtensionAccount(
      provider,
      readProviderExtensionAccount(provider.id),
    )
    credentials = await readProviderExtensionCredentials({
      providerId: provider.id,
      account,
      fields: provider.connection.fields,
    })
  } catch (error) {
    throw new CommandError(
      'NO_KEY',
      `${error instanceof Error ? error.message : String(error)} Connect it with \`seo providers connect ${provider.id}\`.`,
    )
  }
  const depth = Math.min(input.depth, capability.maxDepth)
  let raw: unknown
  try {
    raw = await capability.run(
      { account, credentials, keyword: input.keyword, market, depth },
      runtimeForProvider(provider.id, { maxRequests: capability.maxRequests }),
    )
  } catch (error) {
    throw new CommandError(
      'PROVIDER_ERROR',
      safeProviderAdapterError(provider.id, error, credentials).message,
    )
  }
  const parsed = serpSnapshotResultSchema.safeParse(raw)
  if (!parsed.success) {
    throw new CommandError(
      'PROVIDER_ERROR',
      `${provider.displayName} returned a results page that does not match the serp-snapshot shape.`,
    )
  }
  const result = parsed.data
  const warnings = result.qualityWarnings.map((warning) => warning.message)

  return {
    // Position order, as the built-in providers return them.
    rows: [...result.organicResults]
      .sort(
        (a, b) => a.rankAbsolute - b.rankAbsolute || (a.url < b.url ? -1 : 1),
      )
      .map((item) => ({
        position: item.isFeaturedSnippet ? null : item.rankGroup,
        rank_absolute: item.rankAbsolute,
        type: item.isFeaturedSnippet ? 'featured_snippet' : 'organic',
        url: item.url,
        domain: item.domain,
        title: item.title,
      })),
    costMicros: result.cost.actualMicros,
    partial: result.coverage.completeness === 'partial',
    warnings,
    depth,
  }
}
