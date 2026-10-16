import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appRoot, '../..')
const dist = resolve(appRoot, 'dist')
const { reportCommands, reportIds } = await import(
  resolve(appRoot, 'src/content/telemetry/report-ids.mjs')
)
const { tools } = await import(
  resolve(appRoot, 'src/content/tools/manifest.mjs')
)
const { docsPaths } = await import(resolve(appRoot, 'src/content/docs-nav.mjs'))
const pagePath = (path) =>
  path === '/' ? 'index.html' : `${path.slice(1)}/index.html`
const expectedPages = new Map([
  ['index.html', 'https://seoskill.dev'],
  ...[
    '/features',
    '/features/mcp',
    '/features/search-console',
    '/features/keyword-research',
    '/features/seo-audit',
  ].map((path) => [pagePath(path), `https://seoskill.dev${path}`]),
  ['tools/index.html', 'https://seoskill.dev/tools'],
  ...tools.map((tool) => [
    `${tool.path.slice(1)}/index.html`,
    `https://seoskill.dev${tool.path}`,
  ]),
  ...docsPaths.map((path) => [pagePath(path), `https://seoskill.dev${path}`]),
  ['stats/index.html', 'https://seoskill.dev/stats'],
  ['telemetry/index.html', 'https://seoskill.dev/telemetry'],
  ['privacy/index.html', 'https://seoskill.dev/privacy'],
  ['terms/index.html', 'https://seoskill.dev/terms'],
  ['cookies/index.html', 'https://seoskill.dev/cookies'],
  ['404.html', 'https://seoskill.dev/404'],
])
const discoverySchema =
  'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

function matches(html, pattern) {
  return [...html.matchAll(pattern)]
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function walkFiles(directory, predicate) {
  const files = []
  const pending = [directory]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && predicate(path)) files.push(path)
    }
  }
  return files.sort()
}

