import { AI_ANSWER_QUESTIONS } from './ai-answers.js'
import { bareDomain } from './domain-rating.js'
import { originOf } from './shared.js'
import { type Caller, CommandError } from './types.js'

// The business context of a site: what the business sells, to whom, which
// pages turn a visit into a customer and who it competes with. The person's
// agent writes it by following contextGuide, the person corrects it in chat,
// and seo next reads it to put conversion pages first and to know when to look
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
// How much of the context progress reads (progress.ts).
export const PROGRESS_LIMITS = {
  pages: 25,
  searches: 30,
  questions: AI_ANSWER_QUESTIONS,
  competitors: 5,
} as const
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

// The lines under a "## <heading>" of the context, without list markers,
// up to the next heading. Empty lines are left out.
export function headingLines(text: string, heading: string): string[] {
  const lines = text.split('\n')
  const start = lines.findIndex(
    (line) =>
      /^##\s/.test(line) && line.slice(2).trim().toLowerCase() === heading,
  )
  if (start < 0) return []
  const found: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break
    const item = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim()
    if (item) found.push(item)
  }
  return found
}

// The brand names as one RE2 regex: a search that contains any of them, as
// the reports count brand searches.
export const brandRegex = (names: string[]) =>
  names.length
    ? `(?i)(${names.map((name) => name.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&')).join('|')})`
    : undefined

// The names under "## Brand names", one per line. Whatever follows the name
// in brackets or after a dash is a note, not part of the name. The reports
// count a search that contains one of them as a brand search.
export function brandNames(text: string): string[] {
  const names = headingLines(text, 'brand names')
    .map((line) =>
      line
        .split(/\s+[(\u2013\u2014-]\s*|\s*[\u2013\u2014:]\s+/)[0]
        ?.replace(/[`"“”*]/g, '')
        .trim(),
    )
    .filter((name): name is string => Boolean(name))
  return [...new Set(names)]
}

// The domains under "## Competitors", one per line. A line that does not
// start with a domain, such as a product name, is left out.
export function contextCompetitors(text: string): string[] {
  const domains = headingLines(text, 'competitors')
    .map((line) => bareDomain(line.split(/\s/)[0]?.replace(/[`<>]/g, '') ?? ''))
    .filter((domain) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain))
  return [...new Set(domains)]
}

// The competitors saved in the business context of a research target, for
// competitors and link_gap, when the target is one of the person's sites.
export async function savedCompetitors(
  input: { action: string; target?: string },
  from: {
    deps: { context?: ContextStore }
    resolveSite: (target: string) => Promise<string>
  },
): Promise<string[]> {
  const { action, target } = input
  const store = from.deps.context
  if (!store || !target || !['competitors', 'link_gap'].includes(action)) {
    return []
  }
  const site = await from.resolveSite(target).catch(() => null)
  const context = site ? await store.read(site) : null
  return context ? contextCompetitors(context.text) : []
}

// The paths listed under "## Conversion pages": a path or URL at the start of
// each line, as a pathname. A path ending in / or * covers every page under
// it; any other path is one page.
export type ConversionPath = { path: string; prefix: boolean }

