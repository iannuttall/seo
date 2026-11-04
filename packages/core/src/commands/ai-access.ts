import { Parser } from 'htmlparser2'
import robotsParserModule from 'robots-parser'
import { SEO_CRAWLER_USER_AGENT } from '../fetch/crawler-identity.js'
import { boundedText } from './page-facts.js'
import { CommandError, type CommandResult } from './types.js'

// seo ai-access: fetches one page as a browser and as four AI bots and
// compares what each gets, with robots.txt, llms.txt and the page's Markdown
// copy. At most ten requests, each bounded in time and size, nothing stored.
// Pure JavaScript, so the CLI and the hosted MCP check pages the same way.

const TIMEOUT_MS = 10_000
const PAGE_BYTES = 2_000_000
const FILE_BYTES = 256_000
// A bot has the main text when it gets at least this share of the browser's
// words. Pages that rotate a few blocks per request still pass.
const TEXT_SHARE = 0.8
// Below this many browser words there is no main text to compare.
const MIN_WORDS = 20

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

// Each bot's published user agent string. The version numbers change.
export const AI_ACCESS_BOTS = [
  {
    name: 'GPTBot',
    operator: 'OpenAI',
    purpose: 'training',
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot',
  },
  {
    name: 'OAI-SearchBot',
    operator: 'OpenAI',
    purpose: 'search',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot',
  },
  {
    name: 'ClaudeBot',
    operator: 'Anthropic',
    purpose: 'training',
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  },
  {
    name: 'PerplexityBot',
    operator: 'Perplexity',
    purpose: 'search',
    userAgent:
      'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  },
] as const

export const AI_ACCESS_NOTE =
  "Each bot request sends that bot's user agent string from here, not from the bot's own IP addresses. A site that checks IPs, such as one using a verified bot list, may answer the real bot differently. No request runs JavaScript, so text a page builds in the browser is not counted."

export type AiAccessPage = {
  status: number | null
  finalUrl: string | null
  contentType: string | null
  // Words in the main text: inside <main> or <article> when the page has
  // them, otherwise the body without navigation, header, footer and asides.
  // null when no HTML came back.
  words: number | null
  error?: string
}

export type AiAccessBot = AiAccessPage & {
  name: string
  operator: string
  purpose: 'search' | 'training'
  // What robots.txt says for this bot and URL. null when robots.txt could
  // not be read.
  robotsAllowed: boolean | null
  // Whether the bot got the browser's main text. null when the browser got
  // no main text to compare with.
  mainText: boolean | null
  differs: Array<'status' | 'final_url' | 'text'>
}

// found: the file. html: an HTML page instead, such as the home page served
// for every path. missing: a 4xx. unavailable: a 429, 5xx or no response,
// so nothing is known.
export type AiAccessFileState = 'found' | 'html' | 'missing' | 'unavailable'

export type AiAccessFile = {
  url: string
  state: AiAccessFileState
  status: number | null
  contentType: string | null
  finalUrl?: string
  error?: string
}

export type AiAccessData = {
  url: string
  browser: AiAccessPage
  bots: AiAccessBot[]
  robotsTxt: AiAccessFile
  llmsTxt: AiAccessFile
  markdown: {
    // The page's <link rel="alternate" type="text/markdown">, when it has one.
    alternate: AiAccessFile | null
    // The page URL with .md, such as /docs/start.md or /index.md.
    dotMd: AiAccessFile | null
    // The page URL requested with Accept: text/markdown.
    negotiated: AiAccessFile
  }
  note: string
}

type Fetch = typeof fetch

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'fetch failed'

const isHtmlType = (contentType: string | null) =>
  /\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType ?? '')

const looksLikeHtml = (text: string) =>
  /^\s*(?:<!doctype html|<html[\s>]|<head[\s>])/i.test(text)

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'head',
  'nav',
  'header',
  'footer',
  'aside',
])

const countWords = (text: string) =>
  text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length

