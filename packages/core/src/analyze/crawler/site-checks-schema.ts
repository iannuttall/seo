import { z } from 'zod'

const probeSchema = z.object({
  url: z.string().url(),
  status: z.number().int().optional(),
  finalUrl: z.string().url().optional(),
  redirected: z.boolean().optional(),
  accessBlocked: z.boolean().optional(),
  error: z.string().optional(),
})

export const crawlSiteChecksSchema = z.object({
  soft404: z.object({
    status: z.enum(['pass', 'warning', 'unknown']),
    probes: z.array(probeSchema),
    probeLimit: z.number().int().positive(),
    complete: z.boolean(),
  }),
  hostVariant: z
    .object({
      status: z.enum(['pass', 'warning', 'unknown']),
      probes: z.array(probeSchema),
    })
    .optional(),
})
