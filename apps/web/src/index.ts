import { Hono } from 'hono'

type Capability = {
  id: string
  label: string
  status: 'ready' | 'next'
  detail: string
}

const app = new Hono()

const capabilities: Capability[] = [
  {
    id: 'gsc',
    label: 'Google Search Console',
    status: 'ready',
    detail: 'Properties, Search Analytics, URL Inspection, and cached history.',
  },
  {
    id: 'ga4',
    label: 'Google Analytics 4',
    status: 'ready',
    detail: 'GA4 Data API report runs for landing-page and event-level joins.',
  },
  {
    id: 'updates',
    label: 'Search Updates',
    status: 'ready',
    detail:
      'Official Google Search Status incidents and ranking update windows.',
  },
  {
    id: 'mcp',
    label: 'Remote MCP',
    status: 'next',
    detail:
      'Authenticated HTTP MCP endpoint backed by stored workspace credentials.',
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    status: 'next',
    detail:
      'Scheduled crawl diffs, index watches, change logs, and alert thresholds.',
  },
]

const html = (body: string) =>
  new Response(`<!doctype html>${body}`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })

const page = (content: string) => `<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SEO</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f8fa;
        --panel: #ffffff;
        --ink: #18202a;
        --muted: #65707d;
        --line: #dce1e7;
        --blue: #255de8;
        --green: #0b7f5d;
        --amber: #9a6300;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font: 14px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      a { color: inherit; text-decoration: none; }
      .app { min-height: 100vh; display: grid; grid-template-columns: 248px 1fr; }
      .sidebar {
        border-right: 1px solid var(--line);
        background: #fff;
        padding: 18px 14px;
      }
      .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; margin: 4px 8px 22px; }
      .mark { width: 28px; height: 28px; border-radius: 7px; background: var(--ink); color: #fff; display: grid; place-items: center; font-size: 13px; }
      .nav { display: grid; gap: 4px; }
      .nav a { padding: 8px 10px; border-radius: 7px; color: var(--muted); font-weight: 600; }
      .nav a.active, .nav a:hover { background: #eef2ff; color: var(--blue); }
      main { padding: 22px; }
      .topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; }
      h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
      .sub { margin: 3px 0 0; color: var(--muted); }
      .button {
        border: 1px solid var(--blue);
        background: var(--blue);
        color: #fff;
        min-height: 36px;
        padding: 8px 12px;
        border-radius: 7px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
      }
      .grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, .8fr); gap: 16px; align-items: start; }
      .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
      .panel h2 { margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--line); font-size: 15px; }
      .rows { display: grid; }
      .row { display: grid; grid-template-columns: 180px 80px 1fr; gap: 12px; padding: 13px 16px; border-bottom: 1px solid var(--line); align-items: start; }
      .row:last-child { border-bottom: 0; }
      .label { font-weight: 700; }
      .status { width: max-content; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 700; }
      .ready { background: #e8f7f1; color: var(--green); }
      .next { background: #fff3d8; color: var(--amber); }
      .detail { color: var(--muted); }
      .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
      .metric { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; min-height: 86px; }
      .metric strong { display: block; font-size: 24px; line-height: 1.1; }
      .metric span { color: var(--muted); }
      .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #f2f4f7; border: 1px solid var(--line); padding: 10px; border-radius: 7px; overflow-x: auto; }
      .stack { display: grid; gap: 16px; }
      @media (max-width: 820px) {
        .app { grid-template-columns: 1fr; }
        .sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
        .grid, .metric-grid { grid-template-columns: 1fr; }
        .row { grid-template-columns: 1fr; gap: 4px; }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="sidebar">
        <div class="brand"><div class="mark">SEO</div><span>SEO</span></div>
        <nav class="nav">
          <a class="active" href="/">Overview</a>
          <a href="/connect">Connections</a>
          <a href="/mcp">MCP</a>
          <a href="/api/health">API health</a>
        </nav>
      </aside>
      <main>${content}</main>
    </div>
  </body>
</html>`

