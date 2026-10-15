import { z } from 'zod'
import { providerIdSchema } from '../providers/contracts.js'

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

// Unknown keys survive a rewrite, so an older version's saved projects,
// default site and default Google Analytics property stay in the file.
export const configSchema = z.looseObject({
  providers: z
    .object({
      dataForSeoLogin: z.string().optional(),
      dataForSeoPassword: z.string().optional(),
      prefer: providerPreferenceSchema.default('cheap'),
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
