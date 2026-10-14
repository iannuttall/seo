import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appRoot, '../..')
const dist = resolve(appRoot, 'dist')
const {
  legacyReportAliases,
  reportCommands,
  reportDestination,
  reportIds,
  reportSlugs,
} = await import(resolve(appRoot, 'src/content/telemetry/report-ids.mjs'))
const { tools } = await import(
  resolve(appRoot, 'src/content/tools/manifest.mjs')
)
const { docsPaths } = await import(resolve(appRoot, 'src/content/docs-nav.mjs'))
const pagePath = (path) =>
  path === '/' ? 'index.html' : `${path.slice(1)}/index.html`
const expectedPages = new Map([
  ['index.html', 'https://seoskill.dev'],
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
  ['security/index.html', 'https://seoskill.dev/security'],
  ['trademarks/index.html', 'https://seoskill.dev/trademarks'],
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
    const ogImage = `https://og.ian.is/?url=${encodeURIComponent(canonical)}&v=2`
    const escapedOgImage = escapeRegExp(ogImage).replaceAll('&', '(?:&|&amp;)')
    assert.match(
      html,
      new RegExp(
        `<meta property="og:image" content="${escapedOgImage}"\\s*/?>`,
      ),
    )
    assert.match(
      html,
      new RegExp(
        `<meta name="twitter:image" content="${escapedOgImage}"\\s*/?>`,
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

test('home prefixes the brand in its page and social titles', () => {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const title = 'SEO Skill | Free SEO data for AI agents'

  const escapedTitle = escapeRegExp(title)

  assert.match(html, new RegExp(`<title>${escapedTitle}</title>`))
  assert.match(
    html,
    new RegExp(`<meta property="og:title" content="${escapedTitle}"`),
  )
  assert.match(
    html,
    new RegExp(`<meta name="twitter:title" content="${escapedTitle}"`),
  )
  assert.match(html, />\s*Give your AI agent your real SEO data\s*<\/h1>/i)
})

test('every non-home page suffixes the site name', () => {
  for (const relativePath of expectedPages.keys()) {
    if (relativePath === 'index.html') continue
    const html = readFileSync(resolve(dist, relativePath), 'utf8')
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]
    assert.ok(title?.endsWith(' | SEO Skill'), `${relativePath}: ${title}`)
  }
})

test('built links keep whitespace before the following word', () => {
  for (const file of walkFiles(dist, (path) => path.endsWith('.html'))) {
    const relativePath = file.slice(dist.length + 1)
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /<\/a>[A-Za-z]/,
      `${relativePath} joins a link to the following word`,
    )
  }
})

test('stats page maps every report id to the command that covers it', () => {
  const html = readFileSync(resolve(dist, 'stats/index.html'), 'utf8')
  const encoded = html.match(/data-report-map="([^"]+)"/)?.[1]
  assert.ok(encoded, 'Missing report map on the stats page.')
  const map = JSON.parse(
    encoded.replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
  )

  assert.deepEqual(Object.keys(map).sort(), [...reportIds].sort())
  assert.deepEqual(map['ctr-underperformers'], {
    command: 'seo report',
    path: '/docs/commands/report',
  })
  assert.deepEqual(map['affected-urls'], {
    command: 'seo crawl',
    path: '/docs/commands/crawl',
  })
  assert.deepEqual(map['ai-readiness'], {
    command: 'Removed reports',
    path: '/docs',
  })
  assert.match(html, /data-command-table/)
})

test('legal and error pages are noindex but remain crawlable', () => {
  for (const page of [
    'privacy',
    'terms',
    'security',
    'trademarks',
    'cookies',
  ]) {
    const html = readFileSync(resolve(dist, page, 'index.html'), 'utf8')
    assert.match(html, /<meta name="robots" content="noindex, follow">/)
  }

  const notFound = readFileSync(resolve(dist, '404.html'), 'utf8')
  assert.match(notFound, /<meta name="robots" content="noindex, follow">/)
  assert.match(notFound, /That page is not here/)
  assert.match(notFound, /Get back to something useful/)
  assert.match(notFound, /Report the broken link/)
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
    ['/cookies', '/privacy', '/security', '/terms', '/trademarks'],
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

test('public copy avoids internal report language', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(dist, 'agent-routes.json'), 'utf8'),
  )
  const internalLanguage =
    /\b(?:bounded|first-party|cardinality|provenance|provider-native)\b|retained (?:rows|queries|evidence)|declared set|planned cardinality|candidate budget|coverage policy|source state|structured provenance|evidence contract|data contract|(?:query|url|evidence) shapes?/iu

  for (const page of manifest.pages) {
    const markdown = readFileSync(resolve(dist, page.markdownFile), 'utf8')
    assert.doesNotMatch(markdown, internalLanguage, page.markdownFile)
  }
})

