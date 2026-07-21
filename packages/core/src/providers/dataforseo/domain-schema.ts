import { z } from 'zod'
import { keywordOverviewItemSchema } from './schema.js'

const nullableNumber = z.number().finite().nullable().optional()
const nullableNonnegativeNumber = z
  .number()
  .finite()
  .nonnegative()
  .nullable()
  .optional()
const nullableCount = z.number().int().nonnegative().nullable().optional()

const rankingMetricsSchema = z
  .object({
    pos_1: nullableCount,
    pos_2_3: nullableCount,
    pos_4_10: nullableCount,
    pos_11_20: nullableCount,
    pos_21_30: nullableCount,
    pos_31_40: nullableCount,
    pos_41_50: nullableCount,
    pos_51_60: nullableCount,
    pos_61_70: nullableCount,
    pos_71_80: nullableCount,
    pos_81_90: nullableCount,
    pos_91_100: nullableCount,
    etv: nullableNonnegativeNumber,
    count: nullableCount,
    estimated_paid_traffic_cost: nullableNonnegativeNumber,
    is_new: nullableCount,
    is_up: nullableCount,
    is_down: nullableCount,
    is_lost: nullableCount,
  })
  .passthrough()

const metricsSchema = z
  .object({
    organic: rankingMetricsSchema.nullable().optional(),
  })
  .passthrough()

const paidResponseSchema = z
  .object({
    status_code: z.number().int(),
    status_message: z.string().max(1_000),
    cost: z.number().finite().nonnegative().optional(),
    tasks_count: z.number().int().nonnegative(),
    tasks_error: z.number().int().nonnegative(),
  })
  .passthrough()

const taskFields = {
  id: z.string().trim().min(1).max(100).optional(),
  status_code: z.number().int(),
  status_message: z.string().max(1_000),
  cost: z.number().finite().nonnegative().optional(),
  result_count: z.number().int().nonnegative().optional(),
} as const

const overviewResultSchema = z
  .object({
    target: z.string().trim().min(1).max(2_048).optional(),
    location_code: z.number().int().positive().nullable().optional(),
    language_code: z.string().trim().min(1).max(35).nullable().optional(),
    metrics: metricsSchema.nullable().optional(),
  })
  .passthrough()

export const dataForSeoDomainOverviewResponseSchema = paidResponseSchema.extend(
  {
    tasks: z
      .array(
        z
          .object({
            ...taskFields,
            result: z.array(overviewResultSchema).max(10).nullable().optional(),
          })
          .passthrough(),
      )
      .max(10),
  },
)

const rankedSerpItemSchema = z
  .object({
    type: z.string().trim().min(1).max(100).optional(),
    rank_group: z.number().int().positive().nullable().optional(),
    rank_absolute: z.number().int().positive().nullable().optional(),
    url: z.string().trim().min(1).max(20_000).nullable().optional(),
    etv: nullableNonnegativeNumber,
  })
  .passthrough()

const rankedKeywordItemSchema = z
  .object({
    keyword_data: keywordOverviewItemSchema.nullable().optional(),
    ranked_serp_element: z
      .object({
        serp_item: rankedSerpItemSchema.nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()

const rankedKeywordsResultSchema = z
  .object({
    target: z.string().trim().min(1).max(2_048).optional(),
    total_count: z.number().int().nonnegative().nullable().optional(),
    items_count: z.number().int().nonnegative().optional(),
    items: z.array(rankedKeywordItemSchema).max(1_000).nullable().optional(),
  })
  .passthrough()

export const dataForSeoRankedKeywordsResponseSchema = paidResponseSchema.extend(
  {
    tasks: z
      .array(
        z
          .object({
            ...taskFields,
            result: z
              .array(rankedKeywordsResultSchema)
              .max(10)
              .nullable()
              .optional(),
          })
          .passthrough(),
      )
      .max(10),
  },
)

const rankingPageItemSchema = z
  .object({
    page_address: z.string().trim().min(1).max(20_000).nullable().optional(),
    metrics: metricsSchema.nullable().optional(),
  })
  .passthrough()

const rankingPagesResultSchema = z
  .object({
    target: z.string().trim().min(1).max(2_048).optional(),
    total_count: z.number().int().nonnegative().nullable().optional(),
    items_count: z.number().int().nonnegative().optional(),
    items: z.array(rankingPageItemSchema).max(1_000).nullable().optional(),
  })
  .passthrough()

export const dataForSeoRankingPagesResponseSchema = paidResponseSchema.extend({
  tasks: z
    .array(
      z
        .object({
          ...taskFields,
          result: z
            .array(rankingPagesResultSchema)
            .max(10)
            .nullable()
            .optional(),
        })
        .passthrough(),
    )
    .max(10),
})

const competitorItemSchema = z
  .object({
    domain: z.string().trim().min(1).max(2_048).nullable().optional(),
    avg_position: nullableNumber,
    median_position: nullableNumber,
    etv: nullableNonnegativeNumber,
    keywords_count: nullableCount,
    visibility: nullableNonnegativeNumber,
    relevant_serp_items: nullableCount,
    keywords_positions: z
      .record(
        z.string().trim().min(1).max(80),
        z.array(z.number().int().positive()).max(100),
      )
      .nullable()
      .optional(),
  })
  .passthrough()

const competitorsResultSchema = z
  .object({
    seed_keywords: z
      .array(z.string().trim().min(1).max(80))
      .max(200)
      .optional(),
    total_count: z.number().int().nonnegative().nullable().optional(),
    items_count: z.number().int().nonnegative().optional(),
    items: z.array(competitorItemSchema).max(1_000).nullable().optional(),
  })
  .passthrough()

export const dataForSeoSerpCompetitorsResponseSchema =
  paidResponseSchema.extend({
    tasks: z
      .array(
        z
          .object({
            ...taskFields,
            result: z
              .array(competitorsResultSchema)
              .max(10)
              .nullable()
              .optional(),
          })
          .passthrough(),
      )
      .max(10),
  })

export type DataForSeoDomainOverviewResponse = z.infer<
  typeof dataForSeoDomainOverviewResponseSchema
>
export type DataForSeoRankedKeywordsResponse = z.infer<
  typeof dataForSeoRankedKeywordsResponseSchema
>
export type DataForSeoRankingPagesResponse = z.infer<
  typeof dataForSeoRankingPagesResponseSchema
>
export type DataForSeoSerpCompetitorsResponse = z.infer<
  typeof dataForSeoSerpCompetitorsResponseSchema
>
export type DataForSeoRankingMetrics = z.infer<typeof rankingMetricsSchema>
