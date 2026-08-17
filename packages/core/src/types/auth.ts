import { z } from 'zod'

export const tokenSchema = z.object({
  provider: z.literal('google'),
  account_email: z.string().email().max(320),
  scope: z.string().max(20_000),
  token_type: z.string().max(100),
  access_token: z.string().max(65_536).optional(),
  refresh_token: z.string().max(65_536).optional(),
  expires_at: z.number().int(),
  obtained_at: z.number().int(),
  client_source: z.enum(['shared', 'byo']),
})

export type StoredTokens = z.infer<typeof tokenSchema>

export const tokenStoreSchema = z
  .object({
    version: z.literal(2),
    active_account: z.string().email(),
    accounts: z.array(tokenSchema).min(1).max(50),
  })
  .superRefine((store, context) => {
    const emails = store.accounts.map((tokens) =>
      tokens.account_email.toLowerCase(),
    )
    if (new Set(emails).size !== emails.length) {
      context.addIssue({
        code: 'custom',
        path: ['accounts'],
        message: 'Google account emails must be unique.',
      })
    }
    if (!emails.includes(store.active_account.toLowerCase())) {
      context.addIssue({
        code: 'custom',
        path: ['active_account'],
        message: 'The active Google account must exist in accounts.',
      })
    }
  })

export type StoredTokenStore = z.infer<typeof tokenStoreSchema>
