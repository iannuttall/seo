import type {
  PageFetchDiagnostics,
  QueryContentClassification,
} from '@seo/core'
import { resolveClientSelection } from '../selection.js'

export async function selectedSiteOrThrow(
  input: {
    client?: string
    project?: string
    site?: string
  },
  options: { json?: boolean; refresh?: boolean } = {},
): Promise<string> {
  return (
    await resolveClientSelection({
      client: input.client,
      project: input.project,
      site: input.site,
      options,
    })
  ).site
}

export function startUrlForSite(site: string): string | undefined {
  if (site.startsWith('http://') || site.startsWith('https://')) return site
  if (site.startsWith('sc-domain:')) return `https://${site.slice(10)}/`
  return undefined
}

export function suggestedClientName(site: string): string {
  return site.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '')
}

export function slugId(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function formatFetchDiagnostics(
  diagnostics?: PageFetchDiagnostics,
): string {
  if (!diagnostics) return '-'
  if (diagnostics.backpressure?.status === 'stopped') {
    return `stopped: ${diagnostics.backpressure.reason ?? 'origin cooldown'}`
  }
  if (diagnostics.backpressure?.status === 'slowed') {
    return `slowed ${diagnostics.backpressure.delayMs}ms`
  }
  if (diagnostics.blocked) return 'blocked'
  if (diagnostics.rendered) return 'rendered'
  if (diagnostics.cache === 'hit') return 'cached'
  if (diagnostics.fetched) return 'fetched'
  return diagnostics.source
}

export function formatContentCheck(
  classification?: QueryContentClassification,
): string {
  if (!classification) return '-'
  if (classification === 'serp-framing') return 'wording gap'
  if (classification === 'content-gap') return 'content gap'
  if (classification === 'technical-check') return 'technical check'
  return 'covered'
}
