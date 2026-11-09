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

// Google's redirect links, which DataForSEO often leaves unresolved.
export const GOTO = /^https?:\/\/(www\.)?google\.[a-z.]+\/goto\b/

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
): { rows: Row[]; overview: AiOverview | null } {
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
  return { rows, overview }
}
