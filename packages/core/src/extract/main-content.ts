import { Readability } from '@mozilla/readability'
import { load } from 'cheerio'
import Defuddle from 'defuddle'
import { parseHTML } from 'linkedom'
import type {
  ContentExtractionDiagnostics,
  ContentExtractor,
  PageFetchResult,
} from '../types.js'

interface DefuddleResult {
  content?: string
  description?: string
  wordCount?: number
  extractorType?: string
}

export interface MainContentDependencies {
  parseDefuddle?: (
    document: unknown,
    options: { url: string; useAsync: false },
  ) => DefuddleResult
}

export interface MainContentResult {
  text: string
  excerpt?: string
  wordCount: number
  diagnostics: ContentExtractionDiagnostics
  warnings: string[]
}

// linkedom needs an <html> root. Without one (an empty body, plain text,
// JSON or a lone doctype) reading document.body throws, and a bare fragment
// loses its text. Such input is parsed again inside an empty page.
export function parseDocument(html: string) {
  const { document } = parseHTML(html)
  if (document.documentElement?.localName === 'html') return document
  return parseHTML(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
  ).document
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizedText(value?: string | null): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim()
  return text || undefined
}

export function countCjkAwareWords(text: string): number {
  let count = 0
  let inWord = false

  for (const character of text) {
    if (
      /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(
        character,
      )
    ) {
      count += 1
      inWord = false
    } else if (/\s/u.test(character)) {
      inWord = false
    } else if (!inWord) {
      count += 1
      inWord = true
    }
  }

  return count
}

interface UrlDocument {
  querySelectorAll(selector: string): Iterable<{
    getAttribute(name: string): string | null
    setAttribute(name: string, value: string): void
  }>
}

function resolveDocumentUrls(document: UrlDocument, baseUrl: string): void {
  for (const element of document.querySelectorAll('[href], [src]')) {
    for (const attribute of ['href', 'src'] as const) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      try {
        element.setAttribute(attribute, new URL(value, baseUrl).toString())
      } catch {
        // Leave non-URL schemes and malformed evidence unchanged.
      }
    }
  }
}

function readabilityResult(
  fetchResult: PageFetchResult,
  requested: ContentExtractor,
  fallbackReason?: ContentExtractionDiagnostics['fallbackReason'],
  fallbackDetail?: string,
): MainContentResult {
  const fallback = requested !== 'readability'
  const diagnostics: ContentExtractionDiagnostics = {
    requested,
    used: 'readability',
    fallback,
    wordCountSource: 'local_cjk_aware',
    baseUrl: fetchResult.finalUrl,
    ...(fallback
      ? {
          fallbackReason,
          fallbackDetail,
        }
      : {}),
  }
  const warnings =
    fallback && fallbackDetail
      ? [`Defuddle extraction fell back to Readability: ${fallbackDetail}`]
      : []
  try {
    const document = parseDocument(fetchResult.html)
    const bodyText = document.body?.textContent ?? ''
    const article = new Readability(document as never).parse()
    const text = article?.textContent ?? bodyText
    return {
      text,
      excerpt: normalizedText(article?.excerpt),
      wordCount: countCjkAwareWords(text),
      diagnostics,
      warnings,
    }
  } catch (error) {
    return {
      text: '',
      wordCount: 0,
      diagnostics,
      warnings: [
        ...warnings,
        `The page's main content could not be read: ${readableError(error)}`,
      ],
    }
  }
}

function defaultParseDefuddle(
  document: unknown,
  options: { url: string; useAsync: false },
): DefuddleResult {
  const DefuddleConstructor = Defuddle as unknown as new (
    document: never,
    options: { url: string; useAsync: false },
  ) => { parse(): DefuddleResult }
  return new DefuddleConstructor(document as never, options).parse()
}

export function extractMainContent(
  fetchResult: PageFetchResult,
  extractor: Exclude<ContentExtractor, 'crawler'> = 'defuddle',
  dependencies: MainContentDependencies = {},
): MainContentResult {
  if (extractor === 'readability') {
    return readabilityResult(fetchResult, extractor)
  }

  try {
    const document = parseDocument(fetchResult.html)
    resolveDocumentUrls(document, fetchResult.finalUrl)
    const article = (dependencies.parseDefuddle ?? defaultParseDefuddle)(
      document,
      { url: fetchResult.finalUrl, useAsync: false },
    )
    const text =
      typeof article.content === 'string'
        ? load(article.content).text()
        : (document.body?.textContent ?? '')
    if (!text.trim()) {
      return readabilityResult(
        fetchResult,
        extractor,
        'defuddle_empty',
        'Defuddle returned no main content',
      )
    }
    const reportedWordCount = article.wordCount
    const hasValidWordCount =
      typeof reportedWordCount === 'number' &&
      Number.isFinite(reportedWordCount) &&
      reportedWordCount >= 0
    const extractorType = normalizedText(article.extractorType)

    return {
      text,
      excerpt: normalizedText(article.description),
      wordCount: hasValidWordCount
        ? Math.floor(reportedWordCount)
        : countCjkAwareWords(text),
      diagnostics: {
        requested: extractor,
        used: 'defuddle',
        fallback: false,
        wordCountSource: hasValidWordCount ? 'defuddle' : 'local_cjk_aware',
        baseUrl: fetchResult.finalUrl,
        ...(extractorType ? { extractorType } : {}),
      },
      warnings: [],
    }
  } catch (error) {
    return readabilityResult(
      fetchResult,
      extractor,
      'defuddle_error',
      readableError(error),
    )
  }
}

// The most Markdown a page result carries, so one page cannot fill an
// agent's context.
export const MARKDOWN_LIMIT = 20_000

export interface MainContentMarkdown {
  markdown: string
  // The length before any cut, in characters.
  characters: number
  truncated: boolean
}

// The page's main content as Markdown, from the same Defuddle extraction.
// Links are made absolute. Nothing is fetched beyond the given HTML.
export async function extractMainMarkdown(
  fetchResult: PageFetchResult,
): Promise<MainContentMarkdown> {
  const document = parseDocument(fetchResult.html)
  resolveDocumentUrls(document, fetchResult.finalUrl)
  const { Defuddle: toMarkdown } = await import('defuddle/node')
  const result = await toMarkdown(document as never, fetchResult.finalUrl, {
    markdown: true,
    useAsync: false,
  })
  const markdown = (result.content ?? '').trim()
  if (markdown.length <= MARKDOWN_LIMIT) {
    return { markdown, characters: markdown.length, truncated: false }
  }
  const cut = markdown.slice(0, MARKDOWN_LIMIT)
  const end = cut.lastIndexOf('\n')
  return {
    markdown: (end > MARKDOWN_LIMIT / 2 ? cut.slice(0, end) : cut).trimEnd(),
    characters: markdown.length,
    truncated: true,
  }
}
