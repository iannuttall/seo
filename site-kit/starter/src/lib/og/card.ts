// The sharing image for one page, as HTML for Takumi: the page H1 on a
// plain background, with the site name above and the domain below.
export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
}

function decode(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, code: string) => {
      if (code.startsWith('#')) {
        const hex = code[1]?.toLowerCase() === 'x'
        return String.fromCodePoint(
          hex ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1)),
        )
      }
      return ENTITIES[code.toLowerCase()] ?? match
    },
  )
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The first H1 of a built page as plain text. Null when there is none.
export function readH1(html: string): string | null {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  if (!match?.[1]) return null
  const text = decode(match[1].replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
  return text || null
}

// The site's light theme from src/styles/globals.css, in hex for the
// renderer, and the same mark as src/components/Logo.astro. Change them
// here when the theme changes.
const colors = {
  surface: '#fafafa',
  text: '#171717',
  faint: '#808080',
  primary: '#0092b8',
}

export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="${colors.text}"><path d="M16 3c-4 5-7 9-7 13a7 7 0 0 0 6 6.9V29h2v-6.1A7 7 0 0 0 23 16c0-4-3-8-7-13z"/></svg>`

// Longer headings step down so three lines always fit.
function titleSize(length: number): number {
  if (length > 60) return 60
  if (length > 36) return 70
  return 80
}

// The page's own path, cut to one line.
function cardPath(path: string): string {
  if (path === '/') return ''
  return path.length > 48 ? `${path.slice(0, 47)}\u2026` : path
}

// The mark at the top, the page H1 in the middle and the address at the
// bottom.
export function ogCardHtml(input: {
  title: string
  domain: string
  path: string
}): string {
  return `<div style="width:${OG_WIDTH}px;height:${OG_HEIGHT}px;display:flex;flex-direction:column;justify-content:space-between;padding:72px;background-color:${colors.surface};color:${colors.text};font-family:Inter">
  <img src="mark.svg" width="64" height="64" alt="" />
  <h1 style="margin:0;max-width:1000px;font-size:${titleSize(input.title.length)}px;font-weight:600;line-height:1.08;letter-spacing:-2.4px;text-wrap:balance;line-clamp:3">${escapeHtml(input.title)}</h1>
  <div style="display:flex;font-family:JetBrains Mono;font-size:26px;color:${colors.faint}"><span style="color:${colors.primary};font-weight:700">${escapeHtml(input.domain)}</span>${escapeHtml(cardPath(input.path))}</div>
</div>`
}
