import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { OAuthClientConfig } from '../gsc/auth.js'
import { SHARED_OAUTH_CLIENT } from '../gsc/shared-client.generated.js'
import {
  deleteTokens,
  readConfig,
  readOauthClient,
  readTokens,
  writeTokens,
} from '../storage/config.js'
import type { StoredTokens } from '../types.js'

export interface CredentialsProvider {
  getGoogleOAuthClient(): OAuthClientConfig | undefined
  readGoogleTokens(): Promise<StoredTokens | undefined>
  writeGoogleTokens(tokens: StoredTokens): Promise<void>
  deleteGoogleTokens(): Promise<void>
}

export interface StorageAdapter {
  get<T = unknown>(key: string): Promise<T | undefined>
  put<T = unknown>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
}

export class LocalCredentialsProvider implements CredentialsProvider {
  getGoogleOAuthClient(): OAuthClientConfig | undefined {
    const byo = readOauthClient()
    if (byo) {
      return {
        clientId: byo.clientId,
        clientSecret: byo.clientSecret,
        source: 'byo',
      }
    }

    const config = readConfig()
    const clientId =
      process.env.SEO_GOOGLE_CLIENT_ID ??
      SHARED_OAUTH_CLIENT.clientId ??
      config.auth.sharedClientId
    const clientSecret =
      process.env.SEO_GOOGLE_CLIENT_SECRET ??
      SHARED_OAUTH_CLIENT.clientSecret ??
      config.auth.sharedClientSecret
    if (!clientId || !clientSecret) {
      return undefined
    }

    return { clientId, clientSecret, source: 'shared' }
  }

  readGoogleTokens(): Promise<StoredTokens | undefined> {
    return readTokens()
  }

  writeGoogleTokens(tokens: StoredTokens): Promise<void> {
    return writeTokens(tokens)
  }

  deleteGoogleTokens(): Promise<void> {
    return deleteTokens()
  }
}

export class JsonFileStorageAdapter implements StorageAdapter {
  constructor(private readonly filePath: string) {}

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const data = await this.readAll()
    return data[key] as T | undefined
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    const data = await this.readAll()
    data[key] = value
    await this.writeAll(data)
  }

  async delete(key: string): Promise<void> {
    const data = await this.readAll()
    delete data[key]
    await this.writeAll(data)
  }

  private async readAll(): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as Record<
        string,
        unknown
      >
    } catch {
      return {}
    }
  }

  private async writeAll(data: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const tmpPath = `${this.filePath}.tmp`
    await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, {
      mode: 0o600,
    })
    await rename(tmpPath, this.filePath)
    await rm(tmpPath, { force: true })
  }
}

export const localCredentialsProvider = new LocalCredentialsProvider()
