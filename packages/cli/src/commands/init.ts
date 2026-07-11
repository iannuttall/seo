import { defineCommand } from 'citty'
import { startCommand } from './setup/index.js'

/**
 * Kept for existing scripts. New users should start with `seo start`.
 *
 * Do not let this become a second onboarding flow. A person should see the
 * same calm Google, project-profile, and MCP setup whichever entry they use.
 */
export const initCommand = defineCommand({
  ...startCommand,
  meta: {
    name: 'init',
    description: 'Legacy alias for `seo start`.',
  },
})
