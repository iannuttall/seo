import { defineCommand } from 'citty'
import { ahrefsProviderCommand } from './ahrefs.js'
import { bingProviderCommand } from './bing.js'
import { dataForSeoProviderCommand } from './dataforseo.js'
import { semrushProviderCommand } from './semrush.js'

export const providersCommand = defineCommand({
  meta: { name: 'providers', description: 'Connect optional data providers' },
  subCommands: {
    ahrefs: ahrefsProviderCommand,
    bing: bingProviderCommand,
    dataforseo: dataForSeoProviderCommand,
    semrush: semrushProviderCommand,
  },
})
