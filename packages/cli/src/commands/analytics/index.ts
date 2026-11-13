import { defineCommand } from 'citty'
import { clickyAnalyticsCommand } from './clicky/index.js'
import { googleAnalyticsCommand } from './google/index.js'
import { simpleAnalyticsCommand } from './simple-analytics/index.js'

export const analyticsCommand = defineCommand({
  meta: {
    name: 'analytics',
    description: 'Read analytics data from connected providers',
  },
  subCommands: {
    clicky: clickyAnalyticsCommand,
    google: googleAnalyticsCommand,
    'simple-analytics': simpleAnalyticsCommand,
  },
})
