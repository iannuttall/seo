import { z } from 'zod'

const userDataMoneySchema = z
  .object({
    total: z.number().finite().nonnegative().optional(),
    balance: z.number().finite().nonnegative().optional(),
  })
  .passthrough()

const userDataResultSchema = z
  .object({
    login: z.string().min(1).max(320),
    timezone: z.string().min(1).max(100).optional(),
    money: userDataMoneySchema.optional(),
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