test('tool copy stays focused on the job instead of its backend', () => {
  const implementationCopy =
    /Cloudflare|Turnstile|server-side credential|per network|each UTC day|provider allowance|global provider budget|site's Worker|browser worker/iu

  for (const tool of tools) {
    const markdown = readFileSync(
      resolve(dist, `${tool.path.slice(1)}.md`),
      'utf8',
    )
    assert.doesNotMatch(markdown, implementationCopy, tool.path)
  }

  for (const tool of [
    'spam-score-checker',
    'domain-rating-checker',
    'website-traffic-checker',
  ]) {
    const html = readFileSync(
      resolve(dist, 'tools', tool, 'index.html'),
      'utf8',
    )
    assert.doesNotMatch(html, /checks remaining today/iu, tool)
    assert.doesNotMatch(html, /Up to 10|protected provider checks/iu, tool)
  }
})

test('llms.txt is a short curated map generated from the route manifest', async () => {
  const manifest = JSON.parse(
    readFileSync(resolve(dist, 'agent-routes.json'), 'utf8'),
  )
  const actual = readFileSync(resolve(dist, 'llms.txt'), 'utf8')
  const { llmsTxt } = await import('../llms.config.mjs')
  const { renderLlmsTxt } = await import('@iannuttall/seo-graph-core')

  assert.equal(actual, renderLlmsTxt(manifest, llmsTxt))
  assert.match(actual, /^# SEO Skill\n\n> /u)
  assert.equal(matches(actual, /^## /gmu).length, 5)
  assert.equal(
    matches(actual, /^- \[/gmu).length,
    llmsTxt.sections.reduce(
      (total, section) => total + section.items.length,
      0,
    ),
  )
  assert.doesNotMatch(
    actual,
    /Last generated|crawl id|seoskill\.dev\/privacy|seoskill\.dev\/terms/u,
  )
  assert.doesNotMatch(actual, /<urlset|<sitemapindex/u)

  const manifestMarkdown = new Set(
    manifest.pages.map((page) =>
      new URL(page.markdownPath, manifest.site).toString(),
    ),
  )
  for (const [, , href] of matches(actual, /\[([^\]]+)]\(([^)]+)\)/g)) {
    const url = new URL(href)
    if (url.pathname.startsWith('/.well-known/')) {
      assert.ok(existsSync(resolve(dist, url.pathname.slice(1))), href)
    } else if (url.toString() === 'https://seoskill.dev/mcp') {
    } else {
      assert.ok(manifestMarkdown.has(url.toString()), href)
    }
  }
})

test('every content page publishes one connected identity graph', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(dist, 'agent-routes.json'), 'utf8'),
  )
  for (const page of manifest.pages) {
    const html = readFileSync(resolve(dist, page.htmlFile), 'utf8')
    const scripts = matches(
      html,
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )
    assert.equal(scripts.length, 1, page.htmlPath)
    const schema = JSON.parse(scripts[0][1])
    assert.equal(schema['@context'], 'https://schema.org')
    assert.ok(Array.isArray(schema['@graph']), page.htmlPath)
    const byId = new Map(schema['@graph'].map((node) => [node['@id'], node]))
    const creator = byId.get('https://seoskill.dev/#creator')
    const website = byId.get('https://seoskill.dev/#website')
    const software = byId.get('https://seoskill.dev/#software')
    const webPage = byId.get(`${page.canonical}#webpage`)
    assert.equal(creator?.['@type'], 'Person', page.htmlPath)
    assert.deepEqual(creator?.sameAs, ['https://github.com/iannuttall'])
    assert.equal(website?.['@type'], 'WebSite', page.htmlPath)
    assert.equal(software?.['@type'], 'SoftwareApplication', page.htmlPath)
    assert.deepEqual(software?.sameAs, [
      'https://github.com/iannuttall/seo',
      'https://www.npmjs.com/package/seo',
    ])
    assert.ok(
      ['CollectionPage', 'TechArticle', 'WebPage'].includes(webPage?.['@type']),
      page.htmlPath,
    )
    assert.deepEqual(webPage?.isPartOf, { '@id': website['@id'] })
    assert.deepEqual(webPage?.about, { '@id': software['@id'] })
    assert.deepEqual(webPage?.creator, { '@id': creator['@id'] })

    const hasVisibleBreadcrumb = /<nav aria-label="Breadcrumb"/u.test(html)
    assert.equal(
      Boolean(webPage?.breadcrumb),
      hasVisibleBreadcrumb,
      page.htmlPath,
    )
    assert.equal(
      schema['@graph'].some((node) => node['@type'] === 'BreadcrumbList'),
      hasVisibleBreadcrumb,
      page.htmlPath,
    )
  }
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
        path.startsWith('tools/') ||
        path === 'stats/index.html' ||
        path === 'telemetry/index.html',
    )
    .map(([, canonical]) => canonical)

  assert.deepEqual(locations.sort(), indexable.sort())
  assert.doesNotMatch(sitemap, /\/docs\/reports\/|\/features|\/blog/)
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

