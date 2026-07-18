import { z } from 'zod'

export const siteSchema = z.object({
  siteUrl: z.string(),
  displayName: z.string().optional(),
  permission: z.string().optional(),
  addedAt: z.number().int().optional(),
  isDefault: z.boolean().optional(),
})

export const providerPreferenceSchema = z.enum(['cheap', 'authoritative'])

export const analyticsConnectionsSchema = z
  .object({
    google: z
      .object({
        propertyId: z.string(),
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
export type ClientProfile = z.infer<typeof clientProfileSchema>
