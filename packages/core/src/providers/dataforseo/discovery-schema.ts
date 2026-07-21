import { z } from 'zod'
import { keywordOverviewItemSchema } from './schema.js'

const directDiscoveryItemSchema = keywordOverviewItemSchema
const relatedDiscoveryItemSchema = z
  .object({
    keyword_data: keywordOverviewItemSchema,
    depth: z.number().int().nonnegative().optional(),
    related_keywords: z.array(z.string().trim().min(1)).max(100).optional(),
  })
  .passthrough()

export const dataForSeoDiscoveryItemSchema = z.union([
  directDiscoveryItemSchema,
  relatedDiscoveryItemSchema,
])

const discoveryResultSchema = z
  .object({
    seed_keyword: z.string().trim().min(1).optional(),
    seed_keywords: z.array(z.string().trim().min(1)).max(20).optional(),
    total_count: z.number().int().nonnegative().optional(),
    items_count: z.number().int().nonnegative().optional(),
    offset_token: z.string().max(20_000).nullable().optional(),
    items: z.array(dataForSeoDiscoveryItemSchema).max(500).optional(),
  })
  .passthrough()

const discoveryTaskSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    status_code: z.number().int(),
    status_message: z.string().max(1000),
    cost: z.number().finite().nonnegative().optional(),
    result_count: z.number().int().nonnegative().optional(),
    result: z.array(discoveryResultSchema).max(10).nullable().optional(),
  })
  .passthrough()

export const dataForSeoDiscoveryResponseSchema = z
  .object({
    status_code: z.number().int(),
    status_message: z.string().max(1000),
    cost: z.number().finite().nonnegative().optional(),
    tasks_count: z.number().int().nonnegative(),
    tasks_error: z.number().int().nonnegative(),
    tasks: z.array(discoveryTaskSchema).max(10),
  })
  .passthrough()

export type DataForSeoDiscoveryResponse = z.infer<
  typeof dataForSeoDiscoveryResponseSchema
>
export type DataForSeoDiscoveryItem = z.infer<
  typeof dataForSeoDiscoveryItemSchema
>
