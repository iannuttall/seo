import { gunzipSync } from 'node:zlib'
import { load } from 'cheerio'
import { publicHttpFetch } from '../../fetch/http-client.js'

export type SitemapInvalidLoc = {
  sitemapUrl: string
  kind: 'url' | 'sitemap'
  value: string
}

export type SitemapLastmodObservation = {
  sitemapUrl: string
  kind: 'url' | 'sitemap'
  loc: string
  value: string
}

export type SitemapDocument = {
  url: string
  dataStatus: 'complete' | 'partial' | 'unavailable'
  status?: number
  contentType?: string
  compression: 'gzip' | 'none'
  bytes?: number
  uncompressedBytes?: number
  root?: 'urlset' | 'sitemapindex'
  warning?: string
}

export type SitemapFetchResult = {
  sitemapUrl: string
  dataStatus: 'complete' | 'partial'
  urls: string[]
  nestedSitemaps: string[]
  source: {
    sitemapsFetched: number
    urlLocs: number
    sitemapLocs: number
    duplicateUrlLocs: number
    duplicateSitemapLocs: number
    invalidLocs: {
      count: number
      samples: SitemapInvalidLoc[]
    }
    lastmods: {
      trust: 'unverified'
      observed: number
      parseable: number
      malformed: {
        count: number
        samples: SitemapLastmodObservation[]
      }
      future: {
        count: number
        samples: SitemapLastmodObservation[]
      }
    }
    documents: SitemapDocument[]
  }
  truncation: {
    possiblyTruncated: boolean
    urlLimitExceeded: boolean
    nestedSitemapLimitExceeded: boolean
    omittedUrlsAtLeast: number
    unprocessedSitemaps: number
    limits: {
      urls: number
      sitemaps: number
    }
  }
  warnings: string[]
}

export type BoundedSitemapInventory = {
  urls: string[]
  truncation: {
    possiblyTruncated: boolean
    sourceTruncated: boolean
    inventoryLimitExceeded: boolean
    omittedUrlsAtLeast: number
    limit: number
  }
}

const INVALID_LOC_SAMPLE_LIMIT = 10
const LASTMOD_SAMPLE_LIMIT = 10
const MAX_SITEMAP_BYTES = 52_428_800
const LASTMOD_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/

function normalizeUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim())
    return ['http:', 'https:'].includes(parsed.protocol)
      ? parsed.toString()
      : undefined
  } catch {
    return undefined
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return value
}

function parseSitemapLastmod(value: string): Date | undefined {
  const match = LASTMOD_PATTERN.exec(value)
  if (!match) return undefined

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    timeZone,
  ] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = hourText === undefined ? 0 : Number(hourText)
  const minute = minuteText === undefined ? 0 : Number(minuteText)
  const second = secondText === undefined ? 0 : Number(secondText)
  const daysInMonth =
    month === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31
  const offset = timeZone?.match(/^([+-])(\d{2}):(\d{2})$/)

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (offset && (Number(offset[2]) > 23 || Number(offset[3]) > 59))
  ) {
    return undefined
  }

  const parsed = hourText ? new Date(value) : new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b
}

function contentTypeLooksXml(
  contentType: string | undefined,
  compression: SitemapDocument['compression'],
): boolean {
  if (!contentType) return true
  const mime = contentType.split(';', 1)[0]?.trim().toLowerCase()
  return Boolean(
    mime &&
      (compression === 'gzip'
        ? mime === 'application/gzip' || mime === 'application/x-gzip'
        : mime === 'application/xml' ||
          mime === 'text/xml' ||
          mime.endsWith('+xml')),
  )
}

