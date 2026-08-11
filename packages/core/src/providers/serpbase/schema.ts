import { z } from 'zod/v4'

export const serpBaseOrganicResultSchema = z
  .object({
    rank: z.unknown().optional(),
    position: z.unknown().optional(),
    title: z.unknown().optional(),
    link: z.unknown().optional(),
    url: z.unknown().optional(),
    display_url: z.unknown().optional(),
    display_link: z.unknown().optional(),
    snippet: z.unknown().optional(),
  })
  .passthrough()

export const serpBaseSearchSuccessSchema = z
  .object({
    status: z.literal(0),
    request_id: z.string().trim().min(1).max(100),
    elapsed_ms: z.number().finite().nonnegative(),
    credits_charged: z.number().int().nonnegative(),
    search_type: z.literal('search'),
    query: z.string().max(1_000),
    page: z.number().int().positive(),
    organic: z.array(serpBaseOrganicResultSchema).max(100).optional(),
    featured_snippet: z.unknown().optional(),
    top_stories: z.unknown().optional(),
    people_also_ask: z.unknown().optional(),
    knowledge_graph: z.unknown().optional(),
    related_searches: z.unknown().optional(),
    ai_overview: z.unknown().optional(),
    weather: z.unknown().optional(),
    finance: z.unknown().optional(),
    flight: z.unknown().optional(),
    result_stats: z.unknown().optional(),
  })
  .passthrough()

export const serpBaseSearchErrorSchema = z
  .object({
    status: z.union([
      z.literal(1000),
      z.literal(1001),
      z.literal(1004),
      z.literal(1020),
      z.literal(1029),
      z.literal(1500),
      z.literal(1502),
      z.literal(1503),
      z.literal(1504),
    ]),
    error: z.string().trim().min(1).max(2_000),
    request_id: z.string().trim().min(1).max(100).optional(),
    elapsed_ms: z.number().finite().nonnegative().optional(),
    credits_charged: z.number().int().nonnegative().optional(),
  })
  .passthrough()

export const serpBaseSearchResponseSchema = z.discriminatedUnion('status', [
  serpBaseSearchSuccessSchema,
  serpBaseSearchErrorSchema,
])

export type SerpBaseSearchSuccess = z.infer<typeof serpBaseSearchSuccessSchema>
export type SerpBaseSearchResponse = z.infer<
  typeof serpBaseSearchResponseSchema
>
