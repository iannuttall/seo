import { z } from 'zod'

const serpItemSchema = z
  .object({
    type: z.string().trim().min(1).max(100),
    rank_group: z.number().int().positive().nullable().optional(),
    rank_absolute: z.number().int().positive().nullable().optional(),
    page: z.number().int().positive().nullable().optional(),
    domain: z.string().trim().max(500).nullable().optional(),
    url: z.string().trim().max(10_000).nullable().optional(),
    title: z.string().max(10_000).nullable().optional(),
    description: z.string().max(50_000).nullable().optional(),
    is_featured_snippet: z.boolean().nullable().optional(),
  })
  .passthrough()

const serpResultSchema = z
  .object({
    keyword: z.string().trim().min(1).max(700),
    se_domain: z.string().trim().min(1).max(500).nullable().optional(),
    check_url: z.string().trim().min(1).max(10_000).nullable().optional(),
    datetime: z.string().trim().min(1).max(100),
    spell: z
      .object({
        keyword: z.string().trim().min(1).max(700).optional(),
        type: z.string().trim().min(1).max(100).optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    item_types: z.array(z.string().trim().min(1).max(100)).max(200).optional(),
    se_results_count: z.number().finite().nonnegative().nullable().optional(),
    pages_count: z.number().int().nonnegative().nullable().optional(),
    items_count: z.number().int().nonnegative().optional(),
    items: z.array(serpItemSchema).max(500).optional(),
  })
  .passthrough()

const serpTaskSchema = z
  .object({
    id: z.string().trim().min(1).max(100).optional(),
    status_code: z.number().int(),
    status_message: z.string().max(1000),
    cost: z.number().finite().nonnegative().optional(),
    result_count: z.number().int().nonnegative().optional(),
    result: z.array(serpResultSchema).max(10).nullable().optional(),
  })
  .passthrough()

export const dataForSeoSerpResponseSchema = z
  .object({
    status_code: z.number().int(),
    status_message: z.string().max(1000),
    cost: z.number().finite().nonnegative().optional(),
    tasks_count: z.number().int().nonnegative(),
    tasks_error: z.number().int().nonnegative(),
    tasks: z.array(serpTaskSchema).max(10),
  })
  .passthrough()

export type DataForSeoSerpResponse = z.infer<
  typeof dataForSeoSerpResponseSchema
>
