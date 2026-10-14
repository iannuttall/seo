// One small HTML page for the sign-in steps.
export function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
:root { color-scheme: light dark; --bg: #fafaf9; --fg: #1c1917; --muted: #57534e; --accent: #1c1917; --on-accent: #fafaf9; }
@media (prefers-color-scheme: dark) { :root { --bg: #0c0a09; --fg: #f5f5f4; --muted: #a8a29e; --accent: #f5f5f4; --on-accent: #0c0a09; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, sans-serif; }
main { max-width: 32rem; margin: 12vh auto; padding: 0 16px; }
h1 { font-size: 1.5rem; margin: 0 0 1rem; }
a { color: inherit; }
button { margin: 0.5rem 0 1rem; padding: 0.7rem 1.2rem; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 600; cursor: pointer; }
.small { color: var(--muted); font-size: 0.9rem; }
details { margin: 1rem 0; }
summary { cursor: pointer; font-weight: 600; }
label { display: block; margin: 0.6rem 0; font-size: 0.9rem; }
input { display: block; width: 100%; box-sizing: border-box; margin-top: 0.2rem; padding: 0.5rem; border: 1px solid var(--muted); border-radius: 6px; background: transparent; color: inherit; font: inherit; }
</style>
</head>
<body><main>${body}</main></body>
</html>`
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'",
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    },
  })
}