async function responseBytes(
  response: Awaited<ReturnType<typeof publicHttpFetch>>,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SITEMAP_BYTES) {
    throw new Error(
      `The response exceeds the ${MAX_SITEMAP_BYTES}-byte sitemap limit.`,
    )
  }

  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_SITEMAP_BYTES) {
        await reader.cancel()
        throw new Error(
          `The response exceeds the ${MAX_SITEMAP_BYTES}-byte sitemap limit.`,
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function xmlRoot(
  xml: string,
): { root: 'urlset' | 'sitemapindex' } | { error: string } {
  const tags: string[] = []
  let rootName: string | undefined
  let cursor = 0

  while (cursor < xml.length) {
    const start = xml.indexOf('<', cursor)
    if (start === -1) break
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start + 4)
      if (end === -1) return { error: 'an unclosed XML comment' }
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const end = xml.indexOf(']]>', start + 9)
      if (end === -1) return { error: 'an unclosed CDATA section' }
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<?', start)) {
      const end = xml.indexOf('?>', start + 2)
      if (end === -1) return { error: 'an unclosed processing instruction' }
      cursor = end + 2
      continue
    }

    let end = start + 1
    let quote: '"' | "'" | undefined
    while (end < xml.length) {
      const character = xml[end]
      if (quote) {
        if (character === quote) quote = undefined
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '>') {
        break
      }
      end += 1
    }
    if (end >= xml.length || quote) return { error: 'an unclosed XML tag' }

    const content = xml.slice(start + 1, end).trim()
    cursor = end + 1
    if (!content || content.startsWith('!')) continue
    if (content.startsWith('/')) {
      const name = content.slice(1).trim()
      const expected = tags.pop()
      if (!expected || name !== expected) {
        return { error: `a mismatched closing tag </${name}>` }
      }
      continue
    }

    const name = content.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/)
    if (!name?.[1]) return { error: 'an invalid XML tag name' }
    if (tags.length === 0) {
      if (rootName) return { error: 'more than one XML root element' }
      rootName = name[1]
    }
    const selfClosing = /\/$/.test(content)
    if (!selfClosing) tags.push(name[1])
  }

  if (tags.length > 0) {
    return { error: `an unclosed <${tags.at(-1)}> tag` }
  }
  if (rootName === 'urlset' || rootName === 'sitemapindex') {
    return { root: rootName }
  }
  return {
    error: `expected a <urlset> or <sitemapindex> root${rootName ? `, found <${rootName}>` : ''}`,
  }
}

async function fetchSitemapXml(sitemapUrl: string): Promise<{
  document: SitemapDocument
  xml?: string
}> {
  try {
    const response = await publicHttpFetch(sitemapUrl, { profile: 'browser' })
    const contentType = response.headers.get('content-type') ?? undefined
    if (!response.ok) {
      return {
        document: {
          url: sitemapUrl,
          dataStatus: 'unavailable',
          status: response.status,
          contentType,
          compression: 'none',
          warning: `Sitemap fetch failed for ${sitemapUrl}: HTTP ${response.status}.`,
        },
      }
    }

    let bytes: Uint8Array
    try {
      bytes = await responseBytes(response)
    } catch (error) {
      return {
        document: {
          url: sitemapUrl,
          dataStatus: 'partial',
          status: response.status,
          contentType,
          compression: 'none',
          warning: `Could not read sitemap data: ${error instanceof Error ? error.message : String(error)}`,
        },
      }
    }
    const compression = isGzip(bytes) ? 'gzip' : 'none'
    let xmlBytes = bytes
    if (compression === 'gzip') {
      try {
        xmlBytes = gunzipSync(bytes, { maxOutputLength: MAX_SITEMAP_BYTES })
      } catch (error) {
        return {
          document: {
            url: sitemapUrl,
            dataStatus: 'partial',
            status: response.status,
            contentType,
            compression,
            bytes: bytes.byteLength,
            warning: `Could not decompress sitemap gzip data: ${error instanceof Error ? error.message : String(error)}`,
          },
        }
      }
    }

    const xml = new TextDecoder().decode(xmlBytes)
    const validated = xmlRoot(xml)
    const contentTypeWarning = contentTypeLooksXml(contentType, compression)
      ? undefined
      : `Sitemap returned content type ${contentType ?? 'unknown'}, not an XML type.`
    if ('error' in validated) {
      return {
        document: {
          url: sitemapUrl,
          dataStatus: 'partial',
          status: response.status,
          contentType,
          compression,
          bytes: bytes.byteLength,
          uncompressedBytes: xmlBytes.byteLength,
          warning: `Sitemap XML is invalid: ${validated.error}.`,
        },
      }
    }
    return {
      document: {
        url: sitemapUrl,
        dataStatus: contentTypeWarning ? 'partial' : 'complete',
        status: response.status,
        contentType,
        compression,
        bytes: bytes.byteLength,
        uncompressedBytes: xmlBytes.byteLength,
        root: validated.root,
        ...(contentTypeWarning ? { warning: contentTypeWarning } : {}),
      },
      xml,
    }
  } catch (error) {
    return {
      document: {
        url: sitemapUrl,
        dataStatus: 'unavailable',
        compression: 'none',
        warning: `Sitemap fetch failed for ${sitemapUrl}: ${error instanceof Error ? error.message : String(error)}`,
      },
    }
  }
}

