import assert from 'node:assert/strict'
import { test } from 'node:test'
import Defuddle from 'defuddle'
import { parseHTML } from 'linkedom'
import { renderAgentMarkdown } from './render.js'

const html = `<!doctype html><html lang="en"><head>
  <title>SEO Skill</title>
  <meta name="description" content="Run local SEO reports with your agent.">
  <link rel="canonical" href="https://seoskill.dev/">
</head><body>
  <nav>Docs</nav>
  <main data-agent-content>
    <h1 aria-label="The only SEO skill your agent needs"><span aria-hidden="true">The on1y</span></h1>
    <p>Use your own crawl data to find the next fix.</p>
    <div data-agent-markdown="exclude"><p>Animated demo noise</p></div>
    <h2>Install</h2><pre><code>seo start</code></pre>
  </main>
  <footer>Footer</footer>
</body></html>`

test('the owned-page converter beats heuristic extraction on the site contract', () => {
  const direct = renderAgentMarkdown(html, 'https://seoskill.dev/')
  const { document } = parseHTML(html)
  const DefuddleConstructor = Defuddle as unknown as new (
    document: never,
    options: { url: string; useAsync: false },
  ) => { parse(): { content?: string } }
  const heuristic = new DefuddleConstructor(document as never, {
    url: 'https://seoskill.dev/',
    useAsync: false,
  }).parse()
  const heuristicContent = heuristic.content ?? ''

  assert.match(direct.markdown, /^# The only SEO skill your agent needs$/mu)
  assert.doesNotMatch(direct.markdown, /Animated demo noise/u)

  assert.doesNotMatch(heuristicContent, /The only SEO skill your agent needs/u)
  assert.match(heuristicContent, /Animated demo noise/u)
})
