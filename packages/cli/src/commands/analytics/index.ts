import { defineCommand } from 'citty'
import { googleAnalyticsCommand } from './google/index.js'

export const analyticsCommand = defineCommand({
  meta: {
    name: 'analytics',
    description: 'Read analytics data from connected providers',
  },
  subCommands: {
    google: googleAnalyticsCommand,
  },
})
