import { z } from 'zod'
import { readConfig, writeConfig } from '../../storage/config.js'
import {
  deleteProviderSecret,
  type ProviderSecretSource,
  readProviderSecret,
  writeProviderSecret,
} from '../../storage/provider-secrets.js'
import { ProviderError } from '../errors.js'

export const DATAFORSEO_LOGIN_ENV = 'SEO_DATAFORSEO_LOGIN'
export const DATAFORSEO_PASSWORD_ENV = 'SEO_DATAFORSEO_PASSWORD'
export const DATAFORSEO_CREDENTIAL_SECRET = 'dataforseo-credentials'

const dataForSeoCredentialsSchema = z
  .object({
    version: z.literal(1),
    login: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(2048),
  })
  .strict()

export type DataForSeoCredentials = {
  login: string
  password: string
}

export type StoredDataForSeoCredentials = DataForSeoCredentials & {
  source: ProviderSecretSource
  migrated: boolean
}

function configurationError(message: string): ProviderError {
  return new ProviderError({
    provider: 'dataforseo',
    operation: 'credentials',
    code: 'configuration',
    message,
  })
}

function normalizeCredentials(
  credentials: DataForSeoCredentials,
): DataForSeoCredentials {
  const parsed = dataForSeoCredentialsSchema.safeParse({
    version: 1,
    login: credentials.login,
    password: credentials.password,
  })
  if (!parsed.success) {
    throw configurationError(
      'DataForSEO credentials need both an API login and API password.',
    )
  }
  return { login: parsed.data.login, password: parsed.data.password }
}

function clearLegacyConfigCredentials(): boolean {
  const config = readConfig()
  if (
    !config.providers.dataForSeoLogin &&
    !config.providers.dataForSeoPassword
  ) {
    return false
  }
  writeConfig({
    ...config,
    providers: {
      ...config.providers,
      dataForSeoLogin: undefined,
      dataForSeoPassword: undefined,
    },
  })
  return true
}

function environmentCredentials(
  env: NodeJS.ProcessEnv,
): DataForSeoCredentials | undefined {
  const login = env[DATAFORSEO_LOGIN_ENV]?.trim()
  const password = env[DATAFORSEO_PASSWORD_ENV]
  if (!login && !password) return undefined
  if (!login || !password) {
    throw configurationError(
      `Set both ${DATAFORSEO_LOGIN_ENV} and ${DATAFORSEO_PASSWORD_ENV}.`,
    )
  }
  return normalizeCredentials({ login, password })
}

function decodeStoredCredentials(value: string): DataForSeoCredentials {
  let raw: unknown
  try {
    raw = JSON.parse(value)
  } catch {
    throw configurationError(
      'Saved DataForSEO credentials are invalid. Run `seo providers dataforseo disconnect`, then connect again.',
    )
  }
  const parsed = dataForSeoCredentialsSchema.safeParse(raw)
  if (!parsed.success) {
    throw configurationError(
      'Saved DataForSEO credentials are invalid. Run `seo providers dataforseo disconnect`, then connect again.',
    )
  }
  return { login: parsed.data.login, password: parsed.data.password }
}

export async function writeDataForSeoCredentials(
  credentials: DataForSeoCredentials,
): Promise<Exclude<ProviderSecretSource, 'environment'>> {
  const normalized = normalizeCredentials(credentials)
  const source = await writeProviderSecret(
    DATAFORSEO_CREDENTIAL_SECRET,
    JSON.stringify({ version: 1, ...normalized }),
  )
  clearLegacyConfigCredentials()
  return source
}

async function migrateLegacyCredentials(): Promise<
  StoredDataForSeoCredentials | undefined
> {
  const config = readConfig()
  const login = config.providers.dataForSeoLogin
  const password = config.providers.dataForSeoPassword
  if (!login && !password) return undefined
  if (!login || !password) {
    throw configurationError(
      'Legacy DataForSEO config contains only part of the credential pair. Run `seo providers dataforseo disconnect`, then connect again.',
    )
  }
  const credentials = normalizeCredentials({ login, password })
  const source = await writeDataForSeoCredentials(credentials)
  return { ...credentials, source, migrated: true }
}

export async function readDataForSeoCredentials(
  input: { env?: NodeJS.ProcessEnv } = {},
): Promise<StoredDataForSeoCredentials | undefined> {
  const fromEnvironment = environmentCredentials(input.env ?? process.env)
  if (fromEnvironment) {
    return {
      ...fromEnvironment,
      source: 'environment',
      migrated: false,
    }
  }

  const stored = await readProviderSecret({
    name: DATAFORSEO_CREDENTIAL_SECRET,
  })
  if (stored) {
    const credentials = decodeStoredCredentials(stored.value)
    const migrated = clearLegacyConfigCredentials()
    return { ...credentials, source: stored.source, migrated }
  }

  return migrateLegacyCredentials()
}

export async function deleteDataForSeoCredentials(): Promise<void> {
  await deleteProviderSecret(DATAFORSEO_CREDENTIAL_SECRET)
  clearLegacyConfigCredentials()
}
