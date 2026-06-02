import { listSites } from '../../gsc/client.js'
import { fetchSitemapUrls } from './sitemaps.js'

export type IndexPlanProperty = {
  property: string
  urlCount: number
  dailyLimit: number
  cycleDays: number
  sampleUrls: string[]
}

export type IndexPlanSuggestion = {
  property: string
  urlCount: number
  currentProperty: string
  estimatedCycleDays: number
  sampleUrls: string[]
  reason: string
}

export type IndexCoveragePlan = {
  site: string
  generatedAt: string
  summary: {
    sitemapUrls: number
    urlCount: number
    properties: number
    dailyCapacity: number
    estimatedCycleDays: number
    targetCycleDays: number
    suggestedProperties: number
  }
  properties: IndexPlanProperty[]
  suggestions: IndexPlanSuggestion[]
  warnings: string[]
}

export type IndexPropertyUrlAllocation = {
  property: string
  urls: string[]
}

export type IndexCoveragePlanInput = {
  site: string
  urls: string[]
  sitemaps?: string[]
  accountProperties: string[]
  dailyLimit?: number
  targetCycleDays?: number
  suggestionLimit?: number
  warnings?: string[]
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function originFromSite(site: string): string | undefined {
  if (site.startsWith('sc-domain:')) return undefined
  const parsed = parseUrl(site)
  return parsed ? parsed.origin : undefined
}

function domainFromSite(site: string): string {
  if (site.startsWith('sc-domain:')) return site.slice('sc-domain:'.length)
  return parseUrl(site)?.hostname ?? site
}

function propertyMatchesUrl(property: string, url: string): boolean {
  if (property.startsWith('sc-domain:')) {
    const domain = property.slice('sc-domain:'.length)
    const host = parseUrl(url)?.hostname ?? ''
    return host === domain || host.endsWith(`.${domain}`)
  }
  return url.startsWith(property)
}

function mostSpecificProperty(url: string, properties: string[]): string {
  const matching = properties
    .filter((property) => propertyMatchesUrl(property, url))
    .sort((a, b) => b.length - a.length)
  return matching[0] ?? properties[0] ?? ''
}

function relevantPropertiesForSite(
  site: string,
  accountProperties: string[],
): string[] {
  const domain = domainFromSite(site)
  const relevantProperties = accountProperties.filter((property) =>
    property.startsWith('sc-domain:')
      ? property.slice('sc-domain:'.length) === domain
      : property.includes(domain),
  )
  return relevantProperties.length
    ? relevantProperties
    : [site, ...accountProperties]
}

export function allocateIndexUrlsToProperties(input: {
  site: string
  urls: string[]
  accountProperties: string[]
}): IndexPropertyUrlAllocation[] {
  const urls = [...new Set(input.urls)]
  const properties = relevantPropertiesForSite(
    input.site,
    input.accountProperties,
  )
  const urlsByProperty = new Map<string, string[]>()
  for (const url of urls) {
    const property = mostSpecificProperty(url, properties)
    const existing = urlsByProperty.get(property) ?? []
    existing.push(url)
    urlsByProperty.set(property, existing)
  }

  return [...urlsByProperty.entries()]
    .map(([property, propertyUrls]) => ({
      property,
      urls: propertyUrls,
    }))
    .sort((a, b) => b.urls.length - a.urls.length)
}

function cycleDays(urlCount: number, dailyLimit: number): number {
  if (urlCount <= 0) return 0
  return Math.ceil(urlCount / dailyLimit)
}

function subdirectoryProperty(url: string): string | undefined {
  const parsed = parseUrl(url)
  if (!parsed) return undefined
  const firstSegment = parsed.pathname.split('/').filter(Boolean)[0]
  if (!firstSegment) return undefined
  return `${parsed.origin}/${firstSegment}/`
}

function propertyOrigin(
  property: string,
  fallbackSite: string,
): string | undefined {
  return originFromSite(property) ?? originFromSite(fallbackSite)
}

function suggestedProperties(input: {
  properties: IndexPlanProperty[]
  urlsByProperty: Map<string, string[]>
  existingProperties: string[]
  site: string
  dailyLimit: number
  targetCycleDays: number
  limit: number
}): IndexPlanSuggestion[] {
  const suggestions: IndexPlanSuggestion[] = []
  const maxUrlsPerBucket = input.dailyLimit * input.targetCycleDays

  for (const property of input.properties) {
    if (property.urlCount <= maxUrlsPerBucket) continue
    const urls = input.urlsByProperty.get(property.property) ?? []
    const byDirectory = new Map<string, string[]>()

    for (const url of urls) {
      const suggested = subdirectoryProperty(url)
      if (!suggested) continue
      if (input.existingProperties.some((item) => item === suggested)) continue
      const propertyOriginUrl = propertyOrigin(property.property, input.site)
      if (propertyOriginUrl && !suggested.startsWith(propertyOriginUrl))
        continue

      const existing = byDirectory.get(suggested) ?? []
      existing.push(url)
      byDirectory.set(suggested, existing)
    }

    for (const [suggested, directoryUrls] of [...byDirectory.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      if (directoryUrls.length < Math.min(100, maxUrlsPerBucket)) continue
      suggestions.push({
        property: suggested,
        urlCount: directoryUrls.length,
        currentProperty: property.property,
        estimatedCycleDays: cycleDays(directoryUrls.length, input.dailyLimit),
        sampleUrls: directoryUrls.slice(0, 3),
        reason: `${directoryUrls.length} URLs share this folder. A URL-prefix property would give it a separate daily inspection bucket.`,
      })
      if (suggestions.length >= input.limit) return suggestions
    }
  }

  return suggestions
}

export async function indexCoveragePlan(input: {
  site: string
  sitemaps: string[]
  properties?: string[]
  dailyLimit?: number
  targetCycleDays?: number
  maxUrls?: number
  suggestionLimit?: number
  refresh?: boolean
}): Promise<IndexCoveragePlan> {
  const maxUrls = input.maxUrls ?? 50_000
  const warnings: string[] = []
  const sitemapResults = await Promise.all(
    input.sitemaps.map((sitemapUrl) =>
      fetchSitemapUrls({ sitemapUrl, limit: maxUrls }),
    ),
  )
  const urls = [
    ...new Set(sitemapResults.flatMap((result) => result.urls)),
  ].slice(0, maxUrls)
  warnings.push(...sitemapResults.flatMap((result) => result.warnings))

  const accountProperties: string[] = input.properties
    ? [...input.properties]
    : await listSites(input.refresh).then((sites) =>
        sites.map((site) => site.siteUrl),
      )

  return planIndexCoverageFromUrls({
    site: input.site,
    urls,
    sitemaps: input.sitemaps ?? [],
    accountProperties,
    dailyLimit: input.dailyLimit,
    targetCycleDays: input.targetCycleDays,
    suggestionLimit: input.suggestionLimit,
    warnings,
  })
}

export function planIndexCoverageFromUrls(
  input: IndexCoveragePlanInput,
): IndexCoveragePlan {
  const dailyLimit = input.dailyLimit ?? 2_000
  const targetCycleDays = input.targetCycleDays ?? 1
  const urls = [...new Set(input.urls)]
  const allocations = allocateIndexUrlsToProperties({
    site: input.site,
    urls,
    accountProperties: input.accountProperties,
  })
  const urlsByProperty = new Map(
    allocations.map((allocation) => [allocation.property, allocation.urls]),
  )

  const propertyPlans = allocations
    .map((allocation) => ({
      property: allocation.property,
      urlCount: allocation.urls.length,
      dailyLimit,
      cycleDays: cycleDays(allocation.urls.length, dailyLimit),
      sampleUrls: allocation.urls.slice(0, 3),
    }))
    .sort((a, b) => b.urlCount - a.urlCount)

  const dailyCapacity = propertyPlans.length * dailyLimit
  const estimatedCycleDays = cycleDays(urls.length, dailyCapacity || dailyLimit)
  const suggestions = suggestedProperties({
    properties: propertyPlans,
    urlsByProperty,
    existingProperties: input.accountProperties,
    site: input.site,
    dailyLimit,
    targetCycleDays,
    limit: input.suggestionLimit ?? 10,
  })

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    summary: {
      sitemapUrls: input.sitemaps?.length ?? 0,
      urlCount: urls.length,
      properties: propertyPlans.length,
      dailyCapacity,
      estimatedCycleDays,
      targetCycleDays,
      suggestedProperties: suggestions.length,
    },
    properties: propertyPlans,
    suggestions,
    warnings: input.warnings ?? [],
  }
}
