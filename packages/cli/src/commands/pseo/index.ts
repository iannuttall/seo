import { defineCommand } from 'citty'
import { pseoAuditCommand } from './audit.js'

export const pseoCommand = defineCommand({
  meta: {
    name: 'pseo',
    description: 'Programmatic SEO template audits and monitoring',
  },
  subCommands: {
    audit: pseoAuditCommand,
  },
})