export function boundedSitemapInventory(
  results: Array<Pick<SitemapFetchResult, 'urls' | 'truncation'>>,
  limit: number,
): BoundedSitemapInventory {
  const inventoryLimit = positiveInteger(limit, 'limit')
  const uniqueUrls = [...new Set(results.flatMap((result) => result.urls))]
  const sourceTruncated = results.some(
    (result) => result.truncation.possiblyTruncated,
  )
  const inventoryLimitExceeded = uniqueUrls.length > inventoryLimit
  return {
    urls: uniqueUrls.slice(0, inventoryLimit),
    truncation: {
      possiblyTruncated: sourceTruncated || inventoryLimitExceeded,
      sourceTruncated,
      inventoryLimitExceeded,
      omittedUrlsAtLeast: Math.max(0, uniqueUrls.length - inventoryLimit),
      limit: inventoryLimit,
    },
  }
}

export async function fetchSitemapUrls(input: {
  sitemapUrl: string
  limit?: number
  maxNested?: number
}): Promise<SitemapFetchResult> {
  const warnings: string[] = []
  const urls: string[] = []
  const seenUrls = new Set<string>()
  const nestedSitemaps: string[] = []
  const discoveredSitemaps = new Set<string>()
  const scheduledSitemaps = new Set<string>()
  const invalidLocSamples: SitemapInvalidLoc[] = []
  const malformedLastmodSamples: SitemapLastmodObservation[] = []
  const futureLastmodSamples: SitemapLastmodObservation[] = []
  const documents: SitemapDocument[] = []
  const queue: string[] = []
  const limit = positiveInteger(input.limit ?? 50_000, 'limit')
  const maxNested = positiveInteger(input.maxNested ?? 50, 'maxNested')
  const rootSitemap = normalizeUrl(input.sitemapUrl)
  if (!rootSitemap) {
    throw new Error('sitemapUrl must be an absolute HTTP or HTTPS URL.')
  }
  scheduledSitemaps.add(rootSitemap)
  queue.push(rootSitemap)

  let sitemapsFetched = 0
  let urlLocs = 0
  let sitemapLocs = 0
  let duplicateUrlLocs = 0
  let duplicateSitemapLocs = 0
  let invalidLocCount = 0
  let lastmodsObserved = 0
  let parseableLastmods = 0
  let malformedLastmodCount = 0
  let futureLastmodCount = 0
  let omittedUrlsAtLeast = 0
  let urlLimitExceeded = false
  let nestedSitemapLimitExceeded = false

  function recordInvalidLoc(input: SitemapInvalidLoc) {
    invalidLocCount += 1
    if (invalidLocSamples.length < INVALID_LOC_SAMPLE_LIMIT) {
      invalidLocSamples.push(input)
    }
  }

  function recordLastmod(input: SitemapLastmodObservation) {
    lastmodsObserved += 1
    const parsed = parseSitemapLastmod(input.value)
    if (!parsed) {
      malformedLastmodCount += 1
      if (malformedLastmodSamples.length < LASTMOD_SAMPLE_LIMIT) {
        malformedLastmodSamples.push(input)
      }
      return
    }

    parseableLastmods += 1
    if (parsed.getTime() > Date.now()) {
      futureLastmodCount += 1
      if (futureLastmodSamples.length < LASTMOD_SAMPLE_LIMIT) {
        futureLastmodSamples.push(input)
      }
    }
  }

  while (queue.length) {
    const sitemapUrl = queue.shift()
    if (!sitemapUrl) continue

    const fetched = await fetchSitemapXml(sitemapUrl)
    documents.push(fetched.document)
    if (fetched.document.warning) warnings.push(fetched.document.warning)
    if (fetched.document.dataStatus !== 'unavailable') sitemapsFetched += 1
    if (!fetched.xml || !fetched.document.root) continue

    const $ = load(fetched.xml, { xmlMode: true })
    const urlEntrySelector =
      fetched.document.root === 'urlset' ? 'urlset > url' : ''
    $(urlEntrySelector).each((_, element) => {
      urlLocs += 1
      const entry = $(element)
      const value = entry.children('loc').first().text().trim()
      const lastmod = entry.children('lastmod').first()
      if (lastmod.length) {
        recordLastmod({
          sitemapUrl,
          kind: 'url',
          loc: value,
          value: lastmod.text().trim(),
        })
      }
      const url = normalizeUrl(value)
      if (!url) {
        recordInvalidLoc({ sitemapUrl, kind: 'url', value })
        return
      }
      if (seenUrls.has(url)) {
        duplicateUrlLocs += 1
        return
      }
      seenUrls.add(url)
      if (urls.length < limit) {
        urls.push(url)
        return
      }
      urlLimitExceeded = true
      omittedUrlsAtLeast += 1
    })

    const sitemapEntrySelector =
      fetched.document.root === 'sitemapindex' ? 'sitemapindex > sitemap' : ''
    $(sitemapEntrySelector).each((_, element) => {
      sitemapLocs += 1
      const entry = $(element)
      const value = entry.children('loc').first().text().trim()
      const lastmod = entry.children('lastmod').first()
      if (lastmod.length) {
        recordLastmod({
          sitemapUrl,
          kind: 'sitemap',
          loc: value,
          value: lastmod.text().trim(),
        })
      }
      const child = normalizeUrl(value)
      if (!child) {
        recordInvalidLoc({ sitemapUrl, kind: 'sitemap', value })
        return
      }
      if (discoveredSitemaps.has(child) || scheduledSitemaps.has(child)) {
        duplicateSitemapLocs += 1
        return
      }
      discoveredSitemaps.add(child)
      nestedSitemaps.push(child)
      if (scheduledSitemaps.size < maxNested) {
        scheduledSitemaps.add(child)
        queue.push(child)
      } else {
        nestedSitemapLimitExceeded = true
      }
    })
  }

  const unprocessedSitemaps = nestedSitemaps.filter(
    (sitemap) => !scheduledSitemaps.has(sitemap),
  ).length
  const possiblyTruncated =
    urlLimitExceeded || nestedSitemapLimitExceeded || unprocessedSitemaps > 0
  if (invalidLocCount) {
    warnings.push(
      `Ignored ${invalidLocCount} invalid sitemap <loc> ${invalidLocCount === 1 ? 'entry' : 'entries'}.`,
    )
  }
  if (possiblyTruncated) {
    warnings.push(
      'Sitemap discovery exceeded a configured URL or sitemap boundary; the returned inventory is incomplete.',
    )
  }

  return {
    sitemapUrl: rootSitemap,
    dataStatus:
      warnings.length || invalidLocCount || possiblyTruncated
        ? 'partial'
        : 'complete',
    urls,
    nestedSitemaps,
    source: {
      sitemapsFetched,
      urlLocs,
      sitemapLocs,
      duplicateUrlLocs,
      duplicateSitemapLocs,
      invalidLocs: {
        count: invalidLocCount,
        samples: invalidLocSamples,
      },
      lastmods: {
        trust: 'unverified',
        observed: lastmodsObserved,
        parseable: parseableLastmods,
        malformed: {
          count: malformedLastmodCount,
          samples: malformedLastmodSamples,
        },
        future: {
          count: futureLastmodCount,
          samples: futureLastmodSamples,
        },
      },
      documents,
    },
    truncation: {
      possiblyTruncated,
      urlLimitExceeded,
      nestedSitemapLimitExceeded,
      omittedUrlsAtLeast,
      unprocessedSitemaps,
      limits: {
        urls: limit,
        sitemaps: maxNested,
      },
    },
    warnings,
  }
}
