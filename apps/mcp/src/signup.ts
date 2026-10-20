// Where a new person came from, kept once at sign-up (migrations/
// 0003_signup_sources.sql), to see which paths bring people. Never an IP
// address, country or email.

export type SignupEntry = 'mcp' | 'web' | 'cli'

export type SignupSource = {
  entry: SignupEntry
  client: string | null
  clientName: string | null
  userAgent: string | null
  referrerHost: string | null
  landingPath: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
}

// The site's first-visit cookie. apps/web/src/layouts/BaseLayout.astro sets
// it on seoskill.dev pages, once, as URL-encoded r, p, s, m and c.
export const FIRST_TOUCH_COOKIE = 'seo_first'

// Agents the CLI can name in a `seo login` start request.
const CLI_AGENTS = new Set(['claude-code', 'cursor', 'codex'])

// Printable text without control characters, cut to max, or null.
export function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strips them
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return text ? text.slice(0, max) : null
}

export function cliAgent(value: unknown): string | null {
  return typeof value === 'string' && CLI_AGENTS.has(value) ? value : null
}

export function userAgentOf(request: Request): string | null {
  return clip(request.headers.get('user-agent'), 200)
}

function host(value: string | null): string | null {
  const text = value?.toLowerCase() ?? ''
  return /^[a-z0-9.-]{1,253}$/.test(text) ? text : null
}

function path(value: string | null): string | null {
  const text = clip(value, 200)?.split(/[?#]/)[0]
  return text?.startsWith('/') ? text : null
}

type FirstTouch = Pick<
  SignupSource,
  'referrerHost' | 'landingPath' | 'utmSource' | 'utmMedium' | 'utmCampaign'
>

// The site's first visit from the seo_first cookie, or nulls without one.
export function firstTouch(request: Request): FirstTouch {
  const raw = request.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${FIRST_TOUCH_COOKIE}=`))
    ?.slice(FIRST_TOUCH_COOKIE.length + 1)
  const params = new URLSearchParams(raw?.slice(0, 1000) ?? '')
  return {
    referrerHost: host(params.get('r')),
    landingPath: path(params.get('p')),
    utmSource: clip(params.get('s'), 80),
    utmMedium: clip(params.get('m'), 80),
    utmCampaign: clip(params.get('c'), 80),
  }
}
