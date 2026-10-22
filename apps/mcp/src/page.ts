// One small HTML page for the sign-in steps, in the seoskill.dev design: the
// same Inter font, colours and logo as the site.

const LOGO = `<svg viewBox="116 70 730 694" aria-hidden="true"><path d="M350.963 300 L569.873 300 L569.873 301.646 L607.572 301.646 A223.005 222.797 0 0 1 830.577 524.443 A223.005 223.562 0 0 1 607.572 748.005 L432.5 748.005 C419.146 748.005 402.821 730.609 402.821 716.5 L402.821 525.14 L350.963 525.14 Z"/><path d="M351.663 78.757 L540 78.757 C554.614 78.757 570.373 95.892 570.373 110.5 L570.373 301.599 L351.663 301.599 L351.663 524.54 A222.919 222.919 0 0 1 128.744 301.621 A222.919 222.864 0 0 1 351.663 78.757 Z"/><path d="M615.373 78.657 L814.008 78.657 C833.382 78.657 845.678 101.744 837.508 115.896 L737.067 289.633 C727.659 305.929 702.019 306.871 691.587 288.802 L591.873 115.896 C583.703 101.744 595.999 78.657 615.373 78.657 Z"/><path d="M353.141 748.251 L154.906 748.251 C135.532 748.251 123.236 725.164 131.406 711.012 L225.797 545.373 C240.447 519.998 264.091 515.719 280.567 544.257 L376.641 711.012 C384.812 725.164 372.515 748.251 353.141 748.251 Z"/></svg>`
export function page(
  title: string,
  body: string,
  status = 200,
  setCookie?: string,
): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
@font-face { font-family: "InterVariable"; src: url("/fonts/InterVF.woff2") format("woff2"); font-display: swap; font-weight: 100 900; }
:root {
  color-scheme: light dark;
  --background: oklch(98.5% 0 0); --card: oklch(100% 0 0); --subtle: oklch(96% 0 0);
  --foreground: oklch(20.5% 0 0); --muted: oklch(45% 0 0); --border: oklch(92% 0 0);
  --primary: oklch(60.9% 0.126 221.723); --primary-hover: oklch(54% 0.13 221.723); --on-primary: oklch(98.5% 0 0);
  --radius: 0.625rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(20.5% 0 0); --card: oklch(24% 0 0); --subtle: oklch(17% 0 0);
    --foreground: oklch(98.5% 0 0); --muted: oklch(72% 0 0); --border: oklch(28% 0 0);
    --primary: oklch(78.9% 0.154 211.53); --primary-hover: oklch(72% 0.16 211.53); --on-primary: oklch(15% 0.05 211.53);
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--background); color: var(--foreground); font: 16px/1.6 "InterVariable", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
header { max-width: 30rem; margin: 0 auto; padding: 2rem 16px 0; }
header a { display: inline-flex; align-items: center; gap: 0.5rem; color: inherit; text-decoration: none; font-weight: 600; }
header svg { width: 1.5rem; height: 1.5rem; fill: currentColor; }
main { max-width: 30rem; margin: 3rem auto 4rem; padding: 1.75rem; background: var(--card); border: 1px solid var(--border); border-radius: calc(var(--radius) + 4px); }
@media (max-width: 34rem) { main { margin: 2rem 16px; padding: 1.25rem; } }
h1 { font-size: 1.375rem; line-height: 1.3; letter-spacing: -0.01em; margin: 0 0 0.75rem; }
h2 { font-size: 1rem; margin: 1.5rem 0 0.5rem; }
p { margin: 0 0 0.75rem; }
a { color: var(--primary); }
button { width: 100%; margin: 1rem 0 0.75rem; padding: 0.7rem 1rem; border: 0; border-radius: var(--radius); background: var(--primary); color: var(--on-primary); font: inherit; font-weight: 600; cursor: pointer; }
button:hover { background: var(--primary-hover); }
.small { color: var(--muted); font-size: 0.875rem; }
details { margin: 1rem 0; padding: 0.75rem 1rem; background: var(--subtle); border-radius: var(--radius); }
summary { cursor: pointer; font-weight: 600; font-size: 0.95rem; }
label { display: block; margin: 0.75rem 0; font-size: 0.875rem; color: var(--muted); }
input { display: block; width: 100%; margin-top: 0.25rem; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: var(--card); color: var(--foreground); font: inherit; }
input:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
ul { list-style: none; margin: 0 0 0.5rem; padding: 0; }
li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
form.inline { display: inline; }
button.link { width: auto; margin: 0; padding: 0; background: none; color: var(--primary); font-weight: 500; }
button.secondary { background: var(--subtle); color: var(--foreground); }
button.danger { background: oklch(57.7% 0.215 27.325); color: oklch(98.5% 0 0); }
.notice { padding: 0.75rem 1rem; background: var(--subtle); border-radius: var(--radius); }
.saved { color: var(--primary); font-weight: 600; }
</style>
</head>
<body><header><a href="/" aria-label="SEO Skill home">${LOGO}<span>SEO Skill</span></a></header><main>${body}</main></body>
</html>`
  return new Response(html, {
    status,
    headers: {
      ...(setCookie ? { 'set-cookie': setCookie } : {}),
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self' https://accounts.google.com https://www.bing.com; frame-ancestors 'none'; base-uri 'none'",
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    },
  })
}

// The page state the site's account shell shows. See
// apps/web/src/pages/account-shell.astro.
export type View =
  | { view: 'connect'; connect: { client: string; host: string; flow: string } }
  | { view: 'signin'; message?: string; link?: string }
  | { view: 'notice'; notice: { title: string; text: string } }
  | {
      view: 'account'
      message?: string
      // The message reports a failure.
      error?: boolean
      account: {
        form: string
        google: { email: string; subject: string }[]
        bing: { label: string; subject: string }[]
        bingReady: boolean
        keys: string[]
        // Saved Clicky sites; the domain is null when Clicky had no pages.
        // account is true for a site that came from the Clicky account.
        clicky: { siteId: string; domain: string | null; account: boolean }[]
        // The saved Clicky account's username, never its password.
        clickyAccount: string | null
        // Machines linked with `seo login`.
        machines: { id: string; label: string; usedAt: number | null }[]
        // A `seo login` waiting for this person to approve it.
        login?: { code: string; label: string }
        // Beta features granted to this account. Absent when there are none.
        beta?: { id: string; title: string; text: string }[]
        // The weekly-audit beta's sites, from D1 only.
        audit?: {
          max: number
          sites: {
            property: string
            lastFinishedAt: number | null
            lastStatus: string | null
            pages: number | null
            open: number | null
            new: number | null
            error: string | null
          }[]
        }
        // Alert settings, for an account with a beta that has alerts.
        alerts?: {
          // Where alert email goes: the first linked Google account.
          email: string | null
          types: {
            id: string
            title: string
            text: string
            email: boolean
            webhook: boolean
          }[]
          webhookUrl: string | null
          webhookSecret: string | null
          webhookLast: { at: number; result: string } | null
          // This account's alert emails waiting for the next day's limit.
          held: number
        }
        // A token just made for a cloud agent, shown once.
        token?: string
        // The tab to open: accounts, keys, machines or settings.
        tab?: string
      }
    }

// The account and connect pages in the site design: the site Worker's
// /account-shell page with this page's state added. Falls back to the plain
// page when the site cannot be reached.
export async function view(
  env: Env,
  state: View,
  status = 200,
  setCookie?: string,
): Promise<Response> {
  const base = new URL(env.PUBLIC_URL).pathname.replace(/\/$/, '')
  const shell = await env.SITE?.fetch(
    new Request(new URL('/account-shell', env.PUBLIC_URL)),
  ).catch(() => null)
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'content-security-policy': "frame-ancestors 'none'; base-uri 'none'",
    ...(setCookie ? { 'set-cookie': setCookie } : {}),
  }
  if (!shell?.ok) return fallback(state, status, setCookie)
  // "<" is escaped so the JSON can never close its script element.
  const json = JSON.stringify({ ...state, base }).replaceAll('<', '\\u003c')
  const html = (await shell.text()).replace(
    '</body>',
    `<script type="application/json" id="seo-state">${json}</script></body>`,
  )
  return new Response(html, { status, headers })
}

function fallback(state: View, status: number, setCookie?: string): Response {
  const text =
    state.view === 'notice'
      ? `<h1>${escapeText(state.notice.title)}</h1><p>${escapeText(state.notice.text)}</p>`
      : '<h1>SEO Skill</h1><p>This page could not load. Try again in a minute.</p>'
  return page('SEO Skill', text, status, setCookie)
}

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
