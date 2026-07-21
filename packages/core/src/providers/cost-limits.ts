import { readConfig, writeConfig } from '../storage/config.js'
import type { ProviderId } from './contracts.js'

export type ProviderSpendLimits = {
  dailyNoticeMicros: number
  dailyHardLimitMicros: number | null
  monthlyHardLimitMicros: number | null
  maxRequestsPerReport: number
  maxRowsPerReport: number
}

export const DEFAULT_PROVIDER_SPEND_LIMITS: ProviderSpendLimits = {
  dailyNoticeMicros: 5_000_000,
  dailyHardLimitMicros: null,
  monthlyHardLimitMicros: null,
  maxRequestsPerReport: 20,
  maxRowsPerReport: 10_000,
}

export function getProviderSpendLimits(
  provider: ProviderId,
): ProviderSpendLimits {
  const overrides = readConfig().providers.costLimits?.[provider]
  return { ...DEFAULT_PROVIDER_SPEND_LIMITS, ...overrides }
}

export function setProviderSpendLimits(
  provider: ProviderId,
  limits: ProviderSpendLimits,
): ProviderSpendLimits {
  const config = readConfig()
  const parsed = {
    ...DEFAULT_PROVIDER_SPEND_LIMITS,
    ...limits,
  }
  writeConfig({
    ...config,
    providers: {
      ...config.providers,
      costLimits: {
        ...config.providers.costLimits,
        [provider]: parsed,
      },
    },
  })
  return getProviderSpendLimits(provider)
}
