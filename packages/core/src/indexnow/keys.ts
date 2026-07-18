import { randomBytes } from 'node:crypto'
import { SeoError } from '../errors.js'
import {
  deleteProviderSecret,
  readProviderSecret,
  writeProviderSecret,
} from '../storage/provider-secrets.js'
import {
  INDEXNOW_KEY_ENV,
  INDEXNOW_KEYS_SECRET,
  type IndexNowKey,
  type IndexNowKeySource,
} from './types.js'

type StoredIndexNowKeys = {
  version: 1
  sites: Record<string, IndexNowKey>
}

const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.includes(':')
  ) {
    return true
  }
  const octets = host.split('.').map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return false
  }
  const [first, second] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second !== undefined && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first !== undefined && first >= 224)
  )
}

export function parseIndexNowSite(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new SeoError('INVALID_INPUT', 'IndexNow site must be a valid URL.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new SeoError('INVALID_INPUT', 'IndexNow site must use HTTP or HTTPS.')
  }
  if (url.username || url.password) {
    throw new SeoError(
      'INVALID_INPUT',
      'IndexNow site URLs cannot contain credentials.',
    )
  }
  if (isPrivateHost(url.hostname)) {
    throw new SeoError('INVALID_INPUT', 'IndexNow requires a public site host.')
  }
  return url
}

export function validateIndexNowKey(value: string): string {
  const key = value.trim()
  if (!KEY_PATTERN.test(key)) {
    throw new SeoError(
      'INVALID_INPUT',
      'IndexNow keys must contain 8 to 128 letters, numbers, or hyphens.',
    )
  }
  return key
}

export function createIndexNowKey(): string {
  return randomBytes(16).toString('hex')
}

export function createIndexNowKeyRecord(input: {
  site: string
  key?: string
  keyLocation?: string
  now?: Date
}): IndexNowKey {
  const site = parseIndexNowSite(input.site)
  const key = validateIndexNowKey(input.key ?? createIndexNowKey())
  const keyLocation = input.keyLocation
    ? parseIndexNowSite(input.keyLocation)
    : new URL(`/${key}.txt`, site.origin)
  if (keyLocation.hostname.toLowerCase() !== site.hostname.toLowerCase()) {
    throw new SeoError(
      'INVALID_INPUT',
      'IndexNow key location must use the same host as the site.',
    )
  }
  return {
    host: site.hostname.toLowerCase(),
    key,
    keyLocation: keyLocation.toString(),
    createdAt: (input.now ?? new Date()).toISOString(),
  }
}

export function validateIndexNowKeyRecord(record: IndexNowKey): IndexNowKey {
  const createdAt = new Date(record.createdAt)
  if (Number.isNaN(createdAt.getTime())) {
    throw new SeoError(
      'INVALID_INPUT',
      'IndexNow key record has an invalid creation date.',
    )
  }
  const normalized = createIndexNowKeyRecord({
    site: record.keyLocation,
    key: record.key,
    keyLocation: record.keyLocation,
    now: createdAt,
  })
  if (normalized.host !== record.host.toLowerCase()) {
    throw new SeoError(
      'INVALID_INPUT',
      'IndexNow key record host does not match its key location.',
    )
  }
  return normalized
}

function emptyKeys(): StoredIndexNowKeys {
  return { version: 1, sites: {} }
}

function parseSavedKeys(value: string): StoredIndexNowKeys {
  try {
    const parsed = JSON.parse(value) as Partial<StoredIndexNowKeys>
    if (
      parsed.version !== 1 ||
      !parsed.sites ||
      typeof parsed.sites !== 'object' ||
      Array.isArray(parsed.sites)
    ) {
      throw new Error('invalid shape')
    }
    const sites: Record<string, IndexNowKey> = {}
    for (const [host, value] of Object.entries(parsed.sites)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('invalid key record')
      }
      const record = validateIndexNowKeyRecord(value as IndexNowKey)
      if (record.host !== host) throw new Error('invalid host mapping')
      sites[host] = record
    }
    return { version: 1, sites }
  } catch {
    throw new SeoError(
      'AUTH_REQUIRED',
      'Saved IndexNow keys are invalid. Run `seo indexnow setup` again.',
    )
  }
}

async function readSavedKeys(): Promise<{
  keys: StoredIndexNowKeys
  source?: Exclude<IndexNowKeySource, 'environment'>
}> {
  const saved = await readProviderSecret({ name: INDEXNOW_KEYS_SECRET })
  if (!saved) return { keys: emptyKeys() }
  return {
    keys: parseSavedKeys(saved.value),
    source: saved.source as Exclude<IndexNowKeySource, 'environment'>,
  }
}

export async function saveIndexNowKey(
  record: IndexNowKey,
): Promise<Exclude<IndexNowKeySource, 'environment'>> {
  const normalized = validateIndexNowKeyRecord(record)
  const { keys } = await readSavedKeys()
  keys.sites[normalized.host] = normalized
  return writeProviderSecret(INDEXNOW_KEYS_SECRET, JSON.stringify(keys))
}

export async function resolveIndexNowKey(input: {
  site: string
  env?: NodeJS.ProcessEnv
}): Promise<{ record: IndexNowKey; source: IndexNowKeySource }> {
  const site = parseIndexNowSite(input.site)
  const environmentKey = (input.env ?? process.env)[INDEXNOW_KEY_ENV]?.trim()
  if (environmentKey) {
    return {
      record: createIndexNowKeyRecord({
        site: site.origin,
        key: environmentKey,
      }),
      source: 'environment',
    }
  }
  const { keys, source } = await readSavedKeys()
  const record = keys.sites[site.hostname.toLowerCase()]
  if (!record || !source) {
    throw new SeoError(
      'AUTH_REQUIRED',
      `IndexNow is not set up for ${site.hostname}. Run \`seo indexnow setup --site ${site.origin} --output <public-directory>\`, or set SEO_INDEXNOW_KEY for this process.`,
    )
  }
  return { record: validateIndexNowKeyRecord(record), source }
}

export async function listIndexNowKeys(): Promise<
  Array<Omit<IndexNowKey, 'key'>>
> {
  const { keys } = await readSavedKeys()
  return Object.values(keys.sites)
    .map(({ key: _key, ...record }) => record)
    .sort((a, b) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0))
}

export async function removeIndexNowKey(siteValue: string): Promise<boolean> {
  const site = parseIndexNowSite(siteValue)
  const { keys } = await readSavedKeys()
  const host = site.hostname.toLowerCase()
  if (!keys.sites[host]) return false
  delete keys.sites[host]
  if (Object.keys(keys.sites).length === 0) {
    await deleteProviderSecret(INDEXNOW_KEYS_SECRET)
  } else {
    await writeProviderSecret(INDEXNOW_KEYS_SECRET, JSON.stringify(keys))
  }
  return true
}
