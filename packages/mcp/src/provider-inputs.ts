import { normalizedResearchColumnName } from '@seo/core'
import * as z from 'zod/v4'

export const providerKeywordInput = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (value) => value.split(/\s+/u).length <= 10,
    'Use at most 10 words per keyword.',
  )

export const providerLocationInput = z
  .strictObject({
    code: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => value.code !== undefined || value.name !== undefined, {
    message: 'A location needs a code or name.',
  })

export const providerCountryCodeInput = z
  .string()
  .trim()
  .regex(/^[a-z]{2}$/i)

export const providerLanguageCodeInput = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i)

export const providerIdInput = z.enum([
  'dataforseo',
  'semrush',
  'ahrefs',
  'serpbase',
])
export const researchImportProviderIdInput = z.enum([
  'dataforseo',
  'semrush',
  'ahrefs',
])
export const providerSearchEngineInput = z
  .enum(['google', 'bing'])
  .default('google')
export const providerDeviceInput = z.enum(['desktop', 'mobile'])

const sourceColumnInput = (meaning: string) =>
  z.string().trim().min(1).max(500).describe(meaning).optional()

const researchColumnsInput = z
  .strictObject({
    keyword: sourceColumnInput('Source column containing the search query.'),
    url: sourceColumnInput('Source column containing the ranking URL.'),
    position: sourceColumnInput('Source column containing grouped position.'),
    absolutePosition: sourceColumnInput(
      'Source column containing absolute result position.',
    ),
    searchVolume: sourceColumnInput(
      'Source column containing monthly search volume.',
    ),
    keywordDifficulty: sourceColumnInput(
      'Source column containing keyword difficulty.',
    ),
    cpc: sourceColumnInput('Source column containing cost per click.'),
    paidCompetition: sourceColumnInput(
      'Source column containing paid competition.',
    ),
    intent: sourceColumnInput('Source column containing search intent.'),
    resultCount: sourceColumnInput(
      'Source column containing estimated result count.',
    ),
    estimatedTraffic: sourceColumnInput(
      'Source column containing estimated monthly visits.',
    ),
    resultType: sourceColumnInput('Source column containing result type.'),
    searchVolumeUpdatedAt: sourceColumnInput(
      'Source column containing the search volume update date.',
    ),
  })
  .superRefine((columns, context) => {
    const seen = new Map<string, string>()
    for (const [canonical, source] of Object.entries(columns)) {
      if (!source) continue
      const normalized = normalizedResearchColumnName(source)
      const existing = seen.get(normalized)
      if (existing) {
        context.addIssue({
          code: 'custom',
          message: `Source column "${source}" is already mapped to "${existing}".`,
          path: [canonical],
        })
      } else {
        seen.set(normalized, canonical)
      }
    }
  })
  .describe(
    'Optional canonical field to source column mapping. Named fields override automatic header matching.',
  )

export const researchFilesInput = z
  .array(
    z.strictObject({
      dataset: z.literal('ranked-keywords'),
      file: z.string().trim().min(1).max(4_096),
      provider: researchImportProviderIdInput,
      exportedAt: z.string().trim().min(1).max(100),
      format: z.enum(['csv', 'json', 'jsonl']).optional(),
      rowLimit: z.number().int().min(1).max(100_000).optional(),
      columns: researchColumnsInput.optional(),
    }),
  )
  .min(1)
  .max(4)
  .describe(
    'One to four local ranked-keyword exports from the same provider and market.',
  )
