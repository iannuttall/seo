import { z } from 'zod'
import { ProviderError } from '../providers/errors.js'
import {
  deleteProviderSecret,
  PROVIDER_SECRET_NAMES,
  type ProviderSecretSource,
  readProviderSecret,
  writeProviderSecret,
} from '../storage/provider-secrets.js'

export const CLICKY_SITEKEY_ENV = 'SEO_CLICKY_SITEKEY'
export const CLICKY_SITE_KEYS_SECRET = PROVIDER_SECRET_NAMES.clickySiteKeys

const storedSiteKeysSchema = z
  .object({
    version: z.literal(1),
    siteKeys: z.record(z.string(), z.string()),
  })
  .strict()

export type StoredClickySiteKey = {
  siteKey: string
  source: ProviderSecretSource
}

function configurationError(message: string): ProviderError {
  return new ProviderError({
    provider: 'clicky',
    operation: 'credentials',
    code: 'configuration',
    message,
  })
}

export function normalizeClickySiteId(value: string): string {
  const siteId = value.trim()
  if (!/^\d{1,30}$/u.test(siteId)) {
    throw configurationError('Clicky needs a numeric site ID.')
  }
  return siteId
}

export function normalizeClickySiteKey(value: string): string {
  const siteKey = value.trim()
  if (!/^[A-Za-z0-9]{12,64}$/u.test(siteKey)) {
    throw configurationError('Clicky needs a valid sitekey.')
  }
  return siteKey
}

function parseStoredSiteKeys(value: string): Record<string, string> {
  try {
    const parsed = storedSiteKeysSchema.parse(JSON.parse(value))
    return Object.fromEntries(
      Object.entries(parsed.siteKeys).map(([siteId, siteKey]) => [
        normalizeClickySiteId(siteId),
        normalizeClickySiteKey(siteKey),
      ]),
    )
  } catch (error) {
    if (error instanceof ProviderError) throw error
    throw configurationError(
      'Saved Clicky credentials are invalid. Disconnect Clicky, then connect it again.',
    )
  }
}

async function storedSiteKeys(): Promise<{
  siteKeys: Record<string, string>
  source?: Exclude<ProviderSecretSource, 'environment'>
}> {
  const credential = await readProviderSecret({ name: CLICKY_SITE_KEYS_SECRET })
  if (!credential) return { siteKeys: {} }
  if (credential.source === 'environment') {
    throw configurationError('Saved Clicky credentials could not be read.')
  }
  return {
    siteKeys: parseStoredSiteKeys(credential.value),
    source: credential.source,
  }
}

export async function readClickySiteKey(
  siteIdValue: string,
  input: { env?: NodeJS.ProcessEnv } = {},
): Promise<StoredClickySiteKey | undefined> {
  const siteId = normalizeClickySiteId(siteIdValue)
  const environment = input.env ?? process.env
  const environmentKey = environment[CLICKY_SITEKEY_ENV]?.trim()
  if (environmentKey) {
    return {
      siteKey: normalizeClickySiteKey(environmentKey),
      source: 'environment',
    }
  }
  const stored = await storedSiteKeys()
  const siteKey = stored.siteKeys[siteId]
  return siteKey && stored.source
    ? { siteKey, source: stored.source }
    : undefined
}

export async function writeClickySiteKey(
  siteIdValue: string,
  siteKeyValue: string,
): Promise<Exclude<ProviderSecretSource, 'environment'>> {
  const siteId = normalizeClickySiteId(siteIdValue)
  const siteKey = normalizeClickySiteKey(siteKeyValue)
  const stored = await storedSiteKeys()
  return writeProviderSecret(
    CLICKY_SITE_KEYS_SECRET,
    JSON.stringify({
      version: 1,
      siteKeys: { ...stored.siteKeys, [siteId]: siteKey },
    }),
  )
}

export async function deleteClickySiteKey(siteIdValue: string): Promise<void> {
  const siteId = normalizeClickySiteId(siteIdValue)
  const stored = await storedSiteKeys()
  if (!(siteId in stored.siteKeys)) return
  delete stored.siteKeys[siteId]
  if (Object.keys(stored.siteKeys).length === 0) {
    await deleteProviderSecret(CLICKY_SITE_KEYS_SECRET)
    return
  }
  await writeProviderSecret(
    CLICKY_SITE_KEYS_SECRET,
    JSON.stringify({ version: 1, siteKeys: stored.siteKeys }),
  )
}
