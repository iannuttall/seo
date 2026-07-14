import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export interface AgentPageMetadata {
  canonical: string
  description: string
  language: string
  title: string
}

export interface RenderAgentMarkdownOptions {
  excludeSelectors?: readonly string[]
}

export interface RenderedAgentMarkdown {
  markdown: string
  metadata: AgentPageMetadata
  tokenEstimate: number
}

const defaultExclusions = [
  'script',
  'style',
  'template',
  'noscript',
  'nav',
  'footer',
  'svg',
  'canvas',
  'form',
  'button',
  '[aria-hidden="true"]',
  '[role="tooltip"]',
  '[data-agent-markdown="exclude"]',
  '[data-code-copy]',
] as const

function requiredAttribute(
  document: Document,
  selector: string,
  attribute: string,
  fallback?: string,
): string {
  const value = document
    .querySelector(selector)
    ?.getAttribute(attribute)
    ?.trim()
  if (value) return value
  if (fallback) return fallback
  throw new Error(`Missing ${attribute} on ${selector}`)
}

function documentMetadata(document: Document, pageUrl: URL): AgentPageMetadata {
  const title = document.querySelector('title')?.textContent?.trim()
  if (!title) throw new Error('Missing document title')

  return {
    title,
    description: requiredAttribute(
      document,
      'meta[name="description"]',
      'content',
    ),
    canonical: requiredAttribute(
      document,
      'link[rel="canonical"]',
      'href',
      pageUrl.toString(),
    ),
    language: document.documentElement.getAttribute('lang')?.trim() || 'en',
  }
}

function escapeYaml(value: string): string {
  return JSON.stringify(value.replace(/\r\n?/gu, '\n'))
}

export function serializeAgentFrontmatter(metadata: AgentPageMetadata): string {
  return [
    '---',
    `title: ${escapeYaml(metadata.title)}`,
    `description: ${escapeYaml(metadata.description)}`,
    `canonical: ${escapeYaml(metadata.canonical)}`,
    `language: ${escapeYaml(metadata.language)}`,
    '---',
  ].join('\n')
}

function absoluteUrl(value: string, pageUrl: URL): string {
  if (!value || value.startsWith('#')) return value
  try {
    return new URL(value, pageUrl).toString()
  } catch {
    return value
  }
}

function normalizeUrls(root: Element, pageUrl: URL): void {
  for (const element of root.querySelectorAll('[href], [src], [srcset]')) {
    for (const attribute of ['href', 'src'] as const) {
      const value = element.getAttribute(attribute)
      if (value) element.setAttribute(attribute, absoluteUrl(value, pageUrl))
    }

    const srcset = element.getAttribute('srcset')
    if (srcset) {
      element.setAttribute(
        'srcset',
        srcset
          .split(',')
          .map((candidate) => {
            const [url, ...descriptor] = candidate.trim().split(/\s+/u)
            return [absoluteUrl(url ?? '', pageUrl), ...descriptor]
              .filter(Boolean)
              .join(' ')
          })
          .join(', '),
      )
    }
  }
}

function preserveAriaLabels(root: Element): void {
  for (const element of root.querySelectorAll('[aria-label]')) {
    const label = element.getAttribute('aria-label')?.trim()
    if (!label) continue

    const clone = element.cloneNode(true) as Element
    for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) {
      hidden.remove()
    }
    if (!(clone.textContent ?? '').trim()) element.textContent = label
  }
}

function removeExcluded(root: Element, selectors: readonly string[]): void {
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) element.remove()
  }
}

function markdownService(): TurndownService {
  const service = new TurndownService({
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    fence: '```',
    headingStyle: 'atx',
    strongDelimiter: '**',
  })
  service.use(gfm)
  service.addRule('languageFence', {
    filter(node) {
      return (
        node.nodeName === 'PRE' &&
        Boolean(node.querySelector('code[class*="language-"]'))
      )
    },
    replacement(_content, node) {
      const code = node.querySelector('code')
      const language =
        code?.getAttribute('class')?.match(/(?:^|\s)language-([^\s]+)/u)?.[1] ??
        ''
      const value = (code?.textContent ?? '').replace(/\n$/u, '')
      return `\n\n\`\`\`${language}\n${value}\n\`\`\`\n\n`
    },
  })
  return service
}

function normalizeMarkdown(value: string): string {
  return `${value
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+$/gmu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()}\n`
}

export function estimateMarkdownTokens(markdown: string): number {
  return Math.ceil(Buffer.byteLength(markdown, 'utf8') / 4)
}

export function renderAgentMarkdown(
  html: string,
  pageUrl: string,
  options: RenderAgentMarkdownOptions = {},
): RenderedAgentMarkdown {
  const url = new URL(pageUrl)
  const { document } = parseHTML(html)
  const metadata = documentMetadata(document as unknown as Document, url)
  const source =
    document.querySelector('[data-agent-content]') ??
    document.querySelector('main')
  if (!source)
    throw new Error('Missing main or [data-agent-content] content root')

  const root = source.cloneNode(true) as Element
  preserveAriaLabels(root)
  removeExcluded(root, [
    ...defaultExclusions,
    ...(options.excludeSelectors ?? []),
  ])
  normalizeUrls(root, url)

  const body = normalizeMarkdown(markdownService().turndown(root.innerHTML))
  const h1Count = (body.match(/^#\s+/gmu) ?? []).length
  if (h1Count !== 1) throw new Error(`Expected one H1, found ${h1Count}`)
  if (/<(?:script|style|svg|canvas)\b/iu.test(body)) {
    throw new Error('Rendered Markdown contains excluded markup')
  }

  const markdown = `${serializeAgentFrontmatter(metadata)}\n\n${body}`
  return {
    markdown,
    metadata,
    tokenEstimate: estimateMarkdownTokens(markdown),
  }
}
