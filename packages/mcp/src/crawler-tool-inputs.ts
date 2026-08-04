import {
  type AnalyticsConnection,
  MAX_CRAWL_CONCURRENCY,
  MAX_CRAWL_DEPTH,
  MAX_CRAWL_PAGES,
  SeoError,
} from '@seo/core'
import * as z from 'zod/v4'

export const crawlPageLimit = z
  .number()
  .int()
  .min(1)
  .max(MAX_CRAWL_PAGES)
  .optional()
export const crawlDepthLimit = z
  .number()
  .int()
  .min(0)
  .max(MAX_CRAWL_DEPTH)
  .optional()
export const crawlConcurrencyLimit = z
  .number()
  .int()
  .min(1)
  .max(MAX_CRAWL_CONCURRENCY)
  .optional()
export const clickySiteIdInput = z
  .string()
  .regex(/^\d{1,30}$/u)
  .optional()

export function clickyAnalyticsConnection(input: {
  googleAnalyticsPropertyId?: string
  clickySiteId?: string
}): AnalyticsConnection | undefined {
  if (input.googleAnalyticsPropertyId && input.clickySiteId) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass either googleAnalyticsPropertyId or clickySiteId, not both.',
    )
  }
  return input.clickySiteId
    ? { provider: 'clicky', siteId: input.clickySiteId }
    : undefined
}
