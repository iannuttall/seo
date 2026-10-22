import { SEO_CRAWLER_USER_AGENT } from '../fetch/crawler-identity.js'
import { assertUrlMatchesGscProperty } from '../gsc/property-url.js'
import { originOf } from './shared.js'

// The page URLs a site's sitemaps list, for the URLs `seo index` inspects.
// Sitemaps come from robots.txt, else /sitemap.xml. Sitemap indexes are
// followed. Every limit is set before the first request. Pure JavaScript,
// so the CLI and the hosted MCP read sitemaps the same way.

const MAX_FILES = 20
const MAX_URLS = 50_000
const MAX_BYTES = 20_000_000
const TIMEOUT_MS = 10_000

export type SitemapUrls = {
  // Page URLs inside the property, in sitemap order, without duplicates.
  urls: string[]
  // Sitemap files read.
  files: number
  // True when a limit or a failed file means some URLs may be missing.
  partial: boolean
  // Why it is partial, or why no sitemap was read.
  notes: string[]
}

async function boundedBytes(
  body: ReadableStream<Uint8Array> | null,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function get(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': SEO_CRAWLER_USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`answered ${response.status}`)
  }
  let bytes = await boundedBytes(response.body)
  // A .gz sitemap, or a gzip body sent without its content-encoding.
  if (bytes && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = await boundedBytes(
      new Response(bytes).body?.pipeThrough(new DecompressionStream('gzip')) ??
        null,
    )
  }
  if (!bytes) throw new Error(`is larger than ${MAX_BYTES} bytes`)
  return new TextDecoder().decode(bytes)
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function locs(xml: string): string[] {
  return [
    ...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/gi),
  ].map((match) =>
    (match[1] ?? '')
      .trim()
      .replace(
        /&(amp|lt|gt|quot|apos);/g,
        (_, name: string) => ENTITIES[name] ?? '',
      ),
  )
}

const inside = (site: string, url: string) => {
  try {
    return assertUrlMatchesGscProperty(site, url)
  } catch {
    return null
  }
}

export async function sitemapUrls(site: string): Promise<SitemapUrls> {
  const origin = new URL(originOf(site)).origin
  const notes: string[] = []
  const robots = await get(`${origin}/robots.txt`).catch(() => '')
  const declared = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)]
    .map((match) => match[1] ?? '')
    .filter(Boolean)
  const queue = declared.length ? declared : [`${origin}/sitemap.xml`]
  const seenFiles = new Set<string>()
  const urls = new Set<string>()
  let files = 0
  let partial = false
  while (queue.length) {
    const file = queue.shift() as string
    if (seenFiles.has(file)) continue
    seenFiles.add(file)
    if (files >= MAX_FILES) {
      partial = true
      notes.push(`stopped at ${MAX_FILES} sitemap files`)
      break
    }
    files += 1
    let xml: string
    try {
      xml = await get(file)
    } catch (error) {
      if (!declared.length && files === 1) {
        notes.push(
          `robots.txt names no sitemap and ${file} ${error instanceof Error ? error.message : 'could not be read'}`,
        )
        continue
      }
      partial = true
      notes.push(
        `${file} ${error instanceof Error ? error.message : 'could not be read'}`,
      )
      continue
    }
    if (/<sitemapindex[\s>]/i.test(xml)) {
      queue.push(...locs(xml))
      continue
    }
    for (const loc of locs(xml)) {
      const url = inside(site, loc)
      if (!url) continue
      if (urls.size >= MAX_URLS) {
        partial = true
        notes.push(`stopped at ${MAX_URLS.toLocaleString('en-US')} URLs`)
        queue.length = 0
        break
      }
      urls.add(url)
    }
  }
  return { urls: [...urls], files, partial, notes: [...new Set(notes)] }
}
