import {
  deleteProviderSecret,
  type ProviderSecretSource,
  readProviderSecret,
  writeProviderSecret,
} from '../storage/provider-secrets.js'
import type { ProviderId } from './contracts.js'
import { ProviderError } from './errors.js'

export function createApiKeyCredentialStore(input: {
  provider: ProviderId
  environmentVariable: string
  secretName: string
  invalidMessage: string
}) {
  const normalize = (value: string): string => {
    const apiKey = value.trim()
    if (!apiKey || apiKey.length > 4_096) {
      throw new ProviderError({
        provider: input.provider,
        operation: 'credentials',
        code: 'configuration',
        message: input.invalidMessage,
      })
    }
    return apiKey
  }

  return {
    async write(
      value: string,
    ): Promise<Exclude<ProviderSecretSource, 'environment'>> {
      return writeProviderSecret(input.secretName, normalize(value))
    },
    async read(
      options: { env?: NodeJS.ProcessEnv } = {},
    ): Promise<{ apiKey: string; source: ProviderSecretSource } | undefined> {
      const credential = await readProviderSecret({
        name: input.secretName,
        envVar: input.environmentVariable,
        env: options.env,
      })
      return credential
        ? {
            apiKey: normalize(credential.value),
            source: credential.source,
          }
        : undefined
    },
    async remove(): Promise<void> {
      await deleteProviderSecret(input.secretName)
    },
  }
}
