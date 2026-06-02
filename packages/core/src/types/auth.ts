import { z } from 'zod'

export const tokenSchema = z.object({
  provider: z.literal('google'),
  account_email: z.string().email(),
  scope: z.string(),
  token_type: z.string(),
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_at: z.number().int(),
  obtained_at: z.number().int(),
  client_source: z.enum(['shared', 'byo']),
})

export type StoredTokens = z.infer<typeof tokenSchema>