export function conversionPaths(text: string): ConversionPath[] {
  const paths: ConversionPath[] = []
  for (const line of headingLines(text, 'conversion pages')) {
    const token = line.split(/\s/)[0]?.replace(/[`<>]/g, '')
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

// The page in an issue's subject (a URL, or "query" on a URL).
export const subjectUrl = (subject: string) =>
  subject.match(/https?:\/\/\S+/)?.[0]

// Whether an issue's subject is on a conversion page.
export function onConversionPage(
  subject: string,
  paths: ConversionPath[],
): boolean {
  if (!paths.length) return false
  const url = subjectUrl(subject)
  if (!url) return false
  let pathname: string
  try {
    pathname = trimPath(new URL(url).pathname)
  } catch {
    return false
  }
  return paths.some((page) =>
    page.prefix
      ? pathname === page.path || pathname.startsWith(`${page.path}/`)
      : pathname === page.path,
  )
}

// What the agent follows to write the context. seo next returns it when a
// site has none, or when its context is older than CONTEXT_DAYS.
export function contextGuide(site: string, call: Caller): string {
  return [
    `Write the business context for ${site}, which says what the business sells, who buys it, and which pages turn a visit into a customer. Every later step uses it to put the pages that bring customers first and to judge whether a search fits the product.`,
    `Research it in this order, and stop once each heading below has an answer:`,
    [
      `1. Read the home page, the pricing page and the main product or feature pages (${call('page', { url: '<url>' })} reads one live).`,
      `2. Read the pages and queries that already bring clicks with ${call('report', { site })}.`,
      `3. Find the competitors with ${call('research', { action: 'competitors', target: new URL(originOf(site)).hostname })}, plus the companies the site's own comparison or alternatives pages name. Without a research key, use any SEO tool or signed-in browser the person has.`,
      `4. Read what customers say, where the business has reviews (G2, Capterra, Trustpilot, app stores, Reddit), and note the words buyers use for their problem.`,
    ].join('\n'),
    `Write it in Markdown under these headings, short and factual, at most ${CONTEXT_MAX.toLocaleString('en-US')} characters:`,
    [
      '## What it sells',
      '## Who buys it',
      '## What counts as a conversion',
      'Name the Google Analytics key events that count, such as sign_up, where the site has them.',
      '## Conversion pages',
      'The pages whose main job is to get a visitor to sign up, start a trial, book a demo or buy, and the pricing page. A docs page counts when it is the sign-up or install step itself. Jobs on these pages come first, so name single pages rather than whole sections. One path or URL per line, such as /pricing or /demo. A path ending in / covers every page under it, such as /features/, but / on its own is the home page. Use a section path only when every page there does that job.',
      '## Brand names',
      `The names people type when they look for this business by name, one per line: the product or company name, and the domain as people type it, such as example.com. The reports leave out every search that contains one of these names, with or without a space inside it, so "openbook" also catches "open book". Before you propose a name, list the searches it would catch with ${call('data', { site, query: '<name>' })}. Propose it only when those searches are about this business: the name with words such as login, pricing, app, download or a competitor's name, clicks that land on the home page, or a top position with a high click rate. Leave a name out when it is also the words people use for the product category or the service itself, such as a recipe site called Easy Recipes, because it would hide the searches that bring new customers. The domain alone is enough then. Show the person each name with its evidence and the clicks it would hide, and they confirm or remove them when they reply to the draft.`,
      '## Competitors',
      'One domain per line, then the name buyers use when it differs from the domain, such as example.com Example App.',
      '## Category searches',
      'One RE2 regex for the searches the SEO work should grow, such as (?i)(invoice|billing software). Brand searches are left out of it.',
      '## Tracked searches',
      `Up to ${PROGRESS_LIMITS.searches} buying searches to follow in Google and Search Console, one per line.`,
      '## AI questions',
      `Up to ${PROGRESS_LIMITS.questions} questions buyers ask AI assistants, one per line, to check who the answers cite.`,
      '## Markets',
      'Optional groups of the countries the business cares about, one group per line as a name and three-letter country codes, such as Europe: FRA, BEL, CHE. Reports and Google update results split clicks by these groups. Leave it out for a business that sells in one country.',
      '## Voice',
      '## Notes',
    ].join('\n'),
    `Send the person the draft in one message, with up to three questions on what your research left unsure, such as what counts as a conversion, which customers they want more of, or who they lose deals to. Wait for their reply before you save, even when the site or its code seems to answer everything, because only the person can confirm which customers they want. Change what they correct, then save it with ${call('next', { site, context: '<the Markdown>' })}, which replaces any earlier version and returns the next step.`,
  ].join('\n\n')
}
