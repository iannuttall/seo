import { SaxesParser, type SaxesTagNS } from 'saxes'
import {
  isBrowserRequestFromSameSite,
  parseSitemapUrl,
  type SitemapFetcher,
} from './sitemap.ts'
import {
  type CrawlBudget,
  decodedChunks,
  ExtractorFetchError,
  ExtractorLimitError,
  fetchPublicResponse,
  SITEMAP_EXTRACTOR_LIMITS,
} from './sitemap-extractor-network.ts'

export { SITEMAP_EXTRACTOR_LIMITS } from './sitemap-extractor-network.ts'

export type SitemapExtractedUrl = {
  url: string
  sourceSitemap: string
  depth: number
  lastmod?: string
  changefreq?: string
  priority?: string
  hreflang: string[]
  hreflangCount: number
  imageCount: number
  videoCount: number
  newsCount: number
}

export type SitemapExtractorEvent =
  | {
      type: 'meta'
      schema: 1
      requestedUrl: string
      maximumUrls: number
      limits: typeof SITEMAP_EXTRACTOR_LIMITS
    }
  | ({ type: 'url' } & SitemapExtractedUrl)
  | {
      type: 'sitemap'
      url: string
      depth: number
      kind: 'urlset' | 'sitemapindex' | 'text'
      urlEntries: number
      childSitemaps: number
      countCapped: boolean
      overRecommendedSize: boolean
    }
  | {
      type: 'warning'
      code:
        | 'large-sitemap'
        | 'fetch-failed'
        | 'invalid-child'
        | 'limit-reached'
        | 'no-sitemap-found'
      severity: 'advice' | 'warning'
      message: string
      sitemapUrl?: string
    }
  | {
      type: 'complete'
      dataStatus: 'complete' | 'partial'
      urlsReturned: number
      duplicateUrls: number
      invalidUrls: number
      sitemapsFetched: number
      sitemapsFailed: number
      largeSitemaps: number
      downloadedBytes: number
      expandedBytes: number
      elapsedMilliseconds: number
      truncation: {
        sitemapLimitExceeded: boolean
        urlLimitExceeded: boolean
        outputLimitExceeded: boolean
        timeLimitExceeded: boolean
      }
    }
  | {
      type: 'error'
      message: string
    }

type WaitUntil = (promise: Promise<unknown>) => void

type QueueItem = {
  url: URL
  depth: number
  fallback?: boolean
}

type UrlEntry = Omit<SitemapExtractedUrl, 'sourceSitemap' | 'depth'>

type ParsedDocument = {
  kind: 'urlset' | 'sitemapindex' | 'text'
  urlEntries: number
  childSitemaps: number
  countCapped: boolean
}

type ExtractState = {
  maximumUrls: number
  seenUrls: Set<string>
  urlsReturned: number
  urlCharacters: number
  duplicateUrls: number
  invalidUrls: number
  sitemapsFetched: number
  sitemapsFailed: number
  largeSitemaps: number
  sitemapLimitExceeded: boolean
  urlLimitExceeded: boolean
  outputLimitExceeded: boolean
  timeLimitExceeded: boolean
  stopped: boolean
}

const NDJSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/x-ndjson; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-accel-buffering': 'no',
  'x-content-type-options': 'nosniff',
}

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

const COMMON_SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/wp-sitemap.xml',
] as const

class ExtractorInputError extends Error {}

function jsonResponse(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: JSON_HEADERS })
}

async function readBoundedRequest(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declared) &&
    declared > SITEMAP_EXTRACTOR_LIMITS.bodyBytes
  ) {
    throw new ExtractorInputError('The request is too large.')
  }
  if (!request.body) throw new ExtractorInputError('Send a JSON request.')

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > SITEMAP_EXTRACTOR_LIMITS.bodyBytes) {
        await reader.cancel()
        throw new ExtractorInputError('The request is too large.')
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }

  try {
    return JSON.parse(text + decoder.decode())
  } catch {
    throw new ExtractorInputError('Send a valid JSON request.')
  }
}

function parseInputUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ExtractorInputError('Enter a public sitemap URL or domain.')
  }
  const trimmed = value.trim()
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    return parseSitemapUrl(withProtocol)
  } catch {
    throw new ExtractorInputError('Enter a public HTTPS sitemap URL or domain.')
  }
}

function parseMaximumUrls(value: unknown): number {
  if (value === undefined) return 10_000
  if (![10_000, 25_000, 50_000].includes(Number(value))) {
    throw new ExtractorInputError(
      'Choose a maximum of 10,000, 25,000, or 50,000 URLs.',
    )
  }
  return Number(value)
}

function attribute(tag: SaxesTagNS, localName: string): string | undefined {
  const wanted = localName.toLowerCase()
  for (const value of Object.values(tag.attributes)) {
    if (value.local.toLowerCase() === wanted) return value.value
  }
  return undefined
}

function normalizePageUrl(value: string): string | undefined {
  if (value.length > 2_048) return undefined
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    if (url.username || url.password) return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function emptyEntry(): UrlEntry {
  return {
    url: '',
    hreflang: [],
    hreflangCount: 0,
    imageCount: 0,
    videoCount: 0,
    newsCount: 0,
  }
}

async function parseXmlDocument(
  chunks: AsyncIterable<string>,
  onUrl: (entry: UrlEntry) => Promise<boolean>,
  onChild: (url: string) => void,
): Promise<ParsedDocument> {
  let kind: ParsedDocument['kind'] | undefined
  let currentUrl: UrlEntry | undefined
  let currentChild: { url: string } | undefined
  let capture:
    | { name: 'loc' | 'lastmod' | 'changefreq' | 'priority'; text: string }
    | undefined
  let parseError: Error | undefined
  let urlEntries = 0
  let childSitemaps = 0
  let countCapped = false
  let stopped = false
  const stack: string[] = []
  const pendingUrls: UrlEntry[] = []
  const pendingChildren: string[] = []
  const parser = new SaxesParser({ xmlns: true, position: false })

  parser.on('doctype', () => {
    parseError = new Error('Document types are not supported.')
  })
  parser.on('error', (error) => {
    parseError = error
  })
  parser.on('opentag', (tag) => {
    if (parseError || stopped) return
    const local = tag.local.toLowerCase()
    const parent = stack.at(-1)
    if (stack.length === 0) {
      if (local === 'urlset') kind = 'urlset'
      else if (local === 'sitemapindex') kind = 'sitemapindex'
      else parseError = new Error('The XML root is not a sitemap.')
    } else if (parent === 'urlset' && local === 'url') {
      currentUrl = emptyEntry()
    } else if (parent === 'sitemapindex' && local === 'sitemap') {
      currentChild = { url: '' }
    } else if (
      (parent === 'url' || parent === 'sitemap') &&
      ['loc', 'lastmod', 'changefreq', 'priority'].includes(local)
    ) {
      capture = {
        name: local as 'loc' | 'lastmod' | 'changefreq' | 'priority',
        text: '',
      }
    }

    if (currentUrl) {
      if (
        local === 'link' &&
        attribute(tag, 'rel')?.toLowerCase() === 'alternate'
      ) {
        const language = attribute(tag, 'hreflang')?.trim()
        if (language) {
          currentUrl.hreflangCount += 1
          if (
            currentUrl.hreflang.length <
              SITEMAP_EXTRACTOR_LIMITS.hreflangValuesPerUrl &&
            !currentUrl.hreflang.includes(language)
          ) {
            currentUrl.hreflang.push(language)
          }
        }
      }
      if (tag.prefix.toLowerCase() === 'image' && local === 'image') {
        currentUrl.imageCount += 1
      } else if (tag.prefix.toLowerCase() === 'video' && local === 'video') {
        currentUrl.videoCount += 1
      } else if (tag.prefix.toLowerCase() === 'news' && local === 'news') {
        currentUrl.newsCount += 1
      }
    }
    stack.push(local)
  })
  const appendText = (text: string) => {
    if (capture && capture.text.length <= 4_096) capture.text += text
  }
  parser.on('text', appendText)
  parser.on('cdata', appendText)
  parser.on('closetag', (tag) => {
    if (parseError || stopped) return
    const local = tag.local.toLowerCase()
    if (capture?.name === local) {
      const value = capture.text.trim()
      if (currentUrl) {
        if (capture.name === 'loc') currentUrl.url = value
        else currentUrl[capture.name] = value || undefined
      } else if (currentChild && capture.name === 'loc') {
        currentChild.url = value
      }
      capture = undefined
    }
    if (local === 'url' && currentUrl) {
      urlEntries += 1
      pendingUrls.push(currentUrl)
      currentUrl = undefined
    } else if (local === 'sitemap' && currentChild) {
      childSitemaps += 1
      if (currentChild.url) pendingChildren.push(currentChild.url)
      currentChild = undefined
    }
    stack.pop()
  })

  async function flushPending(): Promise<void> {
    for (const child of pendingChildren.splice(0)) onChild(child)
    for (const entry of pendingUrls.splice(0)) {
      if (!(await onUrl(entry))) {
        stopped = true
        countCapped = true
        break
      }
    }
  }

  for await (const chunk of chunks) {
    for (let offset = 0; offset < chunk.length; offset += 32_768) {
      parser.write(chunk.slice(offset, offset + 32_768))
      if (parseError) throw new ExtractorFetchError(parseError.message)
      await flushPending()
      if (stopped) break
    }
    if (stopped) break
  }
  if (!stopped) {
    parser.close()
    if (parseError) throw new ExtractorFetchError(parseError.message)
    await flushPending()
  }
  if (!kind)
    throw new ExtractorFetchError('The response is not a sitemap XML document.')
  return { kind, urlEntries, childSitemaps, countCapped }
}

async function parseTextDocument(
  chunks: AsyncIterable<string>,
  onUrl: (entry: UrlEntry) => Promise<boolean>,
): Promise<ParsedDocument> {
  let remainder = ''
  let urlEntries = 0
  let countCapped = false
  for await (const chunk of chunks) {
    const lines = `${remainder}${chunk}`.split(/\r?\n/u)
    remainder = lines.pop() ?? ''
    for (const line of lines) {
      const value = line.trim()
      if (!value) continue
      urlEntries += 1
      const entry = emptyEntry()
      entry.url = value
      if (!(await onUrl(entry))) {
        countCapped = true
        return { kind: 'text', urlEntries, childSitemaps: 0, countCapped }
      }
    }
  }
  if (remainder.trim()) {
    urlEntries += 1
    const entry = emptyEntry()
    entry.url = remainder.trim()
    if (!(await onUrl(entry))) countCapped = true
  }
  return { kind: 'text', urlEntries, childSitemaps: 0, countCapped }
}

async function parseDocument(
  body: ReadableStream<Uint8Array>,
  budget: CrawlBudget,
  onUrl: (entry: UrlEntry) => Promise<boolean>,
  onChild: (url: string) => void,
): Promise<ParsedDocument> {
  const iterator = decodedChunks(body, budget)[Symbol.asyncIterator]()
  const initial: string[] = []
  let probe = ''
  while (probe.length < 4_096 && !probe.replace(/^\uFEFF/u, '').trim()) {
    const chunk = await iterator.next()
    if (chunk.done) break
    initial.push(chunk.value)
    probe += chunk.value
  }

  async function* allChunks(): AsyncGenerator<string> {
    yield* initial
    while (true) {
      const chunk = await iterator.next()
      if (chunk.done) break
      yield chunk.value
    }
  }

  const firstCharacter = probe
    .replace(/^\uFEFF/u, '')
    .trimStart()
    .charAt(0)
  if (!firstCharacter) {
    throw new ExtractorFetchError('The sitemap response was empty.')
  }
  if (firstCharacter === '<') {
    return parseXmlDocument(allChunks(), onUrl, onChild)
  }
  return parseTextDocument(allChunks(), onUrl)
}

async function readRobotsSitemaps(
  siteUrl: URL,
  fetcher: SitemapFetcher,
  budget: CrawlBudget,
): Promise<URL[]> {
  const robotsUrl = new URL('/robots.txt', siteUrl)
  const { response } = await fetchPublicResponse(
    robotsUrl,
    fetcher,
    budget,
    'text/plain',
  )
  const declared = Number(response.headers.get('content-length'))
  if (
    Number.isFinite(declared) &&
    declared > SITEMAP_EXTRACTOR_LIMITS.robotsBytes
  ) {
    throw new ExtractorLimitError('The robots.txt file is too large.')
  }
  if (!response.body) return []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > SITEMAP_EXTRACTOR_LIMITS.robotsBytes) {
        throw new ExtractorLimitError('The robots.txt file is too large.')
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }

  const urls: URL[] = []
  for (const match of text.matchAll(/^\s*sitemap\s*:\s*(\S+)\s*$/gimu)) {
    try {
      urls.push(parseSitemapUrl(new URL(match[1], siteUrl).toString()))
    } catch {
      // Invalid sitemap declarations are ignored and common paths are tried.
    }
  }
  return urls
}

