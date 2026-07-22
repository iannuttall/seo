import { z } from 'zod'

const nullableCount = z.number().int().nonnegative().nullable().optional()
const nullableScore = z.number().finite().nonnegative().nullable().optional()
const nullableText = z.string().max(20_000).nullable().optional()

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

export const dataForSeoLinkSummaryItemSchema = z
  .object({
    target: z.string().trim().min(1).max(2_048).optional(),
    rank: nullableScore,
    backlinks: nullableCount,
    referring_pages: nullableCount,
    referring_domains: nullableCount,
    broken_backlinks: nullableCount,
    broken_pages: nullableCount,
    backlinks_spam_score: nullableScore,
    info: z
      .object({
        target_spam_score: nullableScore,
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()

export const dataForSeoLinkSummaryResponseSchema = paidResponseSchema.extend({
  tasks: z
    .array(
      z
        .object({
          ...taskFields,
          result: z
            .array(dataForSeoLinkSummaryItemSchema)
            .max(10)
            .nullable()
            .optional(),
        })
        .passthrough(),
    )
    .max(10),
})

export const dataForSeoBacklinkItemSchema = z
  .object({
    domain_from: nullableText,
    url_from: nullableText,
    url_to: nullableText,
    anchor: nullableText,
    item_type: z.string().max(100).nullable().optional(),
    dofollow: z.boolean().nullable().optional(),
    rank: nullableScore,
    domain_from_rank: nullableScore,
    page_from_rank: nullableScore,
    backlink_spam_score: nullableScore,
    backlinks_spam_score: nullableScore,
    first_seen: z.string().max(100).nullable().optional(),
    last_visited: z.string().max(100).nullable().optional(),
    lost_date: z.string().max(100).nullable().optional(),
    is_lost: z.boolean().nullable().optional(),
    is_indirect_link: z.boolean().nullable().optional(),
    links_count: nullableCount,
    group_count: nullableCount,
    rel_attributes: z
      .array(z.string().trim().min(1).max(100))
      .max(100)
      .nullable()
      .optional(),
    attributes: z
      .array(z.string().trim().min(1).max(100))
      .max(100)
      .nullable()
      .optional(),
  })
  .passthrough()

const backlinkResultSchema = z
  .object({
    target: z.string().trim().min(1).max(2_048).optional(),
    total_count: nullableCount,
    items_count: nullableCount,
    search_after_token: z.string().max(20_000).nullable().optional(),
    items: z
      .array(dataForSeoBacklinkItemSchema)
      .max(1_000)
      .nullable()
      .optional(),
  })
  .passthrough()

export const dataForSeoBacklinksResponseSchema = paidResponseSchema.extend({
  tasks: z
    .array(
      z
        .object({
          ...taskFields,
          result: z.array(backlinkResultSchema).max(10).nullable().optional(),
        })
        .passthrough(),
    )
    .max(10),
})

export const dataForSeoReferringDomainItemSchema = z
  .object({
    domain: z.string().trim().min(1).max(2_048).nullable().optional(),
    backlinks: nullableCount,
    referring_pages: nullableCount,
    broken_backlinks: nullableCount,
    broken_pages: nullableCount,
    rank: nullableScore,
    backlinks_spam_score: nullableScore,
    first_seen: z.string().max(100).nullable().optional(),
  })
  .passthrough()

const referringDomainsResultSchema = z
  .object({
    target: z.string().trim().min(1).max(2_048).optional(),
    total_count: nullableCount,
    items_count: nullableCount,
    items: z
      .array(dataForSeoReferringDomainItemSchema)
      .max(1_000)
      .nullable()
      .optional(),
  })
  .passthrough()

export const dataForSeoReferringDomainsResponseSchema =
  paidResponseSchema.extend({
    tasks: z
      .array(
        z
          .object({
            ...taskFields,
            result: z
              .array(referringDomainsResultSchema)
              .max(10)
              .nullable()
              .optional(),
          })
          .passthrough(),
      )
      .max(10),
  })

export type DataForSeoLinkSummaryResponse = z.infer<
  typeof dataForSeoLinkSummaryResponseSchema
>
export type DataForSeoBacklinksResponse = z.infer<
  typeof dataForSeoBacklinksResponseSchema
>
export type DataForSeoReferringDomainsResponse = z.infer<
  typeof dataForSeoReferringDomainsResponseSchema
>
