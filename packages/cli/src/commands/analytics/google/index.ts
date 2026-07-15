import { defineCommand } from 'citty'
import { googleAnalyticsPropertiesCommand } from './properties.js'
import { googleAnalyticsReportCommand } from './report.js'

export const googleAnalyticsCommand = defineCommand({
  meta: {
    name: 'google',
    description: 'Read Google Analytics properties and reports',
  },
  subCommands: {
    properties: googleAnalyticsPropertiesCommand,
    report: googleAnalyticsReportCommand,
  },
})
