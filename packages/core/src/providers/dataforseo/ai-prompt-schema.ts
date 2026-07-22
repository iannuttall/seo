import { z } from 'zod'

const taskBaseSchema = z
  .object({
    id: z.string().min(1).max(100).optional(),
    status_code: z.number().int(),
    status_message: z.string().max(1_000).optional(),
    cost: z.number().finite().nonnegative().optional(),
  })
  .passthrough()

const modelSchema = z
  .object({
    model_name: z.string().min(1).max(200),
    reasoning: z.boolean().optional(),
    web_search_supported: z.boolean().optional(),
    task_post_supported: z.boolean().optional(),
  })
  .passthrough()

export const dataForSeoAiPromptModelsResponseSchema = z
  .object({
    status_code: z.number().int(),
    status_message: z.string().max(1_000).optional(),
    cost: z.number().finite().nonnegative().optional(),
    tasks_error: z.number().int().nonnegative(),
    tasks: z
      .array(
        taskBaseSchema.extend({
          result: z.array(modelSchema).max(500).nullable().optional(),
        }),
      )
      .max(10),
  })
  .passthrough()

const annotationSchema = z
  .object({
    title: z.string().max(4_000).nullable().optional(),
    url: z.string().max(16_384).nullable().optional(),
  })
  .passthrough()

const sectionSchema = z
  .object({
    type: z.string().max(100).nullable().optional(),
    text: z.string().max(100_000).nullable().optional(),
    annotations: z.array(annotationSchema).max(100).nullable().optional(),
  })
  .passthrough()

const itemSchema = z
  .object({
    type: z.string().max(100).nullable().optional(),
    sections: z.array(sectionSchema).max(100).nullable().optional(),
  })
  .passthrough()

const observationSchema = z
  .object({
    model_name: z.string().min(1).max(200),
    input_tokens: z.number().int().nonnegative().nullable().optional(),
    output_tokens: z.number().int().nonnegative().nullable().optional(),
    reasoning_tokens: z.number().int().nonnegative().nullable().optional(),
    web_search: z.boolean().nullable().optional(),
    money_spent: z.number().finite().nonnegative().nullable().optional(),
    datetime: z.string().max(100).nullable().optional(),
    items: z.array(itemSchema).max(100).nullable().optional(),
    fan_out_queries: z
      .array(z.string().min(1).max(1_000))
      .max(100)
      .nullable()
      .optional(),
  })
  .passthrough()

export const dataForSeoAiPromptResponseSchema = z
  .object({
    status_code: z.number().int(),
    status_message: z.string().max(1_000).optional(),
    cost: z.number().finite().nonnegative().optional(),
    tasks_error: z.number().int().nonnegative(),
    tasks: z
      .array(
        taskBaseSchema.extend({
          result: z.array(observationSchema).max(10).nullable().optional(),
        }),
      )
      .max(10),
  })
  .passthrough()

export type DataForSeoAiPromptModelsResponse = z.infer<
  typeof dataForSeoAiPromptModelsResponseSchema
>
export type DataForSeoAiPromptResponse = z.infer<
  typeof dataForSeoAiPromptResponseSchema
>
