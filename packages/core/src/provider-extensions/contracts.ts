import { z } from 'zod'
import type {
  SeoLandingPageVisitsCapability,
  SeoProviderActionAdapter,
  SeoProviderCapabilityAdapter,
  SeoProviderConnectionAdapter,
  SeoSerpSnapshotCapability,
} from './sdk.js'
import { SEO_PROVIDER_API_VERSION } from './sdk.js'

const identifierPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const packageNamePattern =
  /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const integrityPattern = /^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/u
const MAX_SCHEMA_BYTES = 64 * 1_024
const MAX_SCHEMA_DEPTH = 16
const MAX_SCHEMA_VALUES = 5_000

function boundedJsonObject(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  let values = 0
  const seen = new WeakSet<object>()
  const visit = (item: unknown, depth: number): boolean => {
    values += 1
    if (values > MAX_SCHEMA_VALUES || depth > MAX_SCHEMA_DEPTH) return false
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'boolean'
    ) {
      return typeof item !== 'string' || item.length <= 8_192
    }
    if (typeof item === 'number') return Number.isFinite(item)
    if (typeof item !== 'object' || seen.has(item)) return false
    seen.add(item)
    const entries = Object.entries(item)
    const valid =
      entries.length <= 1_000 &&
      entries.every(
        ([key, child]) => key.length <= 256 && visit(child, depth + 1),
      )
    seen.delete(item)
    return valid
  }
  if (!visit(value, 0)) return false
  return Buffer.byteLength(JSON.stringify(value)) <= MAX_SCHEMA_BYTES
}

function supportedJsonSchema(value: unknown, objectRoot = false): boolean {
  if (!boundedJsonObject(value)) return false
  if (objectRoot && (value as { type?: unknown }).type !== 'object') {
    return false
  }
  try {
    z.fromJSONSchema(value as Parameters<typeof z.fromJSONSchema>[0])
    return true
  } catch {
    return false
  }
}

export const providerExtensionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(identifierPattern)

export const providerPackageNameSchema = z
  .string()
  .min(1)
  .max(214)
  .regex(packageNamePattern)

export const providerExactVersionSchema = z
  .string()
  .min(5)
  .max(128)
  .regex(exactVersionPattern)

export const providerIntegritySchema = z
  .string()
  .min(16)
  .max(512)
  .regex(integrityPattern)

export const providerKindSchema = z.enum([
  'traffic-analytics',
  'search-results',
  'keyword-data',
  'domain-data',
  'link-data',
  'local-search',
  'ai-data',
  'other',
])

export const providerConnectionFieldSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z][A-Za-z0-9-]*$/u)
      .refine(
        (value) => !['constructor', 'prototype', '__proto__'].includes(value),
        'Reserved connection field id.',
      ),
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(240).optional(),
    kind: z.enum(['account', 'secret']),
    required: z.boolean().optional(),
    envVar: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Z][A-Z0-9_]*$/u)
      .optional(),
  })
  .strict()

const providerConnectionAdapterSchema = z.custom<SeoProviderConnectionAdapter>(
  (value) => {
    if (typeof value !== 'object' || value === null) return false
    const adapter = value as Partial<SeoProviderConnectionAdapter>
    return (
      providerConnectionFieldSchema.array().max(16).safeParse(adapter.fields)
        .success &&
      (adapter.normalizeAccount === undefined ||
        typeof adapter.normalizeAccount === 'function') &&
      typeof adapter.verify === 'function' &&
      (adapter.verificationNotice === undefined ||
        (typeof adapter.verificationNotice === 'string' &&
          adapter.verificationNotice.trim().length > 0 &&
          adapter.verificationNotice.length <= 500))
    )
  },
  'Invalid provider connection adapter.',
)

const landingPageVisitsCapabilitySchema =
  z.custom<SeoLandingPageVisitsCapability>(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      (value as Partial<SeoLandingPageVisitsCapability>).id ===
        'landing-page-visits' &&
      typeof (value as Partial<SeoLandingPageVisitsCapability>).run ===
        'function',
    'Invalid landing-page visits capability.',
  )

