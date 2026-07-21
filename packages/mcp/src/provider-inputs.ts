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

export const providerIdInput = z.enum(['dataforseo', 'semrush', 'ahrefs'])
export const providerSearchEngineInput = z
  .enum(['google', 'bing'])
  .default('google')
export const providerDeviceInput = z.enum(['desktop', 'mobile'])
