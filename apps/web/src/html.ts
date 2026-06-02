export const html = (body: string) =>
  new Response(`<!doctype html>${body}`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })

export const page = (content: string) => `<html lang="en">
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

export const layout = (
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

export const favicon = () =>
  new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#18202a"/><text x="16" y="20" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="10" font-weight="700">SEO</text></svg>',
    {
      headers: {
        'cache-control': 'public, max-age=86400',
        'content-type': 'image/svg+xml',
      },
    },
  )
