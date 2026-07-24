import { domainRatingReport } from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from '../agent-output-budget.js'
import { providerIdInput } from '../provider-inputs.js'
import { type ToolResult, toolError, toolSuccess } from '../tool-result.js'

export const domainRatingInputSchema = z.strictObject({
  target: z.string().trim().min(3).max(2_048),
  targetMode: z.enum(['domain', 'url']).default('domain'),
  provider: providerIdInput.optional(),
  refresh: z.boolean().optional(),
})

export function createDomainRatingHandler(
  dependencies: { domainRatingReport?: typeof domainRatingReport } = {},
): (input: Record<string, unknown>) => Promise<ToolResult> {
  return async (input) => {
    const parsed = domainRatingInputSchema.parse(input)
    try {
      const report = await (
        dependencies.domainRatingReport ?? domainRatingReport
      )(parsed)
      return toolSuccess(
        report.summary.verdict,
        compactAgentWorkflowOutput(
          report as unknown as Record<string, unknown>,
        ),
      )
    } catch (error) {
      return toolError(error)
    }
  }
}
