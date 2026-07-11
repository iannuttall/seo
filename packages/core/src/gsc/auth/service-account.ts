import { sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { SeoError } from '../../errors.js'
import {
  GOOGLE_READONLY_SCOPES,
  type GoogleAccessTokenClient,
} from './types.js'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const TOKEN_BUFFER_MS = 60_000

type ServiceAccountSource =
  | 'environment-json'
  | 'environment-file'
  | 'application-default-file'

export type ServiceAccountConfig = {
  clientEmail: string
  privateKey: string
  privateKeyId?: string
  source: ServiceAccountSource
}

export type ServiceAccountStatus = {
  configured: boolean
  identity?: string
  source?: ServiceAccountSource
  error?: string
}

type Environment = Record<string, string | undefined>

function authConfigError(message: string): SeoError {
  return new SeoError('AUTH_CONFIG_REQUIRED', message)
}

function sourceLabel(source: ServiceAccountSource): string {
  if (source === 'environment-json') return 'SEO_GOOGLE_SERVICE_ACCOUNT_JSON'
  if (source === 'environment-file') return 'SEO_GOOGLE_SERVICE_ACCOUNT_FILE'
  return 'GOOGLE_APPLICATION_CREDENTIALS'
}

function configuredEntries(environment: Environment): Array<{
  source: ServiceAccountSource
  value: string
}> {
  const entries: Array<{ source: ServiceAccountSource; value: string }> = []
  const raw = environment.SEO_GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (raw) entries.push({ source: 'environment-json', value: raw })

  const file = environment.SEO_GOOGLE_SERVICE_ACCOUNT_FILE?.trim()
  if (file) entries.push({ source: 'environment-file', value: file })

  const applicationDefault = environment.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  if (applicationDefault) {
    entries.push({
      source: 'application-default-file',
      value: applicationDefault,
    })
  }
  return entries
}

function parseServiceAccount(
  raw: string,
  source: ServiceAccountSource,
): ServiceAccountConfig {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw authConfigError(
      sourceLabel(source) +
        ' must contain a valid service account JSON object.',
    )
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw authConfigError(
      sourceLabel(source) + ' must contain a service account JSON object.',
    )
  }

  const record = value as Record<string, unknown>
  if (record.type !== undefined && record.type !== 'service_account') {
    throw authConfigError(
      sourceLabel(source) +
        ' must contain a Google service account credential.',
    )
  }
  if (
    typeof record.client_email !== 'string' ||
    !record.client_email ||
    typeof record.private_key !== 'string' ||
    !record.private_key
  ) {
    throw authConfigError(
      sourceLabel(source) +
        ' must include service account client_email and private_key fields.',
    )
  }
  if (
    record.private_key_id !== undefined &&
    typeof record.private_key_id !== 'string'
  ) {
    throw authConfigError(
      sourceLabel(source) + ' has an invalid service account private_key_id.',
    )
  }

  return {
    clientEmail: record.client_email,
    privateKey: record.private_key,
    privateKeyId: record.private_key_id,
    source,
  }
}

function readServiceAccountFile(
  path: string,
  source: ServiceAccountSource,
): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    throw authConfigError(
      'Could not read the service account file named by ' +
        sourceLabel(source) +
        '.',
    )
  }
}

export function getServiceAccountConfig(
  environment: Environment = process.env,
): ServiceAccountConfig | undefined {
  const entries = configuredEntries(environment)
  if (!entries.length) return undefined
  if (entries.length > 1) {
    throw authConfigError(
      'Set only one service account credential source: SEO_GOOGLE_SERVICE_ACCOUNT_JSON, SEO_GOOGLE_SERVICE_ACCOUNT_FILE, or GOOGLE_APPLICATION_CREDENTIALS.',
    )
  }

  const entry = entries[0]
  if (!entry) return undefined
  const raw =
    entry.source === 'environment-json'
      ? entry.value
      : readServiceAccountFile(entry.value, entry.source)
  return parseServiceAccount(raw, entry.source)
}

export function getServiceAccountStatus(
  environment: Environment = process.env,
): ServiceAccountStatus {
  try {
    const config = getServiceAccountConfig(environment)
    if (!config) return { configured: false }
    return {
      configured: true,
      identity: config.clientEmail,
      source: config.source,
    }
  } catch (error) {
    const entries = configuredEntries(environment)
    return {
      configured: false,
      ...(entries.length === 1 && entries[0]
        ? { source: entries[0].source }
        : {}),
      error:
        error instanceof Error
          ? error.message
          : 'Service account credentials are invalid.',
    }
  }
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function signedAssertion(config: ServiceAccountConfig, now: number): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    ...(config.privateKeyId ? { kid: config.privateKeyId } : {}),
  }
  const payload = {
    iss: config.clientEmail,
    scope: GOOGLE_READONLY_SCOPES.join(' '),
    aud: GOOGLE_TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3_600,
  }
  const unsigned =
    base64Url(JSON.stringify(header)) + '.' + base64Url(JSON.stringify(payload))
  try {
    return (
      unsigned +
      '.' +
      sign('RSA-SHA256', Buffer.from(unsigned), config.privateKey).toString(
        'base64url',
      )
    )
  } catch {
    throw authConfigError(
      'The service account private key could not sign a Google access request.',
    )
  }
}

async function requestServiceAccountToken(
  config: ServiceAccountConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const assertion = signedAssertion(config, Math.floor(Date.now() / 1_000))
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: unknown }
      | undefined
    const reason =
      typeof payload?.error === 'string' ? ' (' + payload.error + ')' : ''
    if (
      response.status === 400 ||
      response.status === 401 ||
      response.status === 403
    ) {
      throw authConfigError(
        'Google rejected the service account access request with ' +
          response.status +
          reason +
          '. Check the service account, private key, and system clock.',
      )
    }
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'Google token service is unavailable (' +
        response.status +
        '). Try again later.',
    )
  }

  const payload = (await response.json()) as {
    access_token?: unknown
    expires_in?: unknown
  }
  if (
    typeof payload.access_token !== 'string' ||
    !payload.access_token ||
    typeof payload.expires_in !== 'number' ||
    !Number.isFinite(payload.expires_in) ||
    payload.expires_in <= 0
  ) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'Google token service returned an invalid service account response.',
    )
  }
  return { accessToken: payload.access_token, expiresIn: payload.expires_in }
}

export class ServiceAccountAccessTokenClient
  implements GoogleAccessTokenClient
{
  private token?: { value: string; expiresAt: number }

  constructor(
    readonly config: ServiceAccountConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - Date.now() >= TOKEN_BUFFER_MS) {
      return this.token.value
    }
    const token = await requestServiceAccountToken(this.config, this.fetchImpl)
    this.token = {
      value: token.accessToken,
      expiresAt: Date.now() + token.expiresIn * 1_000,
    }
    return this.token.value
  }
}