// Main-text words, as AiAccessPage.words describes.
export function mainTextWords(html: string): number {
  let skip = 0
  let main = 0
  let body = ''
  let mainText = ''
  const parser = new Parser(
    {
      onopentag(name) {
        if (SKIP_TAGS.has(name)) skip += 1
        if (name === 'main' || name === 'article') main += 1
      },
      ontext(text) {
        if (skip) return
        body += ` ${text}`
        if (main) mainText += ` ${text}`
      },
      onclosetag(name) {
        if (SKIP_TAGS.has(name) && skip) skip -= 1
        if ((name === 'main' || name === 'article') && main) main -= 1
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  )
  parser.write(html)
  parser.end()
  const inMain = countWords(mainText)
  return inMain > 0 ? inMain : countWords(body)
}

async function fetchPage(
  fetchImpl: Fetch,
  url: string,
  userAgent: string,
): Promise<AiAccessPage & { html: string }> {
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      headers: {
        'user-agent': userAgent,
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const contentType = response.headers.get('content-type')
    const html = isHtmlType(contentType)
      ? await boundedText(response, PAGE_BYTES)
      : ''
    if (!html) await response.body?.cancel()
    return {
      status: response.status,
      finalUrl: response.url || url,
      contentType,
      words: html ? mainTextWords(html) : null,
      html,
    }
  } catch (error) {
    return {
      status: null,
      finalUrl: null,
      contentType: null,
      words: null,
      error: errorText(error),
      html: '',
    }
  }
}

async function fetchFile(
  fetchImpl: Fetch,
  url: string,
  accept: string,
): Promise<AiAccessFile & { text: string }> {
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      headers: { 'user-agent': SEO_CRAWLER_USER_AGENT, accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const contentType = response.headers.get('content-type')
    const status = response.status
    const ok = status >= 200 && status < 300
    const text = ok ? await boundedText(response, FILE_BYTES) : ''
    if (!ok) await response.body?.cancel()
    const state: AiAccessFileState = ok
      ? isHtmlType(contentType) || looksLikeHtml(text)
        ? 'html'
        : 'found'
      : status === 429 || status >= 500
        ? 'unavailable'
        : 'missing'
    return {
      url,
      state,
      status,
      contentType,
      ...(response.url && response.url !== url
        ? { finalUrl: response.url }
        : {}),
      text,
    }
  } catch (error) {
    return {
      url,
      state: 'unavailable',
      status: null,
      contentType: null,
      error: errorText(error),
      text: '',
    }
  }
}

function withoutText<T extends { text: string }>(file: T): Omit<T, 'text'> {
  const { text: _text, ...rest } = file
  return rest
}

function markdownAlternate(html: string, base: string): string | null {
  let found: string | null = null
  const parser = new Parser({
    onopentag(name, attributes) {
      if (found || name !== 'link') return
      const rel = attributes.rel?.toLowerCase().split(/\s+/) ?? []
      if (
        rel.includes('alternate') &&
        /^text\/(?:x-)?markdown\b/i.test(attributes.type ?? '') &&
        attributes.href
      ) {
        try {
          found = new URL(attributes.href, base).toString()
        } catch {
          // Ignore a malformed link.
        }
      }
    },
  })
  parser.write(html)
  parser.end()
  return found
}

// /docs/start/ and /docs/start become /docs/start.md; / becomes /index.md.
export function dotMdUrl(pageUrl: string): string | null {
  const url = new URL(pageUrl)
  url.search = ''
  url.hash = ''
  if (/\.md$/i.test(url.pathname)) return null
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path ? `${path}.md` : '/index.md'
  return url.toString()
}

type RobotsRules = {
  isAllowed(url: string, ua?: string): boolean | undefined
}

function robotsAllows(
  robots: AiAccessFile & { text: string },
  pageUrl: string,
  bot: string,
): boolean | null {
  if (robots.state === 'unavailable') return null
  // A missing file or an HTML page holds no rules.
  if (robots.state !== 'found') return true
  const parse = robotsParserModule as unknown as (
    url: string,
    text: string,
  ) => RobotsRules
  return (
    parse(robots.finalUrl ?? robots.url, robots.text).isAllowed(pageUrl, bot) ??
    true
  )
}

function compare(
  browser: AiAccessPage,
  bot: AiAccessPage,
): Pick<AiAccessBot, 'mainText' | 'differs'> {
  const browserOk =
    browser.status !== null && browser.status >= 200 && browser.status < 300
  const baseline = browserOk ? (browser.words ?? 0) : 0
  const botOk = bot.status !== null && bot.status >= 200 && bot.status < 300
  const mainText =
    baseline < MIN_WORDS
      ? null
      : botOk && (bot.words ?? 0) >= baseline * TEXT_SHARE
  const differs: AiAccessBot['differs'] = []
  if (bot.status !== browser.status) differs.push('status')
  if (bot.finalUrl !== browser.finalUrl) differs.push('final_url')
  if (mainText === false) differs.push('text')
  return { mainText, differs }
}

export async function runAiAccess(
  input: { url: string },
  fetchImpl: Fetch = fetch,
): Promise<CommandResult> {
  let url: URL
  try {
    url = new URL(input.url)
  } catch {
    throw new CommandError('INVALID_INPUT', `${input.url} is not a URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CommandError('INVALID_INPUT', 'The URL must be http or https.')
  }
  const pageUrl = url.toString()

  const browser = await fetchPage(fetchImpl, pageUrl, BROWSER_USER_AGENT)
  const alternateUrl = markdownAlternate(
    browser.html,
    browser.finalUrl ?? pageUrl,
  )
  const dotMd = dotMdUrl(browser.finalUrl ?? pageUrl)
  const markdownAccept = 'text/markdown,text/plain;q=0.9,*/*;q=0.1'

  // Bot requests run one at a time, so a rate limit on parallel requests
  // does not look like a block on one bot.
  const botPages = (async () => {
    const pages: Array<AiAccessPage & { html: string }> = []
    for (const bot of AI_ACCESS_BOTS) {
      pages.push(await fetchPage(fetchImpl, pageUrl, bot.userAgent))
    }
    return pages
  })()
  const [pages, robots, llms, alternate, dotMdFile, negotiated] =
    await Promise.all([
      botPages,
      fetchFile(
        fetchImpl,
        new URL('/robots.txt', url).toString(),
        'text/plain',
      ),
      fetchFile(fetchImpl, new URL('/llms.txt', url).toString(), 'text/plain'),
      alternateUrl
        ? fetchFile(fetchImpl, alternateUrl, markdownAccept)
        : Promise.resolve(null),
      dotMd && dotMd !== alternateUrl
        ? fetchFile(fetchImpl, dotMd, markdownAccept)
        : Promise.resolve(null),
      fetchFile(fetchImpl, pageUrl, 'text/markdown'),
    ])

  const { html: _html, ...browserFacts } = browser
  const bots: AiAccessBot[] = AI_ACCESS_BOTS.map((bot, index) => {
    const { html: _botHtml, ...page } = pages[index] as AiAccessPage & {
      html: string
    }
    return {
      name: bot.name,
      operator: bot.operator,
      purpose: bot.purpose,
      ...page,
      robotsAllowed: robotsAllows(robots, pageUrl, bot.name),
      ...compare(browserFacts, page),
    }
  })
  const data: AiAccessData = {
    url: pageUrl,
    browser: browserFacts,
    bots,
    robotsTxt: withoutText(robots),
    llmsTxt: withoutText(llms),
    markdown: {
      alternate: alternate ? withoutText(alternate) : null,
      dotMd: dotMdFile ? withoutText(dotMdFile) : null,
      negotiated: withoutText(negotiated),
    },
    note: AI_ACCESS_NOTE,
  }
  return { text: aiAccessText(data), data }
}

const number = (value: number) => value.toLocaleString('en-US')

function pageLine(page: AiAccessPage): string {
  if (page.status === null) return `no response (${page.error})`
  if (page.words === null && (page.status < 200 || page.status >= 300))
    return `HTTP ${page.status}`
  const words =
    page.words === null
      ? `not HTML (${page.contentType ?? 'no content type'})`
      : `${number(page.words)} words`
  return `HTTP ${page.status}, ${words}`
}

function fileLine(file: AiAccessFile, found: string): string {
  const http = file.status === null ? '' : `HTTP ${file.status}`
  const type = file.contentType ? `, ${file.contentType}` : ''
  switch (file.state) {
    case 'found':
      return `${found} (${http}${type})`
    case 'html':
      return `an HTML page instead (${http}${type})`
    case 'missing':
      return `none (${http})`
    case 'unavailable':
      return `not known: ${file.error ?? http}`
  }
}

export function aiAccessText(data: AiAccessData): string {
  const browser = data.browser
  const browserOk =
    browser.status !== null && browser.status >= 200 && browser.status < 300
  const lines = [
    `AI bot access for ${data.url}`,
    '',
    `Browser: ${pageLine(browser)}${browser.finalUrl && browser.finalUrl !== data.url ? `, ended at ${browser.finalUrl}` : ''}.${browserOk ? '' : ' The browser request did not get the page either, so this machine or server may be blocked and the bot results say little.'}`,
  ]
  for (const bot of data.bots) {
    const robots =
      bot.robotsAllowed === null
        ? 'robots.txt not known'
        : data.robotsTxt.state !== 'found'
          ? 'no robots.txt rules'
          : bot.robotsAllowed
            ? 'robots.txt allows'
            : 'robots.txt blocks'
    const verdict = bot.differs.length
      ? `Differs from the browser: ${bot.differs
          .map((field) =>
            field === 'final_url'
              ? `ended at ${bot.finalUrl ?? 'no URL'}`
              : field === 'text'
                ? 'main text missing'
                : 'status',
          )
          .join(', ')}.`
      : bot.mainText === null
        ? 'Same status and URL as the browser; no main text to compare.'
        : 'Same as the browser.'
    lines.push(
      `${bot.name} (${bot.operator}, ${bot.purpose}): ${robots}. ${pageLine(bot)}. ${verdict}`,
    )
  }
  lines.push(
    '',
    `robots.txt: ${fileLine(data.robotsTxt, 'found')}.`,
    `llms.txt: ${fileLine(data.llmsTxt, 'found')}.`,
    `Markdown link in the page: ${data.markdown.alternate ? `${data.markdown.alternate.url}, ${fileLine(data.markdown.alternate, 'Markdown')}` : 'none'}.`,
  )
  if (data.markdown.dotMd) {
    lines.push(
      `${data.markdown.dotMd.url}: ${fileLine(data.markdown.dotMd, 'Markdown')}.`,
    )
  }
  lines.push(
    `Accept: text/markdown: ${fileLine(data.markdown.negotiated, 'Markdown')}.`,
    '',
    data.note,
  )
  return lines.join('\n')
}
