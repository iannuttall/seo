import { aiPromptObservationsReport } from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from '../agent-output-budget.js'
import {
  providerCountryCodeInput,
  providerLanguageCodeInput,
} from '../provider-inputs.js'
import { type ToolResult, toolError, toolSuccess } from '../tool-result.js'

const promptInput = z.strictObject({
  id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('Stable local id used to match this prompt over time.'),
  group: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('Optional local label for related prompts.'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe('Exact question or instruction sent to the selected models.'),
})

const modelInput = z.strictObject({
  surface: z
    .enum(['chatgpt', 'claude', 'gemini', 'perplexity'])
    .describe('AI product to observe.'),
  model: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      'Exact current model name from the provider catalog. Stale names fail before paid work.',
    ),
})

const targetInput = z.strictObject({
  label: z
    .string()
    .trim()
    .min(1)
    .max(250)
    .describe('Name shown for this target in the report.'),
  aliases: z
    .array(z.string().trim().min(1).max(250))
    .max(5)
    .optional()
    .describe('Other exact names that identify this target in an answer.'),
  domains: z
    .array(z.string().trim().min(1).max(2_048))
    .max(5)
    .optional()
    .describe('Domains that identify this target in returned citations.'),
})

export const aiPromptObservationsInputSchema = z.strictObject({
  prompts: z
    .array(promptInput)
    .min(1)
    .max(5)
    .describe('One to five fixed prompts. Start with the smallest useful set.'),
  models: z
    .array(modelInput)
    .min(1)
    .max(4)
    .describe(
      'One to four exact surface and model pairs. Every prompt and model pair starts one request.',
    ),
  target: targetInput.describe(
    'Primary brand, product, person, or site to find.',
  ),
  competitors: z
    .array(targetInput)
    .max(5)
    .optional()
    .describe(
      'Optional named comparisons checked in the same retained answers.',
    ),
  countryCode: providerCountryCodeInput.describe(
    'Two-letter country label for this observation set. It is not a precise user location filter.',
  ),
  languageCode: providerLanguageCodeInput.describe(
    'Language label for this observation set. Write the prompt in the language you need.',
  ),
  provider: z
    .literal('dataforseo')
    .optional()
    .describe(
      'Live answer provider. DataForSEO is the supported provider today.',
    ),
  webSearch: z
    .boolean()
    .default(true)
    .describe(
      'Ask supported models to use web search. Perplexity always uses web search.',
    ),
  maxOutputTokens: z
    .number()
    .int()
    .min(1)
    .max(4_096)
    .default(2_048)
    .describe('Maximum generated tokens requested for each answer.'),
  site: z
    .string()
    .trim()
    .min(1)
    .max(2_048)
    .optional()
    .describe(
      'Optional Search Console property used for first-party query context.',
    ),
  days: z
    .number()
    .int()
    .min(1)
    .max(548)
    .optional()
    .describe('Optional Search Console lookback window. Defaults to 90 days.'),
  refresh: z
    .boolean()
    .optional()
    .describe('Bypass cached provider answers and request fresh observations.'),
})

export function createAiPromptObservationsHandler(
  dependencies: {
    aiPromptObservationsReport?: typeof aiPromptObservationsReport
  } = {},
): (input: Record<string, unknown>) => Promise<ToolResult> {
  return async (input) => {
    const {
      prompts,
      models,
      target,
      competitors,
      countryCode,
      languageCode,
      provider,
      webSearch,
      maxOutputTokens,
      site,
      days,
      refresh,
    } = aiPromptObservationsInputSchema.parse(input)
    try {
      const report = await (
        dependencies.aiPromptObservationsReport ?? aiPromptObservationsReport
      )({
        prompts,
        models,
        target,
        competitors,
        market: { countryCode, languageCode },
        provider,
        webSearch,
        maxOutputTokens,
        site,
        days,
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
  }
}
