import type { DataForSeoClient } from './client.js'

export type LinkResearchClient = Pick<
  DataForSeoClient,
  'linkSummary' | 'backlinks' | 'referringDomains'
>
