import { z } from 'zod'

const MAX_PROVIDER_MONTHLY_SEARCH_ROWS = 120

const nullableNumber = z.number().finite().nullable().optional()
const nullableCount = z
  .union([z.number().finite(), z.string().trim().min(1)])
  .nullable()
  .optional()

const monthlySearchSchema = z
  .object({
    year: z.number().int(),
    month: z.number().int(),
    search_volume: z.number().finite().nullable().optional(),
  })
  .passthrough()

export const keywordOverviewItemSchema = z
  .object({
    keyword: z.string().trim().min(1),
    keyword_info: z
      .object({
        search_volume: nullableNumber,
        cpc: nullableNumber,
        competition: nullableNumber,
        monthly_searches: z
          .array(monthlySearchSchema)
          .max(MAX_PROVIDER_MONTHLY_SEARCH_ROWS)
          .nullish(),
        last_updated_time: z.string().trim().min(1).nullable().optional(),
      })
      .nullish(),
    keyword_properties: z
      .object({
        keyword_difficulty: nullableNumber,
      })
      .nullish(),
    serp_info: z
      .object({
        se_results_count: nullableCount,
      })
      .nullish(),
    search_intent_info: z
      .object({
        main_intent: z
          .enum([
            'informational',
            'navigational',
            'commercial',
            'transactional',
          ])
          .nullable()
          .optional(),
      })
      .nullish(),
  })
  .passthrough()

const keywordOverviewResultSchema = z
  .object({
    items_count: z.number().int().nonnegative().optional(),
    items: z.array(keywordOverviewItemSchema).optional(),
  })
  .passthrough()

const keywordOverviewTaskSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    status_code: z.number().int(),
    status_message: z.string(),
    cost: z.number().finite().nonnegative().optional(),
    result_count: z.number().int().nonnegative().optional(),
    result: z.array(keywordOverviewResultSchema).nullable().optional(),
  })
  .passthrough()

export const dataForSeoKeywordOverviewResponseSchema = z
  .object({
    status_code: z.number().int(),
    status_message: z.string(),
    cost: z.number().finite().nonnegative().optional(),
    tasks_count: z.number().int().nonnegative(),
    tasks_error: z.number().int().nonnegative(),
    tasks: z.array(keywordOverviewTaskSchema),
  })
  .passthrough()

export type DataForSeoKeywordOverviewResponse = z.infer<
  typeof dataForSeoKeywordOverviewResponseSchema
>

export type DataForSeoKeywordOverviewItem = NonNullable<
  NonNullable<
    NonNullable<
      DataForSeoKeywordOverviewResponse['tasks'][number]['result']
    >[number]['items']
  >[number]
>

export function firstKeywordOverviewItem(
  response: DataForSeoKeywordOverviewResponse,
) {
  return response.tasks[0]?.result?.[0]?.items?.[0]
}

export function optionalResultCount(
  value: string | number | null | undefined,
): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
