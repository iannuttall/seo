import {
  type AnalyticsConnection,
  normalizeClickySiteId,
  SeoError,
} from '@seo/core'
import { stringArg } from '../../args.js'

export const analyticsConnectionArgs = {
  'google-analytics-property': {
    type: 'string' as const,
    description:
      'Google Analytics property ID for landing-page sessions. Defaults from --project when saved.',
  },
  'clicky-site-id': {
    type: 'string' as const,
    description:
      'Clicky site ID for landing-page visits. Defaults from --project when saved.',
  },
}

export function analyticsConnectionFromArgs(
  args: Record<string, unknown>,
  fallback?: AnalyticsConnection,
): AnalyticsConnection | undefined {
  const googlePropertyId = stringArg(args['google-analytics-property'])
  const clickySiteId = stringArg(args['clicky-site-id'])
  if (googlePropertyId && clickySiteId) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass either --google-analytics-property or --clicky-site-id, not both.',
    )
  }
  if (googlePropertyId) {
    return { provider: 'google', propertyId: googlePropertyId }
  }
  if (clickySiteId) {
    return { provider: 'clicky', siteId: normalizeClickySiteId(clickySiteId) }
  }
  return fallback
}
