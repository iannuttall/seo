import type { Ask, Faq } from './integrations'
import { pairs as dataforseo } from './pairs/dataforseo'
import { pairs as googleAnalytics } from './pairs/google-analytics'
import { pairs as googleSearchConsole } from './pairs/google-search-console'

// Copy written for one source in one client, so the page is not the shared
// template with the client name swapped. Keyed by `${source.id}/${client.id}`.
export type PairPage = {
  description: string
  lead: string
  asks: Ask[]
  sections: { title: string; paragraphs: string[] }[]
  faq: Faq[]
}

export const pairPages: Record<string, PairPage> = {
  ...googleSearchConsole,
  ...googleAnalytics,
  ...dataforseo,
}
