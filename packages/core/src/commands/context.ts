import { originOf } from './shared.js'
import { type Caller, CommandError } from './types.js'

// The business context of a site: what the business sells, to whom, which
// pages turn a visit into a customer and who it competes with. The person's
// agent writes it by following contextGuide, the person corrects it in chat,
// and seo next reads it to put money pages first and to know when to look
// again. One per Search Console property: context.json on this machine, or
// with the hosted account.

export type SiteContext = { text: string; updated_at: string }

export type ContextStore = {
  read: (site: string) => Promise<SiteContext | null>
  // Replaces the site's context.
  write: (site: string, context: SiteContext) => Promise<void>
}

export type ContextFile = { version: 1; sites: Record<string, SiteContext> }

export const CONTEXT_MAX = 8_000
// Days before seo next asks for the context to be checked again.
export const CONTEXT_DAYS = 90

const DAY_MS = 86_400_000

// The day the context is due to be checked again, YYYY-MM-DD.
export function contextReviewOn(context: SiteContext): string {
  return new Date(Date.parse(context.updated_at) + CONTEXT_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

export function contextIsStale(context: SiteContext, now: Date): boolean {
  const saved = Date.parse(context.updated_at)
  return (
    !Number.isFinite(saved) || now.getTime() - saved > CONTEXT_DAYS * DAY_MS
  )
}

// The text as it is kept: trimmed, and refused when empty or too long.
export function contextText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new CommandError(
      'INVALID_INPUT',
      'context is empty. Nothing was saved.',
    )
  }
  if (trimmed.length > CONTEXT_MAX) {
    throw new CommandError(
      'INVALID_INPUT',
      `context is ${trimmed.length.toLocaleString('en-US')} characters; the most is ${CONTEXT_MAX.toLocaleString('en-US')}. Shorten it and save again. Nothing was saved.`,
    )
  }
  return trimmed
}

// The paths listed under "## Money pages": a path or URL at the start of
// each line, as a pathname. A path ending in / or * covers every page under
// it; any other path is one page.
export type MoneyPath = { path: string; prefix: boolean }

export function moneyPaths(text: string): MoneyPath[] {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^##\s+money pages\s*$/i.test(line))
  if (start < 0) return []
  const paths: MoneyPath[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break
    const token = line
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
      .trim()
      .split(/\s/)[0]
      ?.replace(/[`<>]/g, '')
    if (!token) continue
    let path: string | null = null
    if (token.startsWith('/')) path = token
    else if (/^https?:\/\//i.test(token)) {
      try {
        path = new URL(token.replace(/\*$/, '')).pathname
        if (token.endsWith('*')) path += '*'
      } catch {
        path = null
      }
    }
    if (!path) continue
    const prefix = path.endsWith('*') || (path.endsWith('/') && path !== '/')
    paths.push({ path: trimPath(path.replace(/\*$/, '')), prefix })
  }
  return paths
}

const trimPath = (path: string) =>
  path.length > 1 ? path.replace(/\/+$/, '') : path

// Whether an issue's subject (a URL, or "query" on a URL) is on a money page.
export function onMoneyPage(subject: string, paths: MoneyPath[]): boolean {
  if (!paths.length) return false
  const url = subject.match(/https?:\/\/\S+/)?.[0]
  if (!url) return false
  let pathname: string
  try {
    pathname = trimPath(new URL(url).pathname)
  } catch {
    return false
  }
  return paths.some((money) =>
    money.prefix
      ? pathname === money.path || pathname.startsWith(`${money.path}/`)
      : pathname === money.path,
  )
}

// What the agent follows to write the context. seo next returns it when a
// site has none, or when its context is older than CONTEXT_DAYS.
export function contextGuide(site: string, call: Caller): string {
  return [
    `Write the business context for ${site}: what the business sells, who buys it, and which pages turn a visit into a customer. Every later step uses it to put the pages that make money first and to judge whether a search fits the product.`,
    `Research it in this order, and stop once each heading below has an answer:`,
    [
      `1. Read the home page, the pricing page and the main product or feature pages (${call('page', { url: '<url>' })} reads one live).`,
      `2. Read the pages and queries that already bring clicks: ${call('report', { site })}.`,
      `3. Find the competitors: ${call('research', { action: 'competitors', target: new URL(originOf(site)).hostname })}, plus the companies the site's own comparison or alternatives pages name. Without a research key, use any SEO tool or signed-in browser the person has.`,
      `4. Read what customers say, where the business has reviews (G2, Capterra, Trustpilot, app stores, Reddit), and note the words buyers use for their problem.`,
      `5. Ask the person, in one message, only what the site cannot tell you: what counts as a conversion, which customers they want more of, and who they lose deals to.`,
    ].join('\n'),
    `Write it in Markdown under these headings, short and factual, at most ${CONTEXT_MAX.toLocaleString('en-US')} characters:`,
    [
      '## What it sells',
      '## Who buys it',
      '## What counts as a conversion',
      '## Money pages',
      'One path or URL per line, such as /pricing or /demo. A path ending in / covers every page under it.',
      '## Competitors',
      'One domain per line.',
      '## Markets',
      '## Voice',
      '## Notes',
    ].join('\n'),
    `Show it to the person and change what they correct. Then save it with ${call('next', { site, context: '<the Markdown>' })}, which replaces any earlier version and returns the next step.`,
  ].join('\n\n')
}
