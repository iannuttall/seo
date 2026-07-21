import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { keywordMetricsReport } from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from './agent-output-budget.js'
import { toolError, toolSuccess } from './tool-result.js'

const keywordInput = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (value) => value.split(/\s+/u).length <= 10,
    'Use at most 10 words per keyword.',
  )

const locationInput = z
  .strictObject({
    code: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(500).optional(),
  })
  .refine(
    (value) => (value.code === undefined) !== (value.name === undefined),
    { message: 'Use exactly one location code or name.' },
  )

export function registerKeywordTools(
  server: McpServer,
  dependencies: { keywordMetricsReport?: typeof keywordMetricsReport } = {},
): void {
  server.registerTool(
    'seo_keyword_metrics',
    {
      description:
        'Compare bounded third-party keyword demand, cost, competition, difficulty, intent, result-count, and trend evidence',
      inputSchema: {
        keywords: z.array(keywordInput).min(1).max(50),
        countryCode: z
          .string()
          .trim()
          .regex(/^[a-z]{2}$/i),
        languageCode: z
          .string()
          .trim()
          .min(2)
          .max(35)
          .regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i),
        searchEngine: z.enum(['google', 'bing']).default('google'),
        location: locationInput.optional(),
        device: z.enum(['desktop', 'mobile']).optional(),
        provider: z.enum(['dataforseo', 'semrush', 'ahrefs']).optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      keywords,
      countryCode,
      languageCode,
      searchEngine,
      location,
      device,
      provider,
      refresh,
    }) => {
      try {
        const report = await (
          dependencies.keywordMetricsReport ?? keywordMetricsReport
        )({
          keywords,
          market: {
            countryCode,
            languageCode,
            searchEngine,
            location,
            device,
          },
          provider,
          refresh,
        })
        return toolSuccess(
          report.summary.verdict,
          compactAgentWorkflowOutput(
            report as unknown as Record<string, unknown>,
          ),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