test('every old report URL redirects permanently to its command page', () => {
  const rules = new Map(
    readFileSync(resolve(dist, '_redirects'), 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [from, to, status] = line.split(' ')
        assert.equal(status, '301', line)
        return [from, to]
      }),
  )
  const expected = {
    report: [
      'search-performance-overview',
      'quick-wins',
      'ctr-underperformers',
      'striking-distance',
      'second-page',
      'decaying-pages',
      'refresh-priorities',
      'cannibalisation',
      'traffic-anomaly',
      'query-clusters',
      'community-intent',
      'ai-referrals',
      'keyword-opportunities',
      'monthly-report',
      'monthly-action-plan',
      'narrative-report',
    ],
    page: [
      'audit-page',
      'page-opportunities',
      'content-optimization',
      'performance-audit',
      'redirect-trace',
      'audit-urls',
    ],
    compare: [
      'measure-change',
      'segment-impact',
      'update-correlation',
      'update-postmortem',
    ],
    indexing: [
      'index-coverage',
      'index-watch',
      'index-monitor',
      'index-coverage-plan',
      'link-recovery',
    ],
    research: [
      'serp-results',
      'keyword-metrics',
      'keyword-research',
      'domain-overview',
      'ranked-keywords',
      'serp-competitors',
      'competitor-keyword-gap',
      'competitive-opportunities',
      'ranking-pages',
      'link-evidence',
      'domain-rating',
      'saved-keywords',
      'rank-tracking',
    ],
    crawl: [
      'site-crawl',
      'crawl-report',
      'crawl-history',
      'crawl-diff',
      'compare-crawls',
      'affected-urls',
      'top-fixes',
      'explain-crawl-issue',
      'crawler-rules',
      'technical-watch',
    ],
    'internal-links': ['internal-links'],
  }
  const covered = new Set(['setup-check'])
  for (const [page, ids] of Object.entries(expected)) {
    for (const id of ids) {
      covered.add(id)
      const slug = reportSlugs[id] ?? id
      const destination = `/docs/commands/${page}`
      assert.equal(rules.get(`/docs/reports/${slug}`), destination, id)
      assert.equal(rules.get(`/docs/reports/${slug}.md`), `${destination}.md`)
      assert.equal(reportDestination(id), destination, id)
    }
  }
  assert.equal(rules.get('/docs/reports/setup-check'), '/docs/getting-started')
  for (const id of reportIds.filter((value) => !covered.has(value))) {
    assert.equal(rules.get(`/docs/reports/${id}`), '/docs', `${id} is removed`)
  }
  assert.equal(
    rules.get('/docs/reports/index-coverage-plan'),
    '/docs/commands/indexing',
  )
  for (const alias of Object.keys(legacyReportAliases)) {
    assert.ok(rules.has(`/docs/reports/${alias}`), alias)
  }
  assert.equal(rules.get('/docs/reports/*'), '/docs/commands')
  assert.equal(rules.get('/features/mcp'), '/docs/mcp')
  assert.equal(rules.get('/blog/seo-mcp-servers'), '/docs/mcp')

  for (const [from, to] of rules) {
    if (from.includes('*')) continue
    const target = to.endsWith('.md')
      ? resolve(dist, to.slice(1))
      : resolve(dist, pagePath(to))
    assert.ok(existsSync(target), `${from} redirects to missing ${to}`)
    if (!from.endsWith('.md')) {
      assert.equal(
        existsSync(resolve(dist, pagePath(from))),
        false,
        `${from} still has a page`,
      )
    }
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

test('site copy has no stale hosted product, email contact, or dash punctuation', () => {
  const sourceFiles = []
  const pending = [resolve(appRoot, 'src')]

  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (/\.(astro|css|md|mdx|ts)$/.test(entry.name))
        sourceFiles.push(path)
    }
  }

  const copy = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(copy, /audits\.run/i)
  assert.doesNotMatch(copy, /mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)
  assert.doesNotMatch(copy, /[\u2013\u2014]/u)
})

