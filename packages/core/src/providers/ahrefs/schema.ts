import { z } from 'zod'

const nullableNonnegativeInteger = z.number().int().nonnegative().nullable()
const nullableScore = z.number().min(0).max(100).nullable()
const boundedString = z.string().max(10_000)
const nullableString = boundedString.nullable()

export const ahrefsLimitsAndUsageResponseSchema = z
  .object({
    limits_and_usage: z
      .object({
        api_key_expiration_date: z.string().trim().min(1).max(100),
        subscription: z.string().trim().min(1).max(200),
        units_limit_api_key: z.number().int().nonnegative().nullable(),
        units_limit_workspace: z.number().int().nonnegative().nullable(),
        units_usage_api_key: z.number().int().nonnegative(),
        units_usage_workspace: z.number().int().nonnegative().nullable(),
        usage_reset_date: z.string().trim().min(1).max(100),
      })
      .strict(),
  })
  .strict()

export const ahrefsIntentsSchema = z
  .object({
    informational: z.boolean().optional(),
    navigational: z.boolean().optional(),
    commercial: z.boolean().optional(),
    transactional: z.boolean().optional(),
    branded: z.boolean().optional(),
    local: z.boolean().optional(),
  })
  .strict()

export const ahrefsKeywordOverviewResponseSchema = z
  .object({
    keywords: z
      .array(
        z
          .object({
            keyword: boundedString,
            volume: nullableNonnegativeInteger,
            cpc: nullableNonnegativeInteger,
            difficulty: z.number().int().min(0).max(100).nullable(),
            intents: ahrefsIntentsSchema.nullable(),
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict()

export const ahrefsKeywordIdeasResponseSchema = z
  .object({
    keywords: z
      .array(
        z
          .object({
            keyword: boundedString,
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict()

export const ahrefsDomainMetricsResponseSchema = z
  .object({
    metrics: z
      .object({
        org_cost: nullableNonnegativeInteger,
        org_keywords: z.number().int().nonnegative(),
        org_keywords_1_3: z.number().int().nonnegative(),
        org_traffic: z.number().int().nonnegative(),
        paid_cost: nullableNonnegativeInteger,
        paid_keywords: z.number().int().nonnegative(),
        paid_pages: z.number().int().nonnegative(),
        paid_traffic: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()

export const ahrefsOrganicKeywordsResponseSchema = z
  .object({
    keywords: z
      .array(
        z
          .object({
            keyword: nullableString,
            best_position: nullableNonnegativeInteger,
            best_position_kind: nullableString,
            best_position_url: nullableString,
            volume: nullableNonnegativeInteger,
            cpc: nullableNonnegativeInteger,
            keyword_difficulty: z.number().int().min(0).max(100).nullable(),
            sum_traffic: nullableNonnegativeInteger,
            is_branded: z.boolean(),
            is_commercial: z.boolean(),
            is_informational: z.boolean(),
            is_local: z.boolean(),
            is_navigational: z.boolean(),
            is_transactional: z.boolean(),
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict()

export const ahrefsTopPagesResponseSchema = z
  .object({
    pages: z
      .array(
        z
          .object({
            url: nullableString,
            keywords: nullableNonnegativeInteger,
            sum_traffic: nullableNonnegativeInteger,
            value: nullableNonnegativeInteger,
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict()

export const ahrefsSerpOverviewResponseSchema = z
  .object({
    positions: z
      .array(
        z
          .object({
            position: z.number().int().positive(),
            type: z.array(boundedString).max(50),
            url: nullableString,
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict()

export const ahrefsBacklinksStatsResponseSchema = z
  .object({
    metrics: z
      .object({
        all_time: z.number().int().nonnegative(),
        all_time_refdomains: z.number().int().nonnegative(),
        live: z.number().int().nonnegative(),
        live_refdomains: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()

export const ahrefsRefdomainsResponseSchema = z
  .object({
    refdomains: z
      .array(
        z
          .object({
            domain: boundedString,
            domain_rating: z.number().min(0).max(100),
            first_seen: boundedString,
            links_to_target: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict()

export const ahrefsBacklinksResponseSchema = z
  .object({
    backlinks: z
      .array(
        z
          .object({
            url_from: boundedString,
            root_name_source: boundedString,
            url_to: boundedString,
            anchor: boundedString,
            link_type: boundedString,
            is_dofollow: z.boolean(),
            first_seen_link: boundedString,
            last_seen: nullableString,
            is_lost: z.boolean(),
            is_redirect: z.boolean(),
            links_external: z.number().int().nonnegative(),
            domain_rating_source: z.number().min(0).max(100),
            url_rating_source: z.number().min(0).max(100),
            link_group_count: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict()

export const ahrefsDomainRatingResponseSchema = z
  .object({
    domain_rating: z
      .object({
        domain_rating: nullableScore,
        license: z.string().url().max(2_000),
        warning: nullableString.optional(),
      })
      .strict(),
  })
  .strict()
