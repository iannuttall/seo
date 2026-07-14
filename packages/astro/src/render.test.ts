import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderAgentMarkdown } from './render.js'

type Fixture = {
  expected: string
  html: string
  name: string
  url: string
}

const fixtures: Fixture[] = [
  {
    name: 'home hero and excluded visual demo',
    url: 'https://seoskill.dev/',
    html: `<!doctype html>
      <html lang="en"><head>
        <title>SEO Skill</title>
        <meta name="description" content="Run local SEO reports with your agent.">
        <link rel="canonical" href="https://seoskill.dev/">
      </head><body>
        <nav><a href="/docs">Docs</a></nav>
        <main data-agent-content>
          <h1 aria-label="The only SEO skill your agent needs"><span aria-hidden="true">The on1y</span></h1>
          <p>Use your own crawl data to find the next fix.</p>
          <div data-agent-markdown="exclude"><svg><path d="x"></path></svg><p>Animated demo noise</p></div>
          <h2>Install the CLI</h2>
          <pre><code class="language-sh">npm i -g seo\nseo start\n</code></pre>
        </main>
        <footer>Footer noise</footer>
      </body></html>`,
    expected: `---
title: "SEO Skill"
description: "Run local SEO reports with your agent."
canonical: "https://seoskill.dev/"
language: "en"
---

# The only SEO skill your agent needs

Use your own crawl data to find the next fix.

## Install the CLI

\`\`\`sh
npm i -g seo
seo start
\`\`\`
`,
  },
  {
    name: 'docs code, table, list, image, and disclosure',
    url: 'https://seoskill.dev/docs/getting-started',
    html: `<!doctype html>
      <html lang="en"><head>
        <title>Getting started | SEO Skill</title>
        <meta name="description" content="Install SEO Skill and run your first report.">
        <link rel="canonical" href="https://seoskill.dev/docs/getting-started">
      </head><body><main>
        <nav aria-label="Breadcrumb"><a href="/">Home</a></nav>
        <h1>Getting started</h1>
        <p>Install the package, then connect a site.</p>
        <ol><li>Install it.<ul><li>Use Node 22 or newer.</li></ul></li><li>Run setup.</li></ol>
        <pre><code class="language-sh">npm i -g seo\nseo start\n</code></pre>
        <table><thead><tr><th>Step</th><th>Result</th></tr></thead><tbody><tr><td>Install</td><td>CLI ready</td></tr></tbody></table>
        <details open><summary>Does setup change my site?</summary><p>No. It saves local configuration.</p></details>
        <img src="/images/setup.png" alt="The setup screen">
      </main></body></html>`,
    expected: `---
title: "Getting started | SEO Skill"
description: "Install SEO Skill and run your first report."
canonical: "https://seoskill.dev/docs/getting-started"
language: "en"
---

# Getting started

Install the package, then connect a site.

1.  Install it.
    -   Use Node 22 or newer.
2.  Run setup.

\`\`\`sh
npm i -g seo
seo start
\`\`\`

| Step | Result |
| --- | --- |
| Install | CLI ready |

Does setup change my site?

No. It saves local configuration.

![The setup screen](https://seoskill.dev/images/setup.png)
`,
  },
  {
    name: 'report page keeps every usage panel',
    url: 'https://seoskill.dev/docs/reports/site-crawl',
    html: `<!doctype html>
      <html lang="en"><head>
        <title>Technical SEO site crawl audit | SEO Skill</title>
        <meta name="description" content="Crawl a site and save the technical evidence.">
        <link rel="canonical" href="https://seoskill.dev/docs/reports/site-crawl">
      </head><body><main>
        <h1>Technical SEO site crawl audit</h1>
        <p>Crawl every reachable page within the limits you choose.</p>
        <div role="tablist" data-agent-markdown="exclude"><button>CLI</button><button>MCP</button><button>TypeScript</button></div>
        <section><h2>CLI</h2><pre><code class="language-sh">seo crawl https://example.com --save\n</code></pre></section>
        <section hidden><h2>MCP</h2><p>Ask your MCP client to run <code>site-crawl</code>.</p></section>
        <section hidden><h2>TypeScript</h2><pre><code class="language-ts">await runReport('site-crawl')\n</code></pre></section>
        <aside><h2>Related report</h2><a href="./audit-page">Audit one page</a></aside>
        <button data-code-copy><svg></svg>Copy</button>
      </main></body></html>`,
    expected: `---
title: "Technical SEO site crawl audit | SEO Skill"
description: "Crawl a site and save the technical evidence."
canonical: "https://seoskill.dev/docs/reports/site-crawl"
language: "en"
---

# Technical SEO site crawl audit

Crawl every reachable page within the limits you choose.

## CLI

\`\`\`sh
seo crawl https://example.com --save
\`\`\`

## MCP

Ask your MCP client to run \`site-crawl\`.

## TypeScript

\`\`\`ts
await runReport('site-crawl')
\`\`\`

## Related report

[Audit one page](https://seoskill.dev/docs/reports/audit-page)
`,
  },
  {
    name: 'tabbed code page retains tab labels as headings',
    url: 'https://seoskill.dev/docs/typescript',
    html: `<!doctype html>
      <html lang="en"><head>
        <title>SEO TypeScript package | SEO Skill</title>
        <meta name="description" content="Run SEO reports from a TypeScript application.">
        <link rel="canonical" href="https://seoskill.dev/docs/typescript">
      </head><body><main>
        <h1>SEO TypeScript package</h1>
        <p>Use the same report definitions in application code.</p>
        <section><h2>Import the package</h2><pre><code class="language-ts">import { createSeo } from 'seo'\n</code></pre></section>
        <section hidden><h2>Handle the result</h2><pre><code class="language-ts">const result = await seo.run()\n</code></pre></section>
      </main></body></html>`,
    expected: `---
title: "SEO TypeScript package | SEO Skill"
description: "Run SEO reports from a TypeScript application."
canonical: "https://seoskill.dev/docs/typescript"
language: "en"
---

# SEO TypeScript package

Use the same report definitions in application code.

## Import the package

\`\`\`ts
import { createSeo } from 'seo'
\`\`\`

## Handle the result

\`\`\`ts
const result = await seo.run()
\`\`\`
`,
  },
  {
    name: 'legal content remains readable',
    url: 'https://seoskill.dev/privacy',
    html: `<!doctype html>
      <html lang="en"><head>
        <title>Privacy | SEO Skill</title>
        <meta name="description" content="How SEO Skill handles data.">
        <meta name="robots" content="noindex, follow">
        <link rel="canonical" href="https://seoskill.dev/privacy">
      </head><body><main><article>
        <h1>Privacy</h1>
        <p>The CLI stores report data on your machine.</p>
        <h2>Questions</h2>
        <p>Open a <a href="https://github.com/iannuttall/seo/issues">GitHub issue</a>.</p>
      </article></main></body></html>`,
    expected: `---
title: "Privacy | SEO Skill"
description: "How SEO Skill handles data."
canonical: "https://seoskill.dev/privacy"
language: "en"
---

# Privacy

The CLI stores report data on your machine.

## Questions

Open a [GitHub issue](https://github.com/iannuttall/seo/issues).
`,
  },
]

for (const fixture of fixtures) {
  test(`golden Markdown: ${fixture.name}`, () => {
    const first = renderAgentMarkdown(fixture.html, fixture.url)
    const second = renderAgentMarkdown(fixture.html, fixture.url)

    assert.equal(first.markdown, fixture.expected)
    assert.deepEqual(second, first)
    assert.equal(
      first.tokenEstimate,
      Math.ceil(Buffer.byteLength(first.markdown) / 4),
    )
    assert.equal((first.markdown.match(/^#\s+/gmu) ?? []).length, 1)
    assert.doesNotMatch(first.markdown, /<(?:svg|script|style|canvas)\b/iu)
    assert.ok(first.markdown.endsWith('\n'))
    assert.ok(!first.markdown.endsWith('\n\n'))
  })
}

test('rejects a page without a stable content root', () => {
  assert.throws(
    () =>
      renderAgentMarkdown(
        '<html><head><title>Redirect</title><meta name="description" content="Redirect"><link rel="canonical" href="https://seoskill.dev/docs"></head><body></body></html>',
        'https://seoskill.dev/old-docs',
      ),
    /Missing main or \[data-agent-content\] content root/u,
  )
})
