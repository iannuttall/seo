import { capabilities } from './capabilities.js'
import { layout } from './html.js'

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

export const overviewPage = () =>
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
  )

export const connectPage = () =>
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
  )

export const mcpPage = () =>
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
  )
