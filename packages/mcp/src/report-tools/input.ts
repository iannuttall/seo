import { fetchRateInput } from '../fetch-rate.js'
import { resolveJsOption } from '../input-schemas.js'
import { mcpReportInputSchema } from '../report-options.js'

export const reportFetchInputSchema = mcpReportInputSchema([
  'verifyContent',
  'verifyLimit',
  'js',
  'fetchConcurrency',
  'fetchIntervalCap',
  'fetchIntervalMs',
  'refresh',
])

export type ReportFetchToolInput = {
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean
  fetchConcurrency?: number
  fetchIntervalCap?: number
  fetchIntervalMs?: number
  refresh?: boolean
}

export function reportFetchOptions(input: ReportFetchToolInput) {
  return {
    verifyContent: input.verifyContent,
    verifyLimit: input.verifyLimit,
    js: resolveJsOption(input.js, undefined),
    rate: fetchRateInput({
      fetchConcurrency: input.fetchConcurrency,
      fetchIntervalCap: input.fetchIntervalCap,
      fetchIntervalMs: input.fetchIntervalMs,
    }),
    refresh: input.refresh,
  }
}
