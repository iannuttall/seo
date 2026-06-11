import { defineCommand } from 'citty'
import { clientSetupCommand } from '../setup/index.js'
import { clientBrandCommand } from './brand.js'
import { clientProfileCommands } from './profiles.js'

export const clientCommand = defineCommand({
  meta: {
    name: 'client',
    description: 'Manage saved project profiles',
  },
  subCommands: {
    setup: clientSetupCommand,
    brand: clientBrandCommand,
    ...clientProfileCommands,
  },
})

export const projectCommand = defineCommand({
  ...clientCommand,
  meta: {
    name: 'projects',
    description: 'Manage saved project profiles',
  },
})
