import { readConfig, writeConfig } from '../storage/config.js'
import { providerExtensionIdSchema } from './contracts.js'

export function readProviderExtensionAccount(
  providerIdValue: string,
): Record<string, string> {
  const providerId = providerExtensionIdSchema.parse(providerIdValue)
  return { ...(readConfig().providers.connections?.[providerId] ?? {}) }
}

export function writeProviderExtensionAccount(
  providerIdValue: string,
  account: Readonly<Record<string, string>>,
): Record<string, string> {
  const providerId = providerExtensionIdSchema.parse(providerIdValue)
  const config = readConfig()
  const normalized = Object.fromEntries(
    Object.entries(account)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value),
  )
  writeConfig({
    ...config,
    providers: {
      ...config.providers,
      connections: {
        ...config.providers.connections,
        [providerId]: normalized,
      },
    },
  })
  return normalized
}

export function deleteProviderExtensionAccount(providerIdValue: string): void {
  const providerId = providerExtensionIdSchema.parse(providerIdValue)
  const config = readConfig()
  const connections = { ...config.providers.connections }
  delete connections[providerId]
  writeConfig({
    ...config,
    providers: {
      ...config.providers,
      connections,
    },
  })
}
