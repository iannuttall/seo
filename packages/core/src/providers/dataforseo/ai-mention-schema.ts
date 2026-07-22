import { z } from 'zod'

const metricValueSchema = z
  .object({
    key: z.union([z.string().max(500), z.number().int()]),
    mentions: z.number().int().nonnegative().optional(),
    ai_search_volume: z.number().int().nonnegative().optional(),
  })
  .passthrough()

const metricGroupSchema = z
  .object({
    key: z.string().min(1).max(250).optional(),
    sources_domain: z.array(metricValueSchema).max(100).nullish(),
    total: z
      .object({
        mentions: z.number().int().nonnegative().optional(),
        ai_search_volume: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()

const metricsResultSchema = z
  .object({
    total_count: z.number().int().nonnegative().optional(),
    offset: z.number().int().nonnegative().optional(),
    items_count: z.number().int().nonnegative().optional(),
    aggregated_metrics: metricGroupSchema.nullish(),
    items: z.array(metricGroupSchema).max(10).nullish(),
  })
  .passthrough()

const mentionSourceSchema = z
  .object({
    rank: z.number().int().positive().optional(),
    domain: z.string().max(500).nullish(),
    url: z.string().max(8_192).nullish(),
    title: z.string().max(10_000).nullish(),
    source_name: z.string().max(1_000).nullish(),
  })
  .passthrough()

const mentionItemSchema = z
  .object({
    platform: z.string().max(100).optional(),
    model_name: z.string().max(250).nullish(),
    location_code: z.number().int().positive().optional(),
    language_code: z.string().max(35).optional(),
    question: z.string().max(10_000).nullish(),
    answer: z.string().max(1_000_000).nullish(),
    sources: z.array(mentionSourceSchema).max(250).nullish(),
    ai_search_volume: z.number().int().nonnegative().nullish(),
    first_response_at: z.string().max(100).nullish(),
    last_response_at: z.string().max(100).nullish(),
    is_web_search_based: z.boolean().nullish(),
  })
  .passthrough()

const searchResultSchema = z
  .object({
    total_count: z.number().int().nonnegative().optional(),
    offset: z.number().int().nonnegative().optional(),
    items_count: z.number().int().nonnegative().optional(),
    search_after_token: z.string().max(100_000).nullish(),
    items: z.array(mentionItemSchema).max(1_000).nullish(),
  })
  .passthrough()

function responseSchema<T extends z.ZodTypeAny>(result: T) {
  return z
    .object({
      version: z.string().max(100).optional(),
      status_code: z.number().int(),
      status_message: z.string().max(1_000),
      cost: z.number().finite().nonnegative().optional(),
      tasks_count: z.number().int().nonnegative(),
      tasks_error: z.number().int().nonnegative(),
      tasks: z
        .array(
          z
            .object({
              id: z.string().max(100).optional(),
              status_code: z.number().int(),
              status_message: z.string().max(1_000),
              cost: z.number().finite().nonnegative().optional(),
              result_count: z.number().int().nonnegative().optional(),
              result: z.array(result).max(10).nullable(),
            })
            .passthrough(),
        )
        .max(10),
    })
    .passthrough()
}

export const dataForSeoAiMentionMetricsResponseSchema =
  responseSchema(metricsResultSchema)
export type DataForSeoAiMentionMetricsResponse = z.infer<
  typeof dataForSeoAiMentionMetricsResponseSchema
>

export const dataForSeoAiMentionSearchResponseSchema =
  responseSchema(searchResultSchema)
export type DataForSeoAiMentionSearchResponse = z.infer<
  typeof dataForSeoAiMentionSearchResponseSchema
>