test('build contains every public route with one complete SEO contract', () => {
  for (const [relativePath, canonical] of expectedPages) {
    const file = resolve(dist, relativePath)
    assert.ok(existsSync(file), `Missing built page ${relativePath}`)
    const html = readFileSync(file, 'utf8')
    const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ''

    assert.equal(
      matches(head, /<title>[^<]+<\/title>/g).length,
      1,
      relativePath,
    )
    assert.equal(
      matches(head, /<meta name="description" content="[^"]+"\s*\/?>/g).length,
      1,
      relativePath,
    )
    assert.equal(
      matches(head, /<link rel="canonical" href="[^"]+"\s*\/?>/g).length,
      1,
      relativePath,
    )
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="${canonical}"\\s*/?>`),
    )
    assert.match(html, /<meta property="og:title" content="[^"]+"\s*\/?>/)
    // Each page's sharing card is a file in the build, the same for X.
    const ogImage = /<meta property="og:image" content="([^"]+)"/.exec(
      html,
    )?.[1]
    assert.ok(ogImage, `${relativePath} og:image`)
    assert.ok(
      existsSync(resolve(dist, `.${new URL(ogImage).pathname}`)),
      `${relativePath} card`,
    )
    assert.match(
      html,
      new RegExp(
        `<meta name="twitter:image" content="${escapeRegExp(ogImage)}"\\s*/?>`,
      ),
    )
    assert.match(
      html,
      /<meta name="twitter:card" content="summary_large_image"\s*\/?>/,
    )

    const schemaMatch = html.match(
      /<script type="application\/ld\+json">(.+?)<\/script>/,
    )
    assert.ok(schemaMatch, `Missing JSON-LD in ${relativePath}`)
    assert.doesNotThrow(() => JSON.parse(schemaMatch[1]), relativePath)
  }
})

test('internal links in the built pages are relative', () => {
  // Canonical, Open Graph and JSON-LD URLs live in <head> and stay absolute,
  // as do the sitemap, llms.txt and Markdown copies. Copyable commands are
  // text, not links. Every link a person clicks on the site is a path.
  const absolute = /<a\b[^>]*\shref="https?:\/\/(?:www\.)?seoskill\.dev[^"]*"/g
  const failures = []
  for (const file of walkFiles(dist, (path) => path.endsWith('.html'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(absolute)) {
      failures.push(`${file.slice(dist.length + 1)}: ${match[0]}`)
    }
  }
  assert.deepEqual(failures, [])
  assert.doesNotMatch(
    readFileSync(resolve(dist, 'docs/keys/index.html'), 'utf8'),
    /mcp\/keys/,
  )
})

test('built text keeps a space around inline elements', () => {
  // A source line that ends in text and a next line that starts with an
  // inline element (or the reverse) can lose the space between them. Scan
  // the visible markup and the Markdown copies for words that touch.
  const inline = 'a|code|strong|em|span|b|i'
  const opening = new RegExp(`[A-Za-z0-9.,;:)]<(?:${inline})[\\s>]`, 'g')
  const closing = new RegExp(`</(?:${inline})>[A-Za-z0-9(]`, 'g')
  const failures = []

  for (const file of walkFiles(dist, (path) => path.endsWith('.html'))) {
    const visible = readFileSync(file, 'utf8').replace(
      /<(script|style|pre|template|svg|textarea|head)\b[\s\S]*?<\/\1>/g,
      '',
    )
    for (const pattern of [opening, closing]) {
      for (const match of visible.matchAll(pattern)) {
        failures.push(
          `${file.slice(dist.length + 1)}: ${visible.slice(Math.max(0, match.index - 30), match.index + 30)}`,
        )
      }
    }
  }

  const markdownJoins =
    /[A-Za-z0-9.,;:)]\[[^\]\n]+\]\(|\]\([^)\s]+\)(?:[A-Za-z0-9(]|\[(?!\s))|[A-Za-z0-9]`[^`\s]+`|`[^`\s]+`[A-Za-z0-9(]/g
  const markdownFiles = [
    ...walkFiles(dist, (path) => path.endsWith('.md')),
    resolve(dist, 'llms.txt'),
  ]
  for (const file of markdownFiles) {
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '')
    for (const match of text.matchAll(markdownJoins)) {
      failures.push(
        `${file.slice(dist.length + 1)}: ${text.slice(Math.max(0, match.index - 30), match.index + 30)}`,
      )
    }
  }

  assert.deepEqual(failures, [])
})

test('legal and error pages are noindex but remain crawlable', () => {
  for (const page of ['privacy', 'terms', 'cookies']) {
    const html = readFileSync(resolve(dist, page, 'index.html'), 'utf8')
    assert.match(html, /<meta name="robots" content="noindex, follow">/)
  }

  const notFound = readFileSync(resolve(dist, '404.html'), 'utf8')
  assert.match(notFound, /<meta name="robots" content="noindex, follow">/)
  assert.doesNotMatch(
    readFileSync(resolve(dist, 'robots.txt'), 'utf8'),
    /Disallow:/,
  )
})

test('every content page has one deterministic Markdown alternative', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(dist, 'agent-routes.json'), 'utf8'),
  )
  const manifestPaths = manifest.pages.map((page) => page.htmlPath)
  const representedHtml = walkFiles(dist, (file) => file.endsWith('.html'))
    .filter((file) =>
      /<link rel="alternate" type="text\/markdown" href="[^"]+">/.test(
        readFileSync(file, 'utf8'),
      ),
    )
    .map((file) => file.slice(dist.length + 1))

  assert.equal(manifest.version, 1)
  assert.equal(manifest.site, 'https://seoskill.dev')
  assert.equal(manifest.pages.length, representedHtml.length)
  assert.deepEqual(manifestPaths, [...manifestPaths].sort())
  assert.equal(
    manifest.pages.filter((page) => page.htmlPath.startsWith('/docs/reports/'))
      .length,
    0,
  )
  assert.deepEqual(
    manifest.pages.filter((page) => page.noindex).map((page) => page.htmlPath),
    ['/account', '/cookies', '/privacy', '/terms'],
  )
  assert.equal(representedHtml.length, manifest.pages.length)

  for (const page of manifest.pages) {
    const markdown = readFileSync(resolve(dist, page.markdownFile), 'utf8')
    const html = readFileSync(resolve(dist, page.htmlFile), 'utf8')
    const markdownUrl = new URL(page.markdownPath, manifest.site).toString()

    assert.equal(Buffer.byteLength(markdown), page.bytes, page.markdownFile)
    assert.equal(Math.ceil(page.bytes / 4), page.tokens, page.markdownFile)
    assert.equal(
      createHash('sha256').update(markdown).digest('hex'),
      page.sha256,
      page.markdownFile,
    )
    assert.match(
      markdown,
      /^---\ntitle: .+\ndescription: .+\ncanonical: .+\nlanguage: .+\n---\n/u,
      page.markdownFile,
    )
    assert.equal(matches(markdown, /^#\s+.+$/gmu).length, 1, page.markdownFile)
    assert.doesNotMatch(
      markdown,
      /<(?:script|style|svg|canvas)\b|Runafter|data-agent-markdown/iu,
      page.markdownFile,
    )
    assert.equal(
      matches(
        html,
        /<link rel="alternate" type="text\/markdown" href="[^"]+">/gu,
      ).length,
      1,
      page.htmlFile,
    )
    assert.match(
      html,
      new RegExp(
        `<link rel="alternate" type="text/markdown" href="${escapeRegExp(markdownUrl)}">`,
      ),
      page.htmlFile,
    )
  }

  assert.equal(existsSync(resolve(dist, '404.md')), false)
  assert.doesNotMatch(
    readFileSync(resolve(dist, 'sitemap.xml'), 'utf8'),
    /\.md</,
  )
})

test('sitemap is exact and contains only indexable canonical pages', () => {
  const sitemap = readFileSync(resolve(dist, 'sitemap.xml'), 'utf8')
  const locations = matches(sitemap, /<loc>([^<]+)<\/loc>/g).map(
    (match) => match[1],
  )
  const indexable = [...expectedPages.entries()]
    .filter(
      ([path]) =>
        path === 'index.html' ||
        path.startsWith('docs/') ||
        path.startsWith('features/') ||
        path.startsWith('tools/') ||
        path === 'stats/index.html' ||
        path === 'telemetry/index.html',
    )
    .map(([, canonical]) => canonical)

  assert.deepEqual(locations.sort(), indexable.sort())
  assert.doesNotMatch(sitemap, /\/docs\/reports\/|\/docs\/commands|\/blog/)
  assert.match(
    readFileSync(resolve(dist, 'robots.txt'), 'utf8'),
    /Sitemap: https:\/\/seoskill\.dev\/sitemap\.xml/,
  )
  assert.match(
    readFileSync(resolve(dist, 'robots.txt'), 'utf8'),
    /Content-Signal: search=yes, ai-input=yes, ai-train=yes/,
  )
})

test('telemetry accepts every report id the live registry can send', async () => {
  const { listReportDefinitions } = await import(
    resolve(repoRoot, 'packages/mcp/dist/report-registry.js')
  )
  const accepted = new Set(reportIds)
  for (const { id } of listReportDefinitions()) {
    assert.ok(accepted.has(id), `Telemetry would reject ${id}`)
  }
  assert.equal(accepted.size, reportIds.length)
  for (const id of reportIds) {
    assert.ok(reportCommands[id], `${id} has no command`)
  }
})

test('well-known discovery publishes canonical skills with verified digests', () => {
  const skillNames = readdirSync(resolve(repoRoot, 'skills'), {
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(resolve(repoRoot, 'skills', entry.name, 'SKILL.md')),
    )
    .map((entry) => entry.name)
    .sort()
  const indexPath = resolve(dist, '.well-known/agent-skills/index.json')
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))

  assert.equal(index.$schema, discoverySchema)
  assert.equal(index.skills.length, skillNames.length)
  assert.deepEqual(
    index.skills.map((skill) => skill.name),
    skillNames,
  )

  const urls = new Set()
  for (const skill of index.skills) {
    assert.equal(skill.type, 'skill-md')
    assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.ok(skill.name.length <= 64)
    assert.ok(skill.description.length >= 1)
    assert.ok(skill.description.length <= 1024)
    assert.match(skill.digest, /^sha256:[a-f0-9]{64}$/)
    assert.equal(skill.files, undefined)
    assert.equal(skill.url, `/.well-known/agent-skills/${skill.name}/SKILL.md`)
    assert.equal(urls.has(skill.url), false)
    urls.add(skill.url)

    const canonical = readFileSync(
      resolve(repoRoot, 'skills', skill.name, 'SKILL.md'),
    )
    const published = readFileSync(resolve(dist, skill.url.slice(1)))
    assert.deepEqual(published, canonical)
    assert.equal(
      skill.digest,
      `sha256:${createHash('sha256').update(published).digest('hex')}`,
    )

    const frontmatter = canonical
      .toString('utf8')
      .match(/^---\n([\s\S]*?)\n---\n/)?.[1]
    assert.ok(frontmatter)
    assert.match(frontmatter, new RegExp(`^name: ${skill.name}$`, 'm'))
    assert.match(
      frontmatter,
      new RegExp(
        `^description: ${skill.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        'm',
      ),
    )
  }

  const publishedNames = readdirSync(
    resolve(dist, '.well-known/agent-skills'),
    { withFileTypes: true },
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  assert.deepEqual(publishedNames, skillNames)

  const headers = readFileSync(resolve(dist, '_headers'), 'utf8')
  assert.match(headers, /\.well-known\/agent-skills\/index\.json/)
  assert.match(headers, /Content-Type: application\/json; charset=utf-8/)
  assert.match(headers, /Content-Type: text\/markdown; charset=utf-8/)
  assert.match(headers, /Access-Control-Allow-Origin: \*/)
  assert.match(headers, /Cache-Control: public, max-age=300, must-revalidate/)
  assert.match(headers, /X-Content-Type-Options: nosniff/)
})
