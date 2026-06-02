import { Hono } from 'hono'
import { capabilities } from './capabilities.js'
import { favicon, html } from './html.js'
import { connectPage, mcpPage, overviewPage } from './pages.js'

const app = new Hono()

app.get('/', () => html(overviewPage()))

app.get('/connect', () => html(connectPage()))

app.get('/mcp', () => html(mcpPage()))

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

app.get('/favicon.ico', favicon)

export default app
