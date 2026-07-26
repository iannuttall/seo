import {
  PSEO_PATTERN_CATALOG,
  PSEO_PATTERN_KINDS,
  PSEO_PATTERN_LIMITS,
  pseoPatternsReport,
} from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from '../agent-output-budget.js'
import {
  providerCountryCodeInput,
  providerDeviceInput,
  providerIdInput,
  providerLanguageCodeInput,
  providerLocationInput,
  providerSearchEngineInput,
} from '../provider-inputs.js'
import { type ToolResult, toolError, toolSuccess } from '../tool-result.js'

const patternKindInput = z.enum(PSEO_PATTERN_KINDS)
const coveragePolicyInput = z
  .enum(['evidence-led', 'complete-set'])
  .default('evidence-led')
const patternValueInput = z.union([
  z.string().trim().min(1).max(80),
  z.strictObject({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    label: z.string().trim().min(1).max(80),
  }),
])
const queryTemplatesInput = z
  .array(z.string().trim().min(1).max(120))
  .min(1)
  .max(PSEO_PATTERN_LIMITS.queryTemplates)
const patternSetBase = {
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  kind: patternKindInput,
  coveragePolicy: coveragePolicyInput,
  queryTemplates: queryTemplatesInput,
  pathTemplate: z.string().trim().min(1).max(200).startsWith('/').optional(),
}
const termSetInput = z.strictObject({
  ...patternSetBase,
  shape: z.literal('terms'),
  values: z
    .array(patternValueInput)
    .min(1)
    .max(PSEO_PATTERN_LIMITS.valuesPerSet),
})
const pairSetInput = z
  .strictObject({
    ...patternSetBase,
    shape: z.literal('pairs'),
    values: z
      .array(patternValueInput)
      .min(2)
      .max(PSEO_PATTERN_LIMITS.valuesPerSet),
    pairing: z.enum(['anchor', 'all-pairs', 'explicit']),
    anchor: z.string().trim().min(1).max(80).optional(),
    pairs: z
      .array(
        z.strictObject({
          left: z.string().trim().min(1).max(80),
          right: z.string().trim().min(1).max(80),
        }),
      )
      .min(1)
      .max(PSEO_PATTERN_LIMITS.explicitPairs)
      .optional(),
  })
  .superRefine((set, context) => {
    if (set.pairing === 'anchor' && !set.anchor) {
      context.addIssue({
        code: 'custom',
        path: ['anchor'],
        message: 'Anchor pairing requires anchor.',
      })
    }
    if (set.pairing !== 'anchor' && set.anchor !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['anchor'],
        message: 'anchor is only valid for anchor pairing.',
      })
    }
    if (set.pairing === 'explicit' && !set.pairs) {
      context.addIssue({
        code: 'custom',
        path: ['pairs'],
        message: 'Explicit pairing requires pairs.',
      })
    }
    if (set.pairing !== 'explicit' && set.pairs !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['pairs'],
        message: 'pairs is only valid for explicit pairing.',
      })
    }
  })
const matrixSetInput = z.strictObject({
  ...patternSetBase,
  shape: z.literal('matrix'),
  axes: z
    .array(
      z.strictObject({
        id: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[a-z][a-z0-9-]*$/u),
        values: z
          .array(patternValueInput)
          .min(1)
          .max(PSEO_PATTERN_LIMITS.valuesPerSet),
      }),
    )
    .min(1)
    .max(PSEO_PATTERN_LIMITS.matrixAxes),
})
const patternSetInput = z
  .discriminatedUnion('shape', [termSetInput, pairSetInput, matrixSetInput])
  .superRefine((set, context) => {
    const catalog = PSEO_PATTERN_CATALOG.find(
      (entry) => entry.kind === set.kind,
    )
    if (!catalog?.shapes.includes(set.shape)) {
      context.addIssue({
        code: 'custom',
        path: ['shape'],
        message: `${set.kind} does not support ${set.shape}.`,
      })
    }
  })

