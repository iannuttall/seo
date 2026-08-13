import { createHash } from 'node:crypto'
import { z } from 'zod'
import { readClickySiteKey } from '../clicky/credentials.js'
import {
  deleteProviderSecret,
  PROVIDER_SECRET_NAMES,
  readProviderSecret,
  writeProviderSecret,
} from '../storage/provider-secrets.js'
import { providerExtensionIdSchema } from './contracts.js'
import type { SeoProviderConnectionField } from './sdk.js'

const storedCredentialsSchema = z
  .object({
    version: z.literal(1),
    providers: z.record(
      providerExtensionIdSchema,
      z.record(
        z
          .string()
          .length(64)
          .regex(/^[a-f0-9]+$/u),
        z.record(z.string().min(1).max(64), z.string().min(1).max(4_096)),
      ),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.providers).length > 20) {
      context.addIssue({
        code: 'custom',
        path: ['providers'],
        message: 'Too many provider credential records.',
      })
    }
    for (const [providerId, accounts] of Object.entries(value.providers)) {
      if (Object.keys(accounts).length > 50) {
        context.addIssue({
          code: 'custom',
          path: ['providers', providerId],
          message: 'Too many account credential records.',
        })
      }
    }
  })

type StoredCredentials = z.infer<typeof storedCredentialsSchema>

function accountKey(account: Readonly<Record<string, string>>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(account).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    ),
  )
  return createHash('sha256').update(canonical).digest('hex')
}

async function readStored(): Promise<StoredCredentials> {
  const secret = await readProviderSecret({
    name: PROVIDER_SECRET_NAMES.providerExtensionCredentials,
  })
  if (!secret) return { version: 1, providers: {} }
  try {
    return storedCredentialsSchema.parse(JSON.parse(secret.value))
  } catch {
    throw new Error(
      'Saved provider extension credentials are invalid. Disconnect the provider, then connect it again.',
    )
  }
}

export async function readProviderExtensionCredentials(input: {
  providerId: string
  account: Readonly<Record<string, string>>
  fields: readonly SeoProviderConnectionField[]
  env?: NodeJS.ProcessEnv
}): Promise<Record<string, string>> {
  const providerId = providerExtensionIdSchema.parse(input.providerId)
  const stored = await readStored()
  const saved = stored.providers[providerId]?.[accountKey(input.account)] ?? {}
  const environment = input.env ?? process.env
  const legacyClicky =
    providerId === 'clicky' && input.account.siteId
      ? await readClickySiteKey(input.account.siteId, { env: environment })
      : undefined
  const credentials: Record<string, string> = {}
  for (const field of input.fields.filter((item) => item.kind === 'secret')) {
    const value =
      (field.envVar ? environment[field.envVar]?.trim() : undefined) ??
      saved[field.id] ??
      (field.id === 'sitekey' ? legacyClicky?.siteKey : undefined)
    if (value) credentials[field.id] = value
    else if (field.required !== false) {
      throw new Error(`${field.label} is not set for provider ${providerId}.`)
    }
  }
  return credentials
}

export async function writeProviderExtensionCredentials(input: {
  providerId: string
  account: Readonly<Record<string, string>>
  credentials: Readonly<Record<string, string>>
}): Promise<void> {
  const providerId = providerExtensionIdSchema.parse(input.providerId)
  const values = Object.fromEntries(
    Object.entries(input.credentials)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value),
  )
  if (Object.keys(values).length === 0) {
    throw new Error('Provider credentials cannot be empty.')
  }
  const stored = await readStored()
  stored.providers[providerId] = {
    ...stored.providers[providerId],
    [accountKey(input.account)]: values,
  }
  storedCredentialsSchema.parse(stored)
  await writeProviderSecret(
    PROVIDER_SECRET_NAMES.providerExtensionCredentials,
    JSON.stringify(stored),
  )
}

export async function deleteProviderExtensionCredentials(input: {
  providerId: string
  account: Readonly<Record<string, string>>
}): Promise<void> {
  const providerId = providerExtensionIdSchema.parse(input.providerId)
  const stored = await readStored()
  const accounts = stored.providers[providerId]
  if (!accounts) return
  delete accounts[accountKey(input.account)]
  if (Object.keys(accounts).length === 0) delete stored.providers[providerId]
  if (Object.keys(stored.providers).length === 0) {
    await deleteProviderSecret(
      PROVIDER_SECRET_NAMES.providerExtensionCredentials,
    )
    return
  }
  await writeProviderSecret(
    PROVIDER_SECRET_NAMES.providerExtensionCredentials,
    JSON.stringify(stored),
  )
}
