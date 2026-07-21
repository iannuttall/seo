import { defineCommand } from 'citty'
import { bingProviderCommand } from './bing.js'
import { dataForSeoProviderCommand } from './dataforseo.js'

export const providersCommand = defineCommand({
  meta: { name: 'providers', description: 'Connect optional data providers' },
  subCommands: {
    bing: bingProviderCommand,
    dataforseo: dataForSeoProviderCommand,
  },
})
