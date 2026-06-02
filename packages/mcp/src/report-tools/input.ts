import * as z from 'zod/v4'
import { fetchRateInput } from '../fetch-rate.js'

export const reportFetchInputSchema = {
  verifyContent: z.boolean().optional(),
  verifyLimit: z.number().optional(),
  js: z.boolean().optional(),
  fetchConcurrency: z.number().optional(),
  fetchIntervalCap: z.number().optional(),
  fetchIntervalMs: z.number().optional(),
  refresh: z.boolean().optional(),
}

export function reportFetchOptions(input: {
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean
  fetchConcurrency?: number
  fetchIntervalCap?: number
  fetchIntervalMs?: number
  refresh?: boolean
}) {
  return {
    verifyContent: input.verifyContent,
    verifyLimit: input.verifyLimit,
    js: input.js ? true : undefined,
    rate: fetchRateInput({
      fetchConcurrency: input.fetchConcurrency,
      fetchIntervalCap: input.fetchIntervalCap,
      fetchIntervalMs: input.fetchIntervalMs,
    }),
    refresh: input.refresh,
  }
}
