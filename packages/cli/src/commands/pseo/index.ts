import { defineCommand } from 'citty'
import { pseoAuditCommand } from './audit.js'

export const pseoCommand = defineCommand({
  meta: {
    name: 'pseo',
    description:
      'Programmatic SEO audits that cluster URL patterns and sample template pages',
  },
  subCommands: {
    audit: pseoAuditCommand,
  },
})
