import { z } from 'zod'

export const ahrefsLimitsAndUsageResponseSchema = z
  .object({
    limits_and_usage: z
      .object({
        api_key_expiration_date: z.string().trim().min(1).max(100),
        subscription: z.string().trim().min(1).max(200),
        units_limit_api_key: z.number().int().nonnegative().nullable(),
        units_limit_workspace: z.number().int().nonnegative().nullable(),
        units_usage_api_key: z.number().int().nonnegative(),
        units_usage_workspace: z.number().int().nonnegative().nullable(),
        usage_reset_date: z.string().trim().min(1).max(100),
      })
      .strict(),
  })
  .strict()
