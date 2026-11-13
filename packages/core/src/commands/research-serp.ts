// Rows from one DataForSEO live SERP, for serp and the index check.

type Row = Record<string, string | number | boolean | null>

// An AI Overview on a results page and the pages it links as sources.
// Google's goto links leave a reference's page unknown (url null).
export type AiOverview = {
  keyword: string
  references: {
    domain: string | null
    url: string | null
    title: string | null
  }[]
}

// The People Also Ask questions on a results page, in page order. Google
// now answers most of them with its own AI text (aiAnswer true, no page);
// when a page answers one, its url, domain and title are kept, url null
// behind a Google redirect link.
export type PeopleAlsoAsk = {
  keyword: string
  questions: {
    question: string
    aiAnswer: boolean
    url: string | null
    domain: string | null
    title: string | null
  }[]
}

// Google's redirect links, which DataForSEO often leaves unresolved.
export const GOTO = /^https?:\/\/(www\.)?google\.[a-z.]+\/goto\b/

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '')

// A page as host and path, without scheme, www, query or trailing slash,
// so a real URL and a breadcrumb for the same page give the same key.
export function pageKey(url: string): string {
  try {
    const parsed = new URL(url)
    return `${bare(parsed.hostname)}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return ''
  }
}

// Google's breadcrumb, such as "example.com › docs › flags", as a page key.
// A shortened one (with "...") names no page.
export function hintKey(hint: string): string | null {
  const parts = hint.split('›').map((part) => part.trim())
  if (!parts[0] || parts.some((part) => /^\.\.\.$|…/.test(part))) return null
  return `${bare(parts[0])}${parts.length > 1 ? `/${parts.slice(1).join('/')}` : ''}`.toLowerCase()
}

// The page key serp_overlap compares: the real URL, or else the breadcrumb.
// A breadcrumb of the bare site could be any page on it, so it has none.
export function overlapKey(row: { url?: unknown; url_hint?: unknown }): {
  key: string
  breadcrumb: boolean
} {
  if (typeof row.url === 'string' && row.url) {
    return { key: pageKey(row.url), breadcrumb: false }
  }
  const hint = typeof row.url_hint === 'string' ? hintKey(row.url_hint) : null
  return { key: hint?.includes('/') ? hint : '', breadcrumb: true }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const text = (value: unknown) =>
  typeof value === 'string' && value ? value : null

// The links on a results page, and its AI Overview's sources. position
// counts organic links only (DataForSEO's rank_group); rank_absolute counts
// every block on the page, AI Overviews and People Also Ask included. A
// featured snippet is a link too, so it is kept with its type and no
// organic position.
export function dataForSeoSerp(
  keyword: string,
  items: Record<string, unknown>[],
): {
  rows: Row[]
  overview: AiOverview | null
  questions: PeopleAlsoAsk | null
} {
  const asked = new Map<string, PeopleAlsoAsk['questions'][number]>()
  for (const block of items) {
    if (block.type !== 'people_also_ask') continue
    for (const element of (block.items as Record<string, unknown>[]) ?? []) {
      const question = text(element.title)
      if (!question || asked.has(question.toLowerCase())) continue
      const answer = (
        element.expanded_element as Record<string, unknown>[] | undefined
      )?.[0]
      const page = answer?.type === 'people_also_ask_expanded_element'
      const url = page ? String(answer?.url ?? '') : ''
      const goto = GOTO.test(url)
      asked.set(question.toLowerCase(), {
        question,
        aiAnswer:
          answer?.type === 'people_also_ask_ai_overview_expanded_element',
        url: page && url && !goto ? url : null,
        domain: page
          ? goto
            ? null
            : (text(answer?.domain) ?? (hostOf(url) || null))
          : null,
        title: page ? text(answer?.title) : null,
      })
    }
  }
  const questions = asked.size
    ? { keyword, questions: [...asked.values()].slice(0, 20) }
    : null
  const found = items.find((item) => item.type === 'ai_overview')
  const overview = found
    ? {
        keyword,
        references: (
          (found.references as Record<string, unknown>[] | undefined) ?? []
        )
          .slice(0, 20)
          .map((ref) => {
            const url = String(ref.url ?? '')
            const goto = GOTO.test(url)
            return {
              domain: goto ? null : (text(ref.domain) ?? (hostOf(url) || null)),
              url: goto || !url ? null : url,
              title: text(ref.title),
            }
          }),
      }
    : null
  const rows = items
    .filter(
      (item) => item.type === 'organic' || item.type === 'featured_snippet',
    )
    .map((item) => {
      const row: Row = {
        keyword,
        position: item.type === 'organic' ? Number(item.rank_group) : null,
        rank_absolute: Number(item.rank_absolute),
        type: String(item.type),
        url: text(item.url),
        domain: text(item.domain),
        title: text(item.title),
      }
      // DataForSEO leaves most of Google's goto redirects unresolved, and
      // they resolve only in a browser. The page is then unknown, but
      // Google's breadcrumb still shows the site and the start of the path.
      if (GOTO.test(String(row.url))) {
        const crumb = String(item.breadcrumb ?? '')
        const site = /^https?:\/\/([^/\s›]+)/.exec(crumb)
        row.url = null
        row.domain = site?.[1] ?? null
        row.url_hint = site ? crumb.replace(/^https?:\/\//, '') : null
      }
      return row
    })
  return { rows, overview, questions }
}
