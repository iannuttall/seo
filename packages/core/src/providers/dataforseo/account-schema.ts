import { z } from 'zod'

const userDataMoneySchema = z
  .object({
    total: z.number().finite().nonnegative().optional(),
    balance: z.number().finite().optional(),
    limits: z
      .object({
        day: z
          .object({
            total: z.number().finite().nonnegative().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    statistics: z
      .object({
        day: z
          .object({
            total: z.number().finite().nonnegative().optional(),
            value: z.string().max(100).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const priceComponentSchema = z
  .object({
    cost_type: z.string().min(1).max(100),
    cost: z.number().finite().nonnegative(),
  })
  .passthrough()

const normalPriorityPriceSchema = z
  .object({
    priority_normal: z.array(priceComponentSchema).max(20).optional(),
  })
  .passthrough()

const livePriceSchema = z
  .object({
    live: normalPriorityPriceSchema.optional(),
  })
  .passthrough()

const userDataPriceSchema = z
  .object({
    dataforseo_labs: z
      .object({
        keyword_overview: livePriceSchema.optional(),
        keyword_ideas: livePriceSchema.optional(),
        keyword_suggestions: livePriceSchema.optional(),
        related_keywords: livePriceSchema.optional(),
      })
      .passthrough()
      .optional(),
    serp: z
      .object({
        live: z
          .object({
            advanced: normalPriorityPriceSchema.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const userDataResultSchema = z
  .object({
    login: z.string().min(1).max(320),
    timezone: z.string().min(1).max(100).optional(),
    money: userDataMoneySchema.optional(),
    price: userDataPriceSchema.optional(),
    backlinks_subscription_expiry_date: z.string().nullable().optional(),
    llm_mentions_subscription_expiry_date: z.string().nullable().optional(),
  })
  .passthrough()

const userDataTaskSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    status_code: z.number().int(),
    status_message: z.string().max(1000),
    cost: z.number().finite().nonnegative().optional(),
    result_count: z.number().int().nonnegative().optional(),
    result: z.array(userDataResultSchema).max(10).nullable(),
  })
  .passthrough()

export const dataForSeoUserDataResponseSchema = z
  .object({
    version: z.string().min(1).max(100).optional(),
    status_code: z.number().int(),
    status_message: z.string().max(1000),
    cost: z.number().finite().nonnegative().optional(),
    tasks_count: z.number().int().nonnegative(),
    tasks_error: z.number().int().nonnegative(),
    tasks: z.array(userDataTaskSchema).max(10),
  })
  .passthrough()

export type DataForSeoUserDataResponse = z.infer<
  typeof dataForSeoUserDataResponseSchema
>
