export type PseoTemplateCluster = {
  id: string
  signature: string
  shape: PseoTemplateShape
  urlCount: number
  share: number
  sampleUrls: string[]
}

export type PseoTemplateShape = {
  depth: number
  staticSegments: Array<{
    index: number
    value: string
  }>
  variableSegments: Array<{
    index: number
    placeholder: string
    distinctValues: number
    examples: string[]
    tokenExamples: string[]
  }>
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function parsePseoPath(url: string): string[] {
  try {
    return new URL(url).pathname.split('/').filter(Boolean)
  } catch {
    return url.split('?')[0]?.split('/').filter(Boolean) ?? []
  }
}

function placeholder(segment: string): string | undefined {
  if (/^\d+$/.test(segment)) return ':num'
  if (UUID_RE.test(segment)) return ':id'
  if (DATE_RE.test(segment)) return ':date'
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(segment)) return ':slug'
  if (segment.length >= 12 && /^[a-z0-9]+$/i.test(segment)) return ':slug'
  return undefined
}

export function inferPseoTemplate(url: string): string {
  const parts = parsePseoPath(url)
  if (!parts.length) return '/'

  const normalized = parts.map((part, index) => {
    const token = placeholder(part)
    if (token) {
      if (index === 0 && token === ':slug') return part.toLowerCase()
      return token
    }
    return part.toLowerCase()
  })

  return `/${normalized.join('/')}`
}

function broadTemplate(url: string): string {
  const parts = parsePseoPath(url)
  if (!parts.length) return '/'
  const [first, ...rest] = parts
  if (!first) return '/'
  if (!rest.length) return `/${placeholder(first) ?? first.toLowerCase()}`
  return `/${first.toLowerCase()}/${rest
    .map((part) => placeholder(part) ?? ':value')
    .join('/')}`
}

function valueTokens(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    for (const token of value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((item) => item.length > 2 && !/^\d+$/.test(item))) {
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([token]) => token)
}

function templateShape(signature: string, urls: string[]): PseoTemplateShape {
  const signatureParts = signature.split('/').filter(Boolean)
  const pathRows = urls.map(parsePseoPath)
  const depth = Math.max(
    signatureParts.length,
    ...pathRows.map((row) => row.length),
  )
  const staticSegments: PseoTemplateShape['staticSegments'] = []
  const variableSegments: PseoTemplateShape['variableSegments'] = []

  for (let index = 0; index < depth; index += 1) {
    const signaturePart = signatureParts[index] ?? ':missing'
    const values = pathRows
      .map((row) => row[index]?.toLowerCase())
      .filter((value): value is string => Boolean(value))
    const distinctValues = [...new Set(values)]
    const isVariable =
      signaturePart.startsWith(':') || distinctValues.length > 1

    if (isVariable) {
      variableSegments.push({
        index,
        placeholder: signaturePart.startsWith(':') ? signaturePart : ':value',
        distinctValues: distinctValues.length,
        examples: distinctValues.slice(0, 5),
        tokenExamples: valueTokens(distinctValues),
      })
    } else if (signaturePart) {
      staticSegments.push({
        index,
        value: signaturePart,
      })
    }
  }

  return {
    depth,
    staticSegments,
    variableSegments,
  }
}

export function templateForUrl(
  url: string,
  clusters: Array<{ signature: string }>,
): string {
  const primary = inferPseoTemplate(url)
  if (clusters.some((cluster) => cluster.signature === primary)) return primary
  const broad = broadTemplate(url)
  if (clusters.some((cluster) => cluster.signature === broad)) return broad
  return primary
}

function collectClusters(urls: string[], signatures: Map<string, string>) {
  const bySignature = new Map<string, string[]>()
  for (const url of urls) {
    const signature = signatures.get(url)
    if (!signature) continue
    const existing = bySignature.get(signature) ?? []
    existing.push(url)
    bySignature.set(signature, existing)
  }
  return bySignature
}

export function clusterPseoTemplates(
  urls: string[],
  opts: { minUrls?: number; minShare?: number; limit?: number } = {},
): PseoTemplateCluster[] {
  const uniqueUrls = [...new Set(urls)]
  const minUrls = opts.minUrls ?? 3
  const minShare = opts.minShare ?? 0.01
  const primarySignatures = new Map(
    uniqueUrls.map((url) => [url, inferPseoTemplate(url)]),
  )
  const primary = collectClusters(uniqueUrls, primarySignatures)
  const primaryQualifiers = new Set(
    [...primary.entries()]
      .filter(
        ([, clusterUrls]) =>
          clusterUrls.length >= minUrls &&
          clusterUrls.length / uniqueUrls.length >= minShare,
      )
      .map(([signature]) => signature),
  )

  const finalSignatures = new Map<string, string>()
  for (const url of uniqueUrls) {
    const primarySignature = primarySignatures.get(url) ?? '/'
    finalSignatures.set(
      url,
      primaryQualifiers.has(primarySignature)
        ? primarySignature
        : broadTemplate(url),
    )
  }

  return [...collectClusters(uniqueUrls, finalSignatures).entries()]
    .map(([signature, clusterUrls]) => ({
      id: signature,
      signature,
      shape: templateShape(signature, clusterUrls),
      urlCount: clusterUrls.length,
      share: uniqueUrls.length ? clusterUrls.length / uniqueUrls.length : 0,
      sampleUrls: clusterUrls.slice(0, 5),
    }))
    .filter(
      (cluster) =>
        cluster.urlCount >= minUrls ||
        cluster.share >= Math.min(minShare, 0.05),
    )
    .sort(
      (a, b) =>
        b.urlCount - a.urlCount || a.signature.localeCompare(b.signature),
    )
    .slice(0, opts.limit ?? 50)
}
