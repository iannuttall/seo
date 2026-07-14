import type { AgentRouteManifest, AgentRouteManifestEntry } from './manifest.js'

export interface LlmsTxtRouteItem {
  label?: string
  path: string
}

export interface LlmsTxtExternalItem {
  description: string
  label: string
  url: string
}

export interface LlmsTxtSection {
  heading: string
  items: readonly (LlmsTxtRouteItem | LlmsTxtExternalItem)[]
}

export interface LlmsTxtConfig {
  sections: readonly LlmsTxtSection[]
  summary: string
  title: string
}

function isExternalItem(
  item: LlmsTxtRouteItem | LlmsTxtExternalItem,
): item is LlmsTxtExternalItem {
  return 'url' in item
}

function cleanTitle(value: string): string {
  return value.replace(/\s+\|\s+[^|]+$/u, '').trim()
}

function routeItem(
  item: LlmsTxtRouteItem,
  pages: ReadonlyMap<string, AgentRouteManifestEntry>,
  site: URL,
): string {
  const page = pages.get(item.path)
  if (!page)
    throw new Error(`llms.txt route is not in the manifest: ${item.path}`)
  if (page.noindex) {
    throw new Error(`llms.txt route must be indexable: ${item.path}`)
  }
  const label = item.label?.trim() || cleanTitle(page.title)
  return `- [${label}](${new URL(page.markdownPath, site)}): ${page.description}`
}

function externalItem(item: LlmsTxtExternalItem, site: URL): string {
  const url = new URL(item.url, site)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`llms.txt link must use HTTP or HTTPS: ${item.url}`)
  }
  return `- [${item.label}](${url}): ${item.description}`
}

export function renderLlmsTxt(
  manifest: AgentRouteManifest,
  config: LlmsTxtConfig,
): string {
  if (!config.title.trim() || !config.summary.trim()) {
    throw new Error('llms.txt requires a title and summary')
  }
  const site = new URL(manifest.site)
  const pages = new Map(manifest.pages.map((page) => [page.htmlPath, page]))
  const seen = new Set<string>()
  const sections = config.sections.map((section) => {
    if (!section.heading.trim() || section.items.length === 0) {
      throw new Error(
        'llms.txt sections require a heading and at least one item',
      )
    }
    const items = section.items.map((item) => {
      const key = isExternalItem(item)
        ? new URL(item.url, site).toString()
        : item.path
      if (seen.has(key)) throw new Error(`Duplicate llms.txt item: ${key}`)
      seen.add(key)
      return isExternalItem(item)
        ? externalItem(item, site)
        : routeItem(item, pages, site)
    })
    return `## ${section.heading}\n\n${items.join('\n')}`
  })

  return `# ${config.title.trim()}\n\n> ${config.summary.trim()}\n\n${sections.join('\n\n')}\n`
}