test('site has no retired Kiwa or React runtime', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(appRoot, 'package.json'), 'utf8'),
  )
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }

  for (const dependency of [
    '@astrojs/react',
    '@kiwa-ui/enhance',
    '@types/react',
    '@types/react-dom',
    'clsx',
    'react',
    'react-dom',
    'tailwind-merge',
  ]) {
    assert.equal(dependencies[dependency], undefined, dependency)
  }
})

test('site uses the ilo visual system and one-click setup commands', () => {
  const home = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const css = readFileSync(resolve(appRoot, 'src/styles/globals.css'), 'utf8')
  const layout = readFileSync(
    resolve(appRoot, 'src/layouts/BaseLayout.astro'),
    'utf8',
  )

  assert.match(home, /data-setup-commands/)
  for (const command of [
    'claude mcp add --transport http seoskill https://seoskill.dev/mcp',
    'codex mcp add seoskill --url https://seoskill.dev/mcp',
    'https://seoskill.dev/mcp',
    'npm i -g seo &amp;&amp; seo start',
  ]) {
    assert.match(
      home,
      new RegExp(`data-copy-value="${escapeRegExp(command)}"`),
      command,
    )
  }
  assert.match(home, /role="tablist" aria-label="MCP client"/)
  // Client panels share one grid cell, so switching never changes height.
  assert.match(home, /\[grid-area:1\/1\]/)
  assert.doesNotMatch(home, /data-setup-panel="[^"]+"[^>]*\shidden[\s>=]/)
  assert.doesNotMatch(home, /data-copy-value="npm i -g seo"/)
  assert.match(home, /Nothing stored/)
  assert.match(home, /<a[^>]+href="\/cookies"[^>]*>\s*Cookies\s*<\/a>/)
  for (const command of [
    'report',
    'page',
    'compare',
    'indexing',
    'research',
    'data',
    'crawl',
    'internal-links',
  ]) {
    assert.match(home, new RegExp(`href="/docs/commands/${command}"`))
  }

  assert.match(home, /data-faq-accordion/)
  assert.match(home, /<button[^>]+aria-controls="home-faq-content-1"/)
  assert.match(home, /aria-expanded="false"[^>]+data-faq-trigger/)
  assert.match(
    home,
    /role="region" aria-labelledby="home-faq-trigger-1" aria-hidden="true"/,
  )
  assert.match(home, /grid-template-rows:0fr/)
  assert.match(home, /grid-template-rows:1fr/)
  assert.match(home, /ArrowDown/)
  assert.match(home, /ArrowUp/)
  assert.match(home, /setAttribute\([`'"]aria-hidden[`'"],String\(!\w+\)\)/)
  assert.doesNotMatch(home, /<details/)
  assert.doesNotMatch(home, /kiwa-ui/)
  assert.doesNotMatch(home, /npx seo/)

  assert.match(css, /font-family: "InterVariable"/)
  assert.match(css, /font-family: "JetBrains Mono"/)
  assert.match(css, /--primary: oklch\(60\.9% 0\.126 221\.723\)/)
  assert.match(css, /--frame-max: 48rem/)
  assert.match(css, /prefers-color-scheme: dark/)
  assert.doesNotMatch(css, /Martian|dither|clipped-dot/)
  assert.match(css, /:root:not\(\[data-theme="light"\]\)/)
  assert.match(css, /:root\[data-theme="dark"\]/)
  assert.doesNotMatch(
    readFileSync(resolve(appRoot, 'public/favicon.svg'), 'utf8'),
    /focus-point/,
  )
  assert.match(layout, /site-frame/)
  assert.doesNotMatch(
    readdirSync(resolve(appRoot, 'public/fonts')).join(' '),
    /Martian/,
  )
})

test('text entry controls disable ambiguous font ligatures', () => {
  const globals = readFileSync(
    resolve(appRoot, 'src/styles/globals.css'),
    'utf8',
  )

  assert.match(globals, /input,\s*\n\s*textarea\s*\{/)
  assert.match(globals, /font-variant-ligatures:\s*none/)
  assert.match(globals, /font-feature-settings:\s*"liga" 0, "clig" 0, "calt" 0/)
})

test('schema tools use shared controls in a stacked generator flow', () => {
  const fieldControl = readFileSync(
    resolve(appRoot, 'src/components/tools/SchemaFieldControl.astro'),
    'utf8',
  )
  const generator = readFileSync(
    resolve(appRoot, 'src/components/tools/SchemaMarkupGenerator.astro'),
    'utf8',
  )
  const validator = readFileSync(
    resolve(appRoot, 'src/components/tools/SchemaMarkupValidator.astro'),
    'utf8',
  )

  for (const component of ['FormInput', 'FormSelect', 'FormTextarea']) {
    assert.match(fieldControl, new RegExp(`import ${component} from`))
  }
  assert.match(generator, /import Button from/)
  assert.match(generator, /import FormSelect from/)
  assert.match(generator, /import SchemaFieldControl from/)
  assert.match(validator, /import Button from/)
  assert.match(validator, /import FormTextarea from/)
  assert.doesNotMatch(
    generator,
    /document\.createElement\(['"](?:button|input|select|textarea)['"]\)/,
  )
  assert.doesNotMatch(generator, /lg:grid-cols/)
  assert.match(generator, /Validate this markup/)
  assert.match(generator, /schema-markup-validator\?source=generator/)
})

test('telemetry prose and stats keep a stable readable first render', () => {
  const telemetry = readFileSync(resolve(dist, 'telemetry/index.html'), 'utf8')
  const stats = readFileSync(resolve(dist, 'stats/index.html'), 'utf8')

  assert.match(
    telemetry,
    /in <code>telemetry\.json<\/code> inside the existing SEO config/u,
  )
  assert.match(
    telemetry,
    /<code>seo telemetry status --json<\/code> to see the exact path/u,
  )
  assert.match(
    telemetry,
    /<code>firstRunAt<\/code> is used only on your machine/u,
  )

  assert.match(stats, /data-stats-root[^>]*aria-busy="true"/u)
  assert.equal(
    matches(stats, /data-stat="[^"]+" data-stats-loading>0%?</gu).length,
    9,
  )
  assert.match(stats, /data-stat="firstAuditCompletions"/u)
  assert.match(stats, /data-stat="auditsCompleted"/u)
  assert.match(stats, /class="[^"]*lg:grid-cols-2[^"]*" data-agent-breakdowns/u)
  assert.match(
    stats,
    /data-agent-table="installs" data-stats-loading><tr><td colspan="3">No recorded events/u,
  )
  assert.match(stats, /class="animate-pulse[^>]+data-stats-loading/u)
  assert.match(
    stats,
    /data-failure-category-table data-stats-loading><tr><td colspan="2">No recorded failures/u,
  )
  assert.match(
    stats,
    /data-failure-detail-table data-stats-loading><tr><td colspan="5">No detailed failure signals/u,
  )
  assert.match(
    stats,
    /data-stats-status[^>]*data-agent-markdown="exclude"[^>]*>\s*Fetching current totals\.<\/p>/u,
  )
  assert.doesNotMatch(
    stats,
    /data-stats-status[^>]*>[^<]*Agents can fetch current/u,
  )
  assert.doesNotMatch(stats, /Not available/u)

  // Live values are browser-only. The static page tells agents to fetch the
  // aggregate JSON instead, and every dynamic section is excluded from the
  // Markdown alternate so placeholder zeros never reach it.
  assert.match(
    stats,
    /Agents can fetch current\s+values as JSON with a GET request to https:\/\/seoskill\.dev\/api\/stats/u,
  )
  assert.match(
    stats,
    /hidden data-agent-markdown="only">\s*Agents can fetch current values as JSON/u,
  )
  assert.equal(matches(stats, /data-agent-markdown="exclude"/gu).length, 6)
  const statsMarkdown = readFileSync(resolve(dist, 'stats.md'), 'utf8')
  assert.match(statsMarkdown, /https:\/\/seoskill\.dev\/api\/stats/u)
  assert.doesNotMatch(statsMarkdown, /Recorded installs/u)
  assert.doesNotMatch(statsMarkdown, /No recorded events/u)
})

test('published guidance does not teach disposable npx CLI installs', () => {
  const guides = [
    resolve(repoRoot, 'README.md'),
    resolve(appRoot, 'src/content/docs/mcp.mdx'),
    resolve(appRoot, 'src/content/docs/cli.mdx'),
    resolve(repoRoot, 'apps/web/AGENTS.md'),
    resolve(repoRoot, 'AGENTS.md'),
    resolve(appRoot, 'assets/og-source.svg'),
  ]
  const copy = guides.map((file) => readFileSync(file, 'utf8')).join('\n')

  assert.doesNotMatch(copy, /npx(?: -y)? seo\b/)
  assert.match(copy, /npm i -g seo/)
})

test('bundled fonts ship with their open font licenses', () => {
  const fonts = [
    ['InterVF.woff2', 'LICENSE-inter.txt'],
    ['JetBrainsMonoVF.woff2', 'LICENSE-jetbrains-mono.txt'],
  ]

  for (const [fontName, licenseName] of fonts) {
    const font = resolve(appRoot, 'public/fonts', fontName)
    const license = readFileSync(
      resolve(appRoot, 'public/fonts', licenseName),
      'utf8',
    )

    assert.ok(statSync(font).size > 20_000)
    assert.match(license, /SIL Open Font License, Version 1\.1/)
  }
})
