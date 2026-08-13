import type { AnalyticsConnection, AnalyticsProvider } from '../types.js'

export type AnalyticsProviderDetails = {
  label: string
  landingMetricLabel: 'sessions' | 'landing-page visits'
}

export const ANALYTICS_PROVIDER_IDS = [
  'google',
  'clicky',
] as const satisfies readonly AnalyticsProvider[]

const ANALYTICS_PROVIDER_DETAILS = {
  google: {
    label: 'Google Analytics',
    landingMetricLabel: 'sessions',
  },
  clicky: {
    label: 'Clicky',
    landingMetricLabel: 'landing-page visits',
  },
} as const satisfies Record<AnalyticsProvider, AnalyticsProviderDetails>

export function analyticsProviderDetails(
  provider: AnalyticsProvider | string,
): AnalyticsProviderDetails {
  if (provider in ANALYTICS_PROVIDER_DETAILS) {
    return ANALYTICS_PROVIDER_DETAILS[
      provider as keyof typeof ANALYTICS_PROVIDER_DETAILS
    ]
  }
  return {
    label: provider,
    landingMetricLabel: 'landing-page visits',
  }
}

export function analyticsConnectionProviderId(
  connection: AnalyticsConnection,
): string {
  return connection.provider === 'extension'
    ? connection.providerId
    : connection.provider
}

export function analyticsConnectionLabel(
  connection: AnalyticsConnection,
): string {
  const label = analyticsProviderDetails(
    analyticsConnectionProviderId(connection),
  ).label
  if (connection.provider === 'google') {
    return `${label} property ${connection.propertyId}`
  }
  if (connection.provider === 'clicky') {
    return `${label} site ${connection.siteId}`
  }
  return `${label} account`
}
