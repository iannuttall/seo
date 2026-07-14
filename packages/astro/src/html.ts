import { parseHTML } from 'linkedom'

const markdownAlternatePattern =
  /<link\b(?=[^>]*\brel\s*=\s*["'][^"']*\balternate\b[^"']*["'])(?=[^>]*\btype\s*=\s*["']text\/markdown["'])[^>]*>\s*/giu

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function attributeValue(element: Element, name: string): string | null {
  const actualName = [...element.getAttributeNames()].find(
    (attribute) => attribute.toLowerCase() === name,
  )
  return actualName ? element.getAttribute(actualName) : null
}

export function injectMarkdownAlternate(
  html: string,
  markdownUrl: string,
): string {
  const withoutManagedLinks = html.replace(markdownAlternatePattern, '')
  const closeHead = /<\/head\s*>/iu
  if (!closeHead.test(withoutManagedLinks)) {
    throw new Error('Cannot inject Markdown alternate without </head>')
  }
  const link = `<link rel="alternate" type="text/markdown" href="${escapeAttribute(markdownUrl)}">`
  return withoutManagedLinks.replace(closeHead, `${link}\n</head>`)
}

export function isRedirectHtml(html: string): boolean {
  const { document } = parseHTML(html)
  return (
    [...document.querySelectorAll('meta')].some(
      (meta) => attributeValue(meta, 'http-equiv')?.toLowerCase() === 'refresh',
    ) || Boolean(document.querySelector('[data-astro-redirect]'))
  )
}

export function isNoindexHtml(html: string): boolean {
  const { document } = parseHTML(html)
  return [...document.querySelectorAll('meta')]
    .filter((meta) => attributeValue(meta, 'name')?.toLowerCase() === 'robots')
    .some((meta) =>
      (attributeValue(meta, 'content') ?? '')
        .split(',')
        .some((directive) => directive.trim().toLowerCase() === 'noindex'),
    )
}

export function canonicalFromHtml(html: string): string | undefined {
  const { document } = parseHTML(html)
  const link = [...document.querySelectorAll('link')].find((candidate) =>
    (attributeValue(candidate, 'rel') ?? '')
      .toLowerCase()
      .split(/\s+/u)
      .includes('canonical'),
  )
  return link ? attributeValue(link, 'href')?.trim() : undefined
}
