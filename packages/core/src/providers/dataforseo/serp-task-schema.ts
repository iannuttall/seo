import { z } from 'zod'

const taskPostItemSchema = z
  .object({
    id: z.string().trim().min(1).max(100).optional(),
    status_code: z.number().int(),
    status_message: z.string().max(1_000),
    cost: z.number().finite().nonnegative().optional(),
    result_count: z.number().int().nonnegative().optional(),
    data: z
      .object({
        tag: z.string().trim().min(1).max(255).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const dataForSeoSerpTaskPostResponseSchema = z
  .object({
    status_code: z.number().int(),
    status_message: z.string().max(1_000),
    cost: z.number().finite().nonnegative().optional(),
    tasks_count: z.number().int().nonnegative(),
    tasks_error: z.number().int().nonnegative(),
    tasks: z.array(taskPostItemSchema).max(100),
  })
  .passthrough()

const readyResultSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    tag: z.string().trim().max(255).nullable().optional(),
    se: z.string().trim().max(100).optional(),
    se_type: z.string().trim().max(100).optional(),
    endpoint_advanced: z.string().trim().max(2_048).nullable().optional(),
  })
  .passthrough()

const readyTaskSchema = z
  .object({
    id: z.string().trim().min(1).max(100).optional(),
    status_code: z.number().int(),
    status_message: z.string().max(1_000),
    cost: z.number().finite().nonnegative().optional(),
    result: z.array(readyResultSchema).max(1_000).nullable().optional(),
  })
  .passthrough()

export const dataForSeoSerpTasksReadyResponseSchema = z
  .object({
    status_code: z.number().int(),
    status_message: z.string().max(1_000),
    cost: z.number().finite().nonnegative().optional(),
    tasks_count: z.number().int().nonnegative(),
    tasks_error: z.number().int().nonnegative(),
    tasks: z.array(readyTaskSchema).max(10),
  })
  .passthrough()

export type DataForSeoSerpTaskPostResponse = z.infer<
  typeof dataForSeoSerpTaskPostResponseSchema
>
export type DataForSeoSerpTasksReadyResponse = z.infer<
  typeof dataForSeoSerpTasksReadyResponseSchema
>
