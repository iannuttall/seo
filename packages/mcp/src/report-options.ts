import * as z from 'zod/v4'

// Shared report option metadata used by MCP tools. The parity check keeps this
// aligned with scripts/report-surface-catalog.mjs.
const REPORT_OPTIONS = {
  site: { mcp: 'site', schema: z.string() },
  days: { mcp: 'days', schema: z.number().optional() },
  recentDays: { mcp: 'recentDays', schema: z.number().optional() },
  range: { mcp: 'range', schema: z.number().optional() },
  limit: { mcp: 'limit', schema: z.number().optional() },
  checkLimit: { mcp: 'checkLimit', schema: z.number().optional() },
  minImpressions: { mcp: 'minImpressions', schema: z.number().optional() },
  includeBrand: { mcp: 'includeBrand', schema: z.boolean().optional() },
  verifyContent: { mcp: 'verifyContent', schema: z.boolean().optional() },
  verifyLimit: { mcp: 'verifyLimit', schema: z.number().optional() },
  js: { mcp: 'js', schema: z.boolean().optional() },
  fetchConcurrency: { mcp: 'fetchConcurrency', schema: z.number().optional() },
  fetchIntervalCap: { mcp: 'fetchIntervalCap', schema: z.number().optional() },
  fetchIntervalMs: { mcp: 'fetchIntervalMs', schema: z.number().optional() },
  refresh: { mcp: 'refresh', schema: z.boolean().optional() },
} as const

type ReportOptionKey = keyof typeof REPORT_OPTIONS

export function mcpReportInputSchema<
  const T extends readonly ReportOptionKey[],
>(
  keys: T,
): {
  [K in T[number] as (typeof REPORT_OPTIONS)[K]['mcp']]: (typeof REPORT_OPTIONS)[K]['schema']
} {
  return Object.fromEntries(
    keys.map((key) => {
      const option = REPORT_OPTIONS[key]
      return [option.mcp, option.schema]
    }),
  ) as {
    [K in T[number] as (typeof REPORT_OPTIONS)[K]['mcp']]: (typeof REPORT_OPTIONS)[K]['schema']
  }
}