const layout = (
  heading: string,
  subheading: string,
  content: string,
  action = '',
) =>
  page(`<div class="topbar">
    <div>
      <h1>${heading}</h1>
      <p class="sub">${subheading}</p>
    </div>
    ${action}
  </div>
  ${content}`)

const statusRows = () =>
  capabilities
    .map(
      (item) => `<div class="row">
        <div class="label">${item.label}</div>
        <div><span class="status ${item.status}">${item.status}</span></div>
        <div class="detail">${item.detail}</div>
      </div>`,
    )
    .join('')

app.get('/', () =>
  html(
    layout(
      'Workspace overview',
      'The hosted surface for account connection, agent access, and monitoring.',
      `<div class="metric-grid">
        <div class="metric"><strong>3</strong><span>data sources ready</span></div>
        <div class="metric"><strong>11</strong><span>CLI and MCP tools mapped</span></div>
        <div class="metric"><strong>0</strong><span>connected hosted accounts</span></div>
      </div>
      <div class="grid">
        <section class="panel">
          <h2>Product surface</h2>
          <div class="rows">${statusRows()}</div>
        </section>
        <section class="panel">
          <h2>Next connection</h2>
          <div style="padding:16px;display:grid;gap:12px">
            <p class="detail" style="margin:0">The local CLI already handles browser OAuth. Hosted OAuth should use a web client, encrypted refresh-token storage, and workspace-scoped MCP tokens.</p>
            <a class="button" href="/connect">Open connections</a>
          </div>
        </section>
      </div>`,
    ),
  ),
)

app.get('/connect', () =>
  html(
    layout(
      'Connections',
      'Google account connection will live here for the hosted version.',
      `<section class="panel">
        <h2>Google OAuth path</h2>
        <div class="rows">
          <div class="row"><div class="label">1. Google sign-in</div><div><span class="status next">next</span></div><div class="detail">Use a web OAuth client with Search Console and GA4 readonly scopes.</div></div>
          <div class="row"><div class="label">2. Property mapping</div><div><span class="status next">next</span></div><div class="detail">Map GSC sites and GA4 properties into one workspace view.</div></div>
          <div class="row"><div class="label">3. Agent access</div><div><span class="status next">next</span></div><div class="detail">Issue workspace MCP tokens without exposing Google tokens to clients.</div></div>
        </div>
      </section>`,
    ),
  ),
)

app.get('/mcp', () =>
  html(
    layout(
      'Remote MCP',
      'A future HTTP MCP endpoint can use the same core through DB-backed providers.',
      `<div class="stack">
        <section class="panel">
          <h2>Client config shape</h2>
          <div style="padding:16px">
            <pre class="code">{
  "mcpServers": {
    "seo": {
      "url": "https://seo.example.com/mcp",
      "headers": {
        "Authorization": "Bearer sk_seo_..."
      }
    }
  }
}</pre>
          </div>
        </section>
        <section class="panel">
          <h2>Runtime split</h2>
          <div class="rows">
            <div class="row"><div class="label">CredentialsProvider</div><div><span class="status next">hosted</span></div><div class="detail">Read encrypted Google tokens for the authenticated workspace.</div></div>
            <div class="row"><div class="label">StorageAdapter</div><div><span class="status next">hosted</span></div><div class="detail">Persist changes, crawl diffs, cached reports, and scheduled monitor state.</div></div>
          </div>
        </section>
      </div>`,
    ),
  ),
)

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'seo-web',
    version: '0.1.0',
  }),
)

app.get('/api/capabilities', (c) =>
  c.json({
    capabilities,
  }),
)

app.get(
  '/favicon.ico',
  () =>
    new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#18202a"/><text x="16" y="20" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="10" font-weight="700">SEO</text></svg>',
      {
        headers: {
          'cache-control': 'public, max-age=86400',
          'content-type': 'image/svg+xml',
        },
      },
    ),
)

export default app
