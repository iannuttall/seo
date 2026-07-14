import { createHash } from 'node:crypto'

export interface AgentRouteManifestEntry {
  bytes: number
  canonical: string
  description: string
  htmlFile: string
  htmlPath: string
  language: string
  markdownFile: string
  markdownPath: string
  noindex: boolean
  sha256: string
  title: string
  tokens: number
}

export interface AgentRouteManifest {
  pages: AgentRouteManifestEntry[]
  site: string
  version: 1
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function renderAgentRouteManifest(
  site: string,
  pages: readonly AgentRouteManifestEntry[],
): string {
  const manifest: AgentRouteManifest = {
    version: 1,
    site,
    pages: [...pages].sort((left, right) =>
      left.htmlPath.localeCompare(right.htmlPath, 'en-US'),
    ),
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}
