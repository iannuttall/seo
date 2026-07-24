import { defineCommand } from 'citty'
import { bingProviderCommand } from './bing.js'
import { dataForSeoProviderCommand } from './dataforseo.js'
import { semrushProviderCommand } from './semrush.js'

export const providersCommand = defineCommand({
  meta: { name: 'providers', description: 'Connect optional data providers' },
  subCommands: {
    bing: bingProviderCommand,
    dataforseo: dataForSeoProviderCommand,
    semrush: semrushProviderCommand,
  },
})