function isDomainInput(url: URL): boolean {
  return (url.pathname === '/' || url.pathname === '') && !url.search
}

async function runExtraction(
  requestedUrl: URL,
  maximumUrls: number,
  fetcher: SitemapFetcher,
  emit: (event: SitemapExtractorEvent) => Promise<void>,
): Promise<void> {
  const budget: CrawlBudget = {
    startedAt: Date.now(),
    subrequests: 0,
    downloadedBytes: 0,
    expandedBytes: 0,
  }
  const state: ExtractState = {
    maximumUrls,
    seenUrls: new Set(),
    urlsReturned: 0,
    urlCharacters: 0,
    duplicateUrls: 0,
    invalidUrls: 0,
    sitemapsFetched: 0,
    sitemapsFailed: 0,
    largeSitemaps: 0,
    sitemapLimitExceeded: false,
    urlLimitExceeded: false,
    outputLimitExceeded: false,
    timeLimitExceeded: false,
    stopped: false,
  }

  await emit({
    type: 'meta',
    schema: 1,
    requestedUrl: requestedUrl.toString(),
    maximumUrls,
    limits: SITEMAP_EXTRACTOR_LIMITS,
  })

  const queue: QueueItem[] = []
  const scheduled = new Set<string>()
  const schedule = (url: URL, depth: number, fallback = false): void => {
    const key = url.toString()
    if (scheduled.has(key)) return
    if (scheduled.size >= SITEMAP_EXTRACTOR_LIMITS.sitemaps) {
      state.sitemapLimitExceeded = true
      return
    }
    scheduled.add(key)
    queue.push({ url, depth, fallback })
  }

  if (isDomainInput(requestedUrl)) {
    let discovered: URL[] = []
    try {
      discovered = await readRobotsSitemaps(requestedUrl, fetcher, budget)
    } catch {
      // Common sitemap paths remain useful when robots.txt is absent or blocked.
    }
    if (discovered.length > 0) {
      for (const url of discovered) schedule(url, 0)
    } else {
      for (const path of COMMON_SITEMAP_PATHS) {
        schedule(new URL(path, requestedUrl), 0, true)
      }
    }
  } else {
    schedule(requestedUrl, 0)
  }

  while (queue.length > 0 && !state.stopped) {
    if (state.sitemapsFetched >= SITEMAP_EXTRACTOR_LIMITS.sitemaps) {
      state.sitemapLimitExceeded = true
      break
    }
    const item = queue.shift()
    if (!item) continue
    let response: Response
    let finalUrl: URL
    try {
      const result = await fetchPublicResponse(
        item.url,
        fetcher,
        budget,
        'application/xml, text/xml, application/gzip, text/plain;q=0.8',
      )
      response = result.response
      finalUrl = result.finalUrl
    } catch (error) {
      if (error instanceof ExtractorLimitError) {
        if (error.message.includes('time')) state.timeLimitExceeded = true
        else state.sitemapLimitExceeded = true
        state.stopped = true
      }
      if (item.fallback && !(error instanceof ExtractorLimitError)) continue
      state.sitemapsFailed += 1
      await emit({
        type: 'warning',
        code:
          error instanceof ExtractorLimitError
            ? 'limit-reached'
            : 'fetch-failed',
        severity: 'warning',
        sitemapUrl: item.url.toString(),
        message: `Could not read ${item.url.toString()}: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }
    if (!response.body) {
      if (item.fallback) continue
      state.sitemapsFailed += 1
      await emit({
        type: 'warning',
        code: 'fetch-failed',
        severity: 'warning',
        sitemapUrl: finalUrl.toString(),
        message: `Could not read ${finalUrl.toString()}: the response was empty.`,
      })
      continue
    }

    const childUrls: string[] = []
    let document: ParsedDocument
    try {
      document = await parseDocument(
        response.body,
        budget,
        async (rawEntry) => {
          const normalized = normalizePageUrl(rawEntry.url)
          if (!normalized) {
            state.invalidUrls += 1
            return true
          }
          if (state.seenUrls.has(normalized)) {
            state.duplicateUrls += 1
            return true
          }
          if (state.urlsReturned >= state.maximumUrls) {
            state.urlLimitExceeded = true
            state.stopped = true
            return false
          }
          const characters =
            normalized.length +
            finalUrl.toString().length +
            (rawEntry.lastmod?.length ?? 0) +
            (rawEntry.changefreq?.length ?? 0) +
            (rawEntry.priority?.length ?? 0) +
            rawEntry.hreflang.join('').length
          if (
            state.urlCharacters + characters >
            SITEMAP_EXTRACTOR_LIMITS.urlCharacters
          ) {
            state.outputLimitExceeded = true
            state.stopped = true
            return false
          }
          state.seenUrls.add(normalized)
          state.urlsReturned += 1
          state.urlCharacters += characters
          await emit({
            type: 'url',
            ...rawEntry,
            url: normalized,
            sourceSitemap: finalUrl.toString(),
            depth: item.depth,
          })
          return true
        },
        (url) => childUrls.push(url),
      )
    } catch (error) {
      state.sitemapsFailed += 1
      if (error instanceof ExtractorLimitError) {
        if (error.message.includes('time')) state.timeLimitExceeded = true
        else state.outputLimitExceeded = true
        state.stopped = true
      }
      await emit({
        type: 'warning',
        code:
          error instanceof ExtractorLimitError
            ? 'limit-reached'
            : 'fetch-failed',
        severity: 'warning',
        sitemapUrl: finalUrl.toString(),
        message: `Stopped reading ${finalUrl.toString()}: ${error instanceof Error ? error.message : String(error)}`,
      })
      continue
    }

    state.sitemapsFetched += 1
    if (item.fallback) {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (queue[index]?.fallback) queue.splice(index, 1)
      }
    }
    const overRecommendedSize =
      document.kind !== 'sitemapindex' &&
      document.urlEntries > SITEMAP_EXTRACTOR_LIMITS.largeSitemapWarningUrls
    if (overRecommendedSize) {
      state.largeSitemaps += 1
      await emit({
        type: 'warning',
        code: 'large-sitemap',
        severity: 'advice',
        sitemapUrl: finalUrl.toString(),
        message: `${document.urlEntries.toLocaleString()} URL entries were found in this sitemap. Many technical SEO teams split files at around 10,000 URLs so they are easier to monitor and retry. Google accepts up to 50,000 URLs in one sitemap.`,
      })
    }
    await emit({
      type: 'sitemap',
      url: finalUrl.toString(),
      depth: item.depth,
      kind: document.kind,
      urlEntries: document.urlEntries,
      childSitemaps: document.childSitemaps,
      countCapped: document.countCapped,
      overRecommendedSize,
    })

    for (const rawChild of childUrls) {
      let child: URL
      try {
        child = parseSitemapUrl(new URL(rawChild, finalUrl).toString())
      } catch {
        await emit({
          type: 'warning',
          code: 'invalid-child',
          severity: 'warning',
          sitemapUrl: finalUrl.toString(),
          message: `Skipped an invalid child sitemap URL: ${rawChild.slice(0, 160)}`,
        })
        continue
      }
      schedule(child, item.depth + 1)
    }
  }

  if (queue.length > 0) state.sitemapLimitExceeded = true
  if (state.sitemapLimitExceeded) {
    await emit({
      type: 'warning',
      code: 'limit-reached',
      severity: 'warning',
      message: `This extraction references more than the ${SITEMAP_EXTRACTOR_LIMITS.sitemaps.toLocaleString()} sitemap file processing limit. Some sitemap files were not checked.`,
    })
  }
  if (state.urlLimitExceeded) {
    await emit({
      type: 'warning',
      code: 'limit-reached',
      severity: 'warning',
      message: `Only the first ${state.maximumUrls.toLocaleString()} unique URLs were returned.`,
    })
  }
  if (state.outputLimitExceeded) {
    await emit({
      type: 'warning',
      code: 'limit-reached',
      severity: 'warning',
      message: 'The extraction stopped after reaching its data limit.',
    })
  }
  if (state.sitemapsFetched === 0 && state.urlsReturned === 0) {
    await emit({
      type: 'warning',
      code: 'no-sitemap-found',
      severity: 'warning',
      message:
        'No readable sitemap was found. Enter its exact URL if it uses a nonstandard location.',
    })
  }

  const partial =
    state.sitemapsFetched === 0 ||
    state.sitemapsFailed > 0 ||
    state.sitemapLimitExceeded ||
    state.urlLimitExceeded ||
    state.outputLimitExceeded ||
    state.timeLimitExceeded
  await emit({
    type: 'complete',
    dataStatus: partial ? 'partial' : 'complete',
    urlsReturned: state.urlsReturned,
    duplicateUrls: state.duplicateUrls,
    invalidUrls: state.invalidUrls,
    sitemapsFetched: state.sitemapsFetched,
    sitemapsFailed: state.sitemapsFailed,
    largeSitemaps: state.largeSitemaps,
    downloadedBytes: budget.downloadedBytes,
    expandedBytes: budget.expandedBytes,
    elapsedMilliseconds: Date.now() - budget.startedAt,
    truncation: {
      sitemapLimitExceeded: state.sitemapLimitExceeded,
      urlLimitExceeded: state.urlLimitExceeded,
      outputLimitExceeded: state.outputLimitExceeded,
      timeLimitExceeded: state.timeLimitExceeded,
    },
  })
}

export async function handleSitemapExtraction(
  request: Request,
  fetcher: SitemapFetcher = fetch,
  waitUntil?: WaitUntil,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!isBrowserRequestFromSameSite(request)) {
    return jsonResponse({ error: 'Not found' }, 404)
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return jsonResponse({ error: 'Send a JSON request.' }, 400)
  }

  let requestedUrl: URL
  let maximumUrls: number
  try {
    const body = await readBoundedRequest(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ExtractorInputError('Send a sitemap URL or domain.')
    }
    const fields = Object.keys(body)
    if (
      fields.some((field) => !['url', 'maxUrls'].includes(field)) ||
      !fields.includes('url')
    ) {
      throw new ExtractorInputError('Send only the URL and maximum URL count.')
    }
    const value = body as { url?: unknown; maxUrls?: unknown }
    requestedUrl = parseInputUrl(value.url)
    maximumUrls = parseMaximumUrls(value.maxUrls)
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof ExtractorInputError
            ? error.message
            : 'The request could not be read.',
      },
      400,
    )
  }

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const job = (async () => {
    const emit = async (event: SitemapExtractorEvent): Promise<void> => {
      await writer.write(encoder.encode(`${JSON.stringify(event)}\n`))
    }
    try {
      await runExtraction(requestedUrl, maximumUrls, fetcher, emit)
    } catch (error) {
      try {
        await emit({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'The sitemap could not be extracted.',
        })
      } catch {
        // The browser may have cancelled the response stream.
      }
    } finally {
      await writer.close().catch(() => undefined)
    }
  })()
  waitUntil?.(job)

  return new Response(readable, { status: 200, headers: NDJSON_HEADERS })
}