const serpSnapshotCapabilitySchema = z.custom<SeoSerpSnapshotCapability>(
  (value) => {
    if (typeof value !== 'object' || value === null) return false
    const capability = value as Partial<SeoSerpSnapshotCapability>
    return (
      capability.id === 'serp-snapshot' &&
      typeof capability.run === 'function' &&
      typeof capability.estimateCostMicros === 'function' &&
      typeof capability.estimateRequests === 'function' &&
      Array.isArray(capability.markets) &&
      capability.markets.length >= 1 &&
      capability.markets.length <= 100 &&
      Number.isSafeInteger(capability.maxRequests) &&
      (capability.maxRequests ?? 0) >= 1 &&
      (capability.maxRequests ?? 0) <= 20 &&
      Number.isSafeInteger(capability.defaultDepth) &&
      (capability.defaultDepth ?? 0) >= 1 &&
      Number.isSafeInteger(capability.maxDepth) &&
      (capability.maxDepth ?? 0) >= (capability.defaultDepth ?? 0) &&
      (capability.maxDepth ?? 0) <= 100
    )
  },
  'Invalid SERP snapshot capability.',
)

const providerCapabilityAdapterSchema = z.union([
  landingPageVisitsCapabilitySchema,
  serpSnapshotCapabilitySchema,
]) as z.ZodType<SeoProviderCapabilityAdapter>

const providerActionAdapterSchema = z.custom<SeoProviderActionAdapter>(
  (value) => {
    if (typeof value !== 'object' || value === null) return false
    const action = value as Partial<SeoProviderActionAdapter>
    return (
      typeof action.id === 'string' &&
      providerExtensionIdSchema.safeParse(action.id).success &&
      typeof action.description === 'string' &&
      action.description.trim().length >= 1 &&
      action.description.length <= 240 &&
      supportedJsonSchema(action.inputSchema, true) &&
      supportedJsonSchema(action.outputSchema) &&
      (action.cacheTtlMs === undefined ||
        (Number.isSafeInteger(action.cacheTtlMs) &&
          action.cacheTtlMs >= 0 &&
          action.cacheTtlMs <= 7 * 24 * 60 * 60 * 1_000)) &&
      typeof action.run === 'function'
    )
  },
  'Invalid provider action.',
)

export const providerPackageManifestSchema = z
  .object({
    apiVersion: z.literal(SEO_PROVIDER_API_VERSION),
    providers: z
      .array(
        z
          .string()
          .min(3)
          .max(512)
          .regex(/^\.\/(?!.*(?:^|\/)\.\.(?:\/|$)).+\.(?:cjs|js|mjs)$/u),
      )
      .min(1)
      .max(16),
  })
  .strict()

export const installedProviderPackageSchema = z
  .object({
    id: providerExtensionIdSchema,
    package: providerPackageNameSchema,
    version: providerExactVersionSchema,
    integrity: providerIntegritySchema,
    enabled: z.boolean(),
    installedAt: z.string().datetime(),
  })
  .strict()

export const installedProviderPackagesSchema = z
  .object({
    schemaVersion: z.literal(1),
    packages: z.array(installedProviderPackageSchema).max(20),
  })
  .strict()

export const providerRegistrationSchema = z
  .object({
    id: providerExtensionIdSchema,
    displayName: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(240),
    kinds: z.array(providerKindSchema).min(1).max(8),
    connection: providerConnectionAdapterSchema,
    capabilities: z.array(providerCapabilityAdapterSchema).max(32),
    actions: z.array(providerActionAdapterSchema).max(16).optional(),
  })
  .strict()
  .superRefine((provider, context) => {
    if (provider.capabilities.length === 0 && !provider.actions?.length) {
      context.addIssue({
        code: 'custom',
        path: ['actions'],
        message: 'A provider needs at least one capability or action.',
      })
    }
    const fieldIds = new Set<string>()
    for (const [index, field] of provider.connection.fields.entries()) {
      if (fieldIds.has(field.id)) {
        context.addIssue({
          code: 'custom',
          path: ['connection', 'fields', index, 'id'],
          message: `Duplicate connection field ${field.id}.`,
        })
      }
      fieldIds.add(field.id)
    }
    const capabilityIds = new Set<string>()
    for (const [index, capability] of provider.capabilities.entries()) {
      if (capabilityIds.has(capability.id)) {
        context.addIssue({
          code: 'custom',
          path: ['capabilities', index, 'id'],
          message: `Duplicate capability ${capability.id}.`,
        })
      }
      capabilityIds.add(capability.id)
    }
    const actionIds = new Set<string>()
    for (const [index, action] of (provider.actions ?? []).entries()) {
      if (actionIds.has(action.id)) {
        context.addIssue({
          code: 'custom',
          path: ['actions', index, 'id'],
          message: `Duplicate action ${action.id}.`,
        })
      }
      actionIds.add(action.id)
    }
  })

export type ProviderPackageManifest = z.infer<
  typeof providerPackageManifestSchema
>
export type InstalledProviderPackage = z.infer<
  typeof installedProviderPackageSchema
>
export type InstalledProviderPackages = z.infer<
  typeof installedProviderPackagesSchema
>
