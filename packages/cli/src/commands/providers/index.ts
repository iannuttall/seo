import { defineCommand } from 'citty'
import { ahrefsProviderCommand } from './ahrefs.js'
import { dataForSeoProviderCommand } from './dataforseo.js'
import { providerExtensionCommands } from './extensions.js'

export const providersCommand = defineCommand({
  meta: { name: 'providers', description: 'Connect optional data providers' },
  subCommands: {
    ...providerExtensionCommands,
    ahrefs: ahrefsProviderCommand,
    dataforseo: dataForSeoProviderCommand,
  },
})
