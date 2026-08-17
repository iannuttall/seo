import { z } from 'zod'
import { providerIdSchema } from '../providers/contracts.js'

export const siteSchema = z.object({
  siteUrl: z.string(),
  displayName: z.string().optional(),
  permission: z.string().optional(),
  addedAt: z.number().int().optional(),
  isDefault: z.boolean().optional(),
})

export const providerPreferenceSchema = z.enum(['cheap', 'authoritative'])

export const analyticsProviderSchema = z.enum(['google', 'clicky'])

const analyticsExtensionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)

const analyticsExtensionAccountSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z][A-Za-z0-9-]*$/u)
      .refine(
        (value) => !['constructor', 'prototype', '__proto__'].includes(value),
      ),
    z.string().trim().min(1).max(1_000),
  )
  .refine((value) => Object.keys(value).length <= 16, {
    message: 'An analytics provider account can have at most 16 fields.',
  })

const providerConnectionAccountsSchema = z
  .record(providerIdSchema, analyticsExtensionAccountSchema)
  .refine((value) => Object.keys(value).length <= 20, {
    message: 'There can be at most 20 provider connection records.',
  })

export const analyticsConnectionSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('google'),
    propertyId: z.string(),
    accountEmail: z.string().email().optional(),
  }),
  z.object({
    provider: z.literal('clicky'),
    siteId: z.string().regex(/^\d{1,30}$/u),
  }),
  z.object({
    provider: z.literal('extension'),
    providerId: analyticsExtensionIdSchema,
    account: analyticsExtensionAccountSchema,
  }),
])

export const providerSpendLimitOverridesSchema = z
  .object({
    dailyNoticeMicros: z.number().int().nonnegative().optional(),
    dailyHardLimitMicros: z.number().int().positive().nullable().optional(),
    monthlyHardLimitMicros: z.number().int().positive().nullable().optional(),
    maxRequestsPerReport: z.number().int().min(1).max(100).optional(),
    maxRowsPerReport: z.number().int().min(1).max(100_000).optional(),
  })
  .strict()

export const analyticsConnectionsSchema = z
  .object({
    selected: z
      .union([
        analyticsProviderSchema,
        z.string().regex(/^extension:[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      ])
      .optional(),
    google: z
      .object({
        propertyId: z.string(),
      })
      .optional(),
    clicky: z
      .object({
        siteId: z.string().regex(/^\d{1,30}$/u),
      })
      .optional(),
    extensions: z
      .record(
        analyticsExtensionIdSchema,
        z.object({ account: analyticsExtensionAccountSchema }).strict(),
      )
      .refine((value) => Object.keys(value).length <= 20, {
        message: 'A project can have at most 20 analytics extensions.',
      })
      .optional(),
  })
  .default({})

export const clientProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  siteUrl: z.string(),
  startUrl: z.string().optional(),
  watchUrls: z.array(z.string()).default([]),
  brandTerms: z.array(z.string()).default([]),
  analytics: analyticsConnectionsSchema,
  googleAccounts: z
    .object({
      searchConsole: z.string().email().optional(),
      googleAnalytics: z.string().email().optional(),
    })
    .optional(),
  searchEngines: z
    .object({
      bing: z
        .object({
          siteUrl: z.string(),
        })
        .optional(),
    })
    .optional(),
  reportDay: z.number().int().min(1).max(31).optional(),
  technicalWeekday: z.number().int().min(0).max(7).optional(),
  isDefault: z.boolean().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export const configSchema = z.object({
  defaultSite: z.string().optional(),
  sites: z.array(siteSchema).default([]),
  clients: z.array(clientProfileSchema).default([]),
  analytics: z
    .object({
      google: z
        .object({
          defaultPropertyId: z.string().optional(),
          propertyMappings: z
            .array(
              z.object({
                siteUrl: z.string(),
                propertyId: z.string(),
                addedAt: z.number().int().optional(),
              }),
            )
            .default([]),
        })
        .default({ propertyMappings: [] }),
    })
    .default({ google: { propertyMappings: [] } }),
  providers: z
    .object({
      semrushApiKey: z.string().optional(),
      dataForSeoLogin: z.string().optional(),
      dataForSeoPassword: z.string().optional(),
      prefer: providerPreferenceSchema.default('cheap'),
      costLimits: z
        .record(providerIdSchema, providerSpendLimitOverridesSchema)
        .optional(),
      connections: providerConnectionAccountsSchema.optional(),
    })
    .default({ prefer: 'cheap' }),
  security: z
    .object({
      useKeychain: z.boolean().default(true),
    })
    .default({ useKeychain: true }),
  auth: z
    .object({
      sharedClientId: z.string().optional(),
      sharedClientSecret: z.string().optional(),
    })
    .default({}),
})

export type AppConfig = z.infer<typeof configSchema>
export type AnalyticsConnection = z.infer<typeof analyticsConnectionSchema>
export type AnalyticsProvider = z.infer<typeof analyticsProviderSchema>
export type ClientProfile = z.infer<typeof clientProfileSchema>
