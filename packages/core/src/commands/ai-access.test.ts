import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AiAccessData } from './ai-access.js'
import { runAiAccess } from './ai-access.js'

const ARTICLE = `<!doctype html><html><head><title>Guide</title>
<link rel="alternate" type="text/markdown" href="/guide.md"></head>
<body><nav>Home Pricing Docs Blog About Contact</nav>
<main>${'Real guide text that explains the topic. '.repeat(10)}</main>
<footer>Copyright Example</footer></body></html>`

// A site that blocks one bot by user agent, disallows GPTBot in robots.txt
// and serves its HTML shell at /llms.txt.
const site = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  const agent = new Headers(init?.headers).get('user-agent') ?? ''
  const accept = new Headers(init?.headers).get('accept') ?? ''
  const reply = (body: string, type: string, status = 200) => {
    const response = new Response(body, {
      status,
      headers: { 'content-type': type },
    })
    Object.defineProperty(response, 'url', { value: url.toString() })
    return response
  }
  if (url.pathname === '/robots.txt')
    return reply('User-agent: GPTBot\nDisallow: /\n', 'text/plain')
  if (url.pathname === '/llms.txt')
    return reply('<!doctype html><p>Home</p>', 'text/html')
  if (url.pathname === '/guide.md')
    return reply('# Guide\n\nReal guide text.', 'text/markdown')
  if (agent.includes('PerplexityBot'))
    return reply('<html><body>Access denied</body></html>', 'text/html', 403)
  if (accept === 'text/markdown') return reply(ARTICLE, 'text/html')
  return reply(ARTICLE, 'text/html; charset=utf-8')
}) as typeof fetch

test('compares each bot with the browser and reads robots.txt, llms.txt and Markdown', async () => {
  const result = await runAiAccess({ url: 'https://example.com/guide' }, site)
  const data = result.data as AiAccessData
  const bot = (name: string) => data.bots.find((item) => item.name === name)

  // Words come from <main>, not the navigation or footer.
  assert.equal(data.browser.words, 70)
  assert.deepEqual(
    data.bots.map((item) => [item.name, item.robotsAllowed, item.mainText]),
    [
      ['GPTBot', false, true],
      ['OAI-SearchBot', true, true],
      ['ClaudeBot', true, true],
      ['PerplexityBot', true, false],
    ],
  )
  assert.deepEqual(bot('PerplexityBot')?.differs, ['status', 'text'])
  assert.deepEqual(bot('GPTBot')?.differs, [])
  assert.equal(data.llmsTxt.state, 'html')
  assert.equal(data.markdown.alternate?.state, 'found')
  // /guide.md is the alternate, so it is not requested twice.
  assert.equal(data.markdown.dotMd, null)
  assert.equal(data.markdown.negotiated.state, 'html')
})
