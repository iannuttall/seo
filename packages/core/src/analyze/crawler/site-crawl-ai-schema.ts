import { z } from 'zod'

const crawlAiAvailabilitySchema = z.enum([
  'available',
  'absent',
  'access-blocked',
  'rate-limited',
  'unreachable',
])

const crawlAiLinkCheckSchema = z.object({
  url: z.string().url(),
  status: z.number().int().optional(),
  contentType: z.string().optional(),
  error: z.string().optional(),
})

export const crawlAiSignalsSchema = z.object({
  robotsTxt: z
    .object({
      url: z.string().url(),
      exists: z.boolean(),
      availability: crawlAiAvailabilitySchema,
      status: z.number().int().optional(),
      error: z.string().optional(),
      sitemapUrls: z.array(z.string().url()),
      contentSignals: z.array(z.string()).optional(),
      botAccess: z.array(
        z.object({
          userAgent: z.string(),
          purpose: z.enum(['search', 'training', 'other']),
          allowed: z.boolean().nullable(),
          declared: z.boolean(),
          coveredByWildcard: z.boolean(),
        }),
      ),
    })
    .optional(),
  llmsTxt: z
    .object({
      url: z.string().url(),
      exists: z.boolean(),
      availability: crawlAiAvailabilitySchema.optional(),
      status: z.number().int().optional(),
      error: z.string().optional(),
      links: z
        .object({
          found: z.number().int().nonnegative(),
          checked: z.number().int().nonnegative(),
          limit: z.number().int().positive(),
          broken: z.array(crawlAiLinkCheckSchema),
        })
        .optional(),
    })
    .optional(),
  agentResources: z
    .array(
      z.object({
        url: z.string().url(),
        exists: z.boolean(),
        status: z.number().int().optional(),
        contentType: z.string().optional(),
        validJson: z.boolean().optional(),
      }),
    )
    .optional(),
  markdownNegotiation: z
    .object({
      url: z.string().url(),
      availability: crawlAiAvailabilitySchema,
      status: z.number().int().optional(),
      contentType: z.string().optional(),
      markdown: z.boolean(),
      varyAccept: z.boolean(),
      error: z.string().optional(),
    })
    .optional(),
  markdownCopies: z
    .object({
      publicPages: z.number().int().nonnegative(),
      publicPagesWithLink: z.number().int().nonnegative(),
      privatePagesWithLink: z.number().int().nonnegative(),
      checked: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      broken: z.array(
        crawlAiLinkCheckSchema.extend({
          page: z.string().url(),
          public: z.boolean(),
        }),
      ),
      largest: z
        .object({
          url: z.string().url(),
          estimatedTokens: z.number().int().nonnegative(),
        })
        .optional(),
    })
    .optional(),
  startPageHeaders: z
    .object({
      url: z.string().url(),
      linkRelations: z.array(z.string()),
      contentSignal: z.string().optional(),
    })
    .optional(),
})