export const pseoPatternsInputSchema = z
  .strictObject({
    site: z.string().trim().min(1).max(2_048),
    days: z.number().int().min(1).max(548).optional(),
    sitemaps: z.array(z.string().url()).max(20).optional(),
    maxSitemapUrls: z.number().int().min(1).max(100_000).optional(),
    templateLimit: z.number().int().min(1).max(25).optional(),
    minimumTemplateUrls: z.number().int().min(2).max(100).optional(),
    minimumTemplateShare: z.number().min(0).max(1).optional(),
    minimumTemplateImpressions: z.number().min(0).max(1_000_000_000).optional(),
    brandTerms: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    includeBrand: z.boolean().default(true),
    patternSets: z
      .array(patternSetInput)
      .max(PSEO_PATTERN_LIMITS.patternSets)
      .default([]),
    candidateLimit: z
      .number()
      .int()
      .min(1)
      .max(PSEO_PATTERN_LIMITS.candidates)
      .default(100),
    observedQueryLimit: z
      .number()
      .int()
      .min(1)
      .max(PSEO_PATTERN_LIMITS.observedQueries)
      .default(100),
    includeExternal: z.boolean().default(false),
    countryCode: providerCountryCodeInput.optional(),
    languageCode: providerLanguageCodeInput.optional(),
    searchEngine: providerSearchEngineInput,
    location: providerLocationInput.optional(),
    device: providerDeviceInput.optional(),
    provider: providerIdInput.optional(),
    keywordLimit: z
      .number()
      .int()
      .min(0)
      .max(PSEO_PATTERN_LIMITS.keywordMetrics)
      .optional(),
    serpLimit: z
      .number()
      .int()
      .min(0)
      .max(PSEO_PATTERN_LIMITS.serps)
      .default(0),
    serpDepth: z
      .number()
      .int()
      .min(1)
      .max(PSEO_PATTERN_LIMITS.serpDepth)
      .default(10),
    projectId: z.string().trim().min(1).max(80).optional(),
    refresh: z.boolean().optional(),
  })
  .superRefine((input, context) => {
    const hasExternalOptions = Boolean(
      input.countryCode ||
        input.languageCode ||
        input.location ||
        input.device ||
        input.provider ||
        (input.keywordLimit ?? 0) > 0 ||
        input.serpLimit,
    )
    if (!input.includeExternal && hasExternalOptions) {
      context.addIssue({
        code: 'custom',
        path: ['includeExternal'],
        message:
          'Set includeExternal to true before passing market, provider, keyword, or SERP options.',
      })
    }
    if (input.includeExternal && (!input.countryCode || !input.languageCode)) {
      context.addIssue({
        code: 'custom',
        path: ['includeExternal'],
        message:
          'External pSEO pattern research requires countryCode and languageCode.',
      })
    }
  })

export function createPseoPatternsHandler(
  dependencies: { pseoPatternsReport?: typeof pseoPatternsReport } = {},
): (input: Record<string, unknown>) => Promise<ToolResult> {
  return async (input) => {
    try {
      const parsed = pseoPatternsInputSchema.parse(input)
      const report = await (
        dependencies.pseoPatternsReport ?? pseoPatternsReport
      )({
        site: parsed.site,
        days: parsed.days,
        sitemaps: parsed.sitemaps,
        maxSitemapUrls: parsed.maxSitemapUrls,
        templateLimit: parsed.templateLimit,
        minimumTemplateUrls: parsed.minimumTemplateUrls,
        minimumTemplateShare: parsed.minimumTemplateShare,
        minimumTemplateImpressions: parsed.minimumTemplateImpressions,
        brandTerms: parsed.brandTerms,
        includeBrand: parsed.includeBrand,
        patternSets: parsed.patternSets,
        candidateLimit: parsed.candidateLimit,
        observedQueryLimit: parsed.observedQueryLimit,
        includeExternal: parsed.includeExternal,
        market:
          parsed.countryCode && parsed.languageCode
            ? {
                countryCode: parsed.countryCode,
                languageCode: parsed.languageCode,
                searchEngine: parsed.searchEngine,
                location: parsed.location,
                device: parsed.device,
              }
            : undefined,
        provider: parsed.provider,
        keywordLimit: parsed.keywordLimit,
        serpLimit: parsed.serpLimit,
        serpDepth: parsed.serpDepth,
        projectId: parsed.projectId,
        refresh: parsed.refresh,
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
