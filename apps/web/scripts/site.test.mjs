import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appRoot, '../..')
const dist = resolve(appRoot, 'dist')
const expectedPages = new Map([
  ['index.html', 'https://seoskill.dev'],
  ['docs/index.html', 'https://seoskill.dev/docs'],
  [
    'docs/getting-started/index.html',
    'https://seoskill.dev/docs/getting-started',
  ],
  ['docs/cli/index.html', 'https://seoskill.dev/docs/cli'],
  ['docs/crawler/index.html', 'https://seoskill.dev/docs/crawler'],
  ['docs/google/index.html', 'https://seoskill.dev/docs/google'],
  ['docs/typescript/index.html', 'https://seoskill.dev/docs/typescript'],
  ['docs/mcp/index.html', 'https://seoskill.dev/docs/mcp'],
  ['docs/reports/index.html', 'https://seoskill.dev/docs/reports'],
  ['docs/skill/index.html', 'https://seoskill.dev/docs/skill'],
  ['docs/agents/index.html', 'https://seoskill.dev/docs/agents'],
  ['docs/ai-search/index.html', 'https://seoskill.dev/docs/ai-search'],
  ['docs/ai-visibility/index.html', 'https://seoskill.dev/docs/ai-visibility'],
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
    const ogImage = `https://og.ian.is/?url=${encodeURIComponent(canonical)}`
    assert.match(
      html,
      new RegExp(
        `<meta property="og:image" content="${escapeRegExp(ogImage)}"\\s*/?>`,
      ),
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

test('home uses its H1 in its page and social titles', () => {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const title = 'The only SEO Skill your agent needs'

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
  assert.equal(manifest.pages.length, 71)
  assert.deepEqual(manifestPaths, [...manifestPaths].sort())
  assert.equal(
    manifest.pages.filter((page) => page.htmlPath.startsWith('/docs/reports/'))
      .length,
    53,
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

test('llms.txt is a short curated map generated from the route manifest', async () => {
  const manifest = JSON.parse(
    readFileSync(resolve(dist, 'agent-routes.json'), 'utf8'),
  )
  const actual = readFileSync(resolve(dist, 'llms.txt'), 'utf8')
  const { llmsTxt } = await import('../llms.config.mjs')
  const { renderLlmsTxt } = await import('@seo/astro')

  assert.equal(actual, renderLlmsTxt(manifest, llmsTxt))
  assert.match(actual, /^# SEO Skill\n\n> /u)
  assert.equal(matches(actual, /^## /gmu).length, 4)
  assert.equal(matches(actual, /^- \[/gmu).length, 12)
  assert.doesNotMatch(actual, /Last generated|crawl id|\/privacy|\/terms/u)
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

test('sitemap is exact and contains only indexable canonical pages', async () => {
  const sitemap = readFileSync(resolve(dist, 'sitemap.xml'), 'utf8')
  const locations = matches(sitemap, /<loc>([^<]+)<\/loc>/g).map(
    (match) => match[1],
  )
  const indexable = [...expectedPages.entries()]
    .filter(([path]) => path === 'index.html' || path.startsWith('docs/'))
    .map(([, canonical]) => canonical)
  const { listReportDefinitions } = await import(
    resolve(repoRoot, 'packages/mcp/dist/report-registry.js')
  )
  const { reportSlugs } = await import(
    resolve(appRoot, 'src/content/reports/manifest.mjs')
  )
  indexable.push(
    ...listReportDefinitions().map(
      ({ id }) => `https://seoskill.dev/docs/reports/${reportSlugs[id] ?? id}`,
    ),
  )

  assert.deepEqual(locations.sort(), indexable.sort())
  assert.match(
    readFileSync(resolve(dist, 'robots.txt'), 'utf8'),
    /Sitemap: https:\/\/seoskill\.dev\/sitemap\.xml/,
  )
  assert.match(
    readFileSync(resolve(dist, 'robots.txt'), 'utf8'),
    /Content-Signal: search=yes, ai-input=yes, ai-train=no/,
  )
})

test('report library covers the live registry and keeps legacy routes', async () => {
  const { getReportDefinition, listReportDefinitions } = await import(
    resolve(repoRoot, 'packages/mcp/dist/report-registry.js')
  )
  const { legacyReportAliases, reportIds, reportSlugs } = await import(
    resolve(appRoot, 'src/content/reports/manifest.mjs')
  )
  const guideSource = ['a-f', 'i-p', 'q-z']
    .map((range) =>
      readFileSync(
        resolve(appRoot, `src/content/reports/guide-overrides-${range}.ts`),
        'utf8',
      ),
    )
    .join('\n')
  const liveIds = listReportDefinitions()
    .map(({ id }) => id)
    .sort()
  const catalogHtml = readFileSync(
    resolve(dist, 'docs/reports/index.html'),
    'utf8',
  )

  assert.deepEqual([...reportIds].sort(), liveIds)
  assert.equal(matches(guideSource, /^ {4}seo: \{/gm).length, liveIds.length)
  assert.equal(
    matches(guideSource, /^ {6}primaryKeyword: /gm).length,
    liveIds.length,
  )
  assert.equal(
    matches(guideSource, /^ {4}alternatives: \[/gm).length,
    liveIds.length,
  )
  for (const [, reportId] of matches(guideSource, /reportId: '([^']+)'/g)) {
    assert.ok(liveIds.includes(reportId), `Unknown alternative ${reportId}`)
  }

  for (const id of liveIds) {
    const slug = reportSlugs[id] ?? id
    const relativePath = `docs/reports/${slug}/index.html`
    const html = readFileSync(resolve(dist, relativePath), 'utf8')
    const markdown = readFileSync(
      resolve(dist, `docs/reports/${slug}.md`),
      'utf8',
    )
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]
    const heading = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]
    const description = html.match(
      /<meta name="description" content="([^"]+)"\s*\/?>/,
    )?.[1]

    assert.ok(title, id)
    assert.ok(heading, id)
    assert.match(markdown, new RegExp(`^# ${escapeRegExp(heading)}$`, 'm'), id)
    assert.match(markdown, new RegExp(`seo reports describe ${id} --json`), id)
    assert.match(markdown, new RegExp(`seo reports run ${id} --params`), id)
    for (const usageHeading of ['CLI', 'MCP', 'TypeScript']) {
      assert.equal(
        matches(markdown, new RegExp(`^### ${usageHeading}$`, 'gmu')).length,
        1,
        `${id} ${usageHeading}`,
      )
    }
    assert.doesNotMatch(
      markdown,
      /Copy |Demo of|nav-card-tooltip|clipped-dot|dither/iu,
      id,
    )
    assert.equal(title, `${heading} | SEO Skill`, id)
    assert.equal(title.includes(':'), false, id)
    assert.ok(
      description && description.length >= 140 && description.length <= 160,
      id,
    )
    assert.match(catalogHtml, new RegExp(`href="/docs/reports/${slug}"`))
    assert.match(
      html,
      new RegExp(
        `<link rel="canonical" href="https://seoskill\\.dev/docs/reports/${slug}"\\s*/?>`,
      ),
    )
    assert.match(html, /Install and (?:run|generate|validate)/)
    assert.match(html, /npm i -g seo/)
    assert.match(html, /seo start/)
    assert.match(html, /What you need before you run it/)
    assert.match(html, /What the result cannot prove/)
    assert.match(html, /Use a different report for these jobs/)
    assert.match(
      html,
      /Use the (?:audit|report|monitor|check|tool|generator|export|validator) with an agent or in code/,
    )
    assert.match(
      html,
      /aria-label="Ways to run the (?:audit|report|monitor|check|tool|generator|export|validator)"/,
    )
    assert.match(html, /usage-tab-cli/)
    assert.match(html, /usage-tab-mcp/)
    assert.match(html, /usage-tab-typescript/)
    assert.match(html, /What to do next/)
    assert.match(html, /Related reports/)
    if (id === 'site-crawl') {
      assert.match(html, /<h1[^>]*>Technical SEO site crawl audit<\/h1>/)
      assert.match(html, /seo crawl https:\/\/example\.com --save/)
      assert.match(html, /What you get from this audit/)
    }
    assert.doesNotMatch(html, /Command facts/)
    assert.doesNotMatch(html, /JSON is the source of truth/)
    assert.doesNotMatch(html, /What this report helps you decide/)
    assert.doesNotMatch(html, /Run the report from the CLI/)
    assert.doesNotMatch(html, /Keep the next step tied to the evidence/)
    assert.doesNotMatch(html, /These reports reuse nearby evidence/)

    const limitsStart = html.indexOf('id="cannot-prove"')
    const limitsEnd = html.indexOf('id="different-tool"', limitsStart)
    assert.ok(limitsStart >= 0 && limitsEnd > limitsStart, id)
    assert.ok(
      matches(html.slice(limitsStart, limitsEnd), /<p>/g).length >= 2,
      `Expected two limits paragraphs for ${id}`,
    )
    assert.match(html, new RegExp(`seo reports describe ${id}`))
    assert.match(html, new RegExp(`seo reports run ${id}`))
    assert.doesNotMatch(
      html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '',
      /<meta name="robots" content="noindex/,
    )
    assert.doesNotMatch(
      html,
      /Choose a report whose stated purpose matches the decision/,
    )

    const commandStart = `seo reports run ${id} --params &#39;`
    const paramsStart = html.indexOf(commandStart)
    const paramsEnd = html.indexOf('&#39; --json', paramsStart)
    assert.ok(paramsStart >= 0 && paramsEnd > paramsStart)
    const encodedParams = html.slice(
      paramsStart + commandStart.length,
      paramsEnd,
    )
    const params = JSON.parse(
      encodedParams
        .replaceAll('&quot;', '"')
        .replaceAll('&#x22;', '"')
        .replaceAll('&#x27;', "'")
        .replaceAll('&#x26;', '&')
        .replaceAll('&#x3C;', '<')
        .replaceAll('&#x3E;', '>'),
    )
    const definition = getReportDefinition(id)
    assert.ok(definition)
    assert.equal(definition.inputSchema.safeParse(params).success, true, id)
  }

  const pseo = readFileSync(
    resolve(dist, 'docs/reports/pseo-audit/index.html'),
    'utf8',
  )
  assert.match(pseo, /<title>Programmatic SEO audit \| SEO Skill<\/title>/)
  assert.match(
    pseo,
    /<meta name="description" content="Audit programmatic SEO templates, repeated URL patterns and Search Console demand\. Review representative pages before changing a whole template\."\s*\/?>/,
  )
  assert.match(pseo, /<h1[^>]*>Programmatic SEO audit<\/h1>/)
  assert.match(
    pseo,
    /No report should condemn a template from word count or one sampled URL\./,
  )
  assert.match(
    pseo,
    /manually review whether those pages satisfy their search intent, provide distinct value, and deserve to exist\./,
  )

  for (const [id, slug] of Object.entries(reportSlugs)) {
    const html = readFileSync(
      resolve(dist, 'docs/reports', id, 'index.html'),
      'utf8',
    )
    assert.match(html, new RegExp(`/docs/reports/${slug}`))
  }

  for (const [alias, target] of Object.entries(legacyReportAliases)) {
    const html = readFileSync(
      resolve(dist, 'docs/reports', alias, 'index.html'),
      'utf8',
    )
    const destination = target.startsWith('/')
      ? target
      : `/docs/reports/${target}`
    assert.match(html, new RegExp(destination))
  }
})

test('published report count stays tied to the implementation', async () => {
  const { listReportDefinitions } = await import(
    resolve(repoRoot, 'packages/mcp/dist/report-registry.js')
  )
  const home = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const homeText = home.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  assert.equal(listReportDefinitions().length, 53)
  assert.match(homeText, /50\+ reports/)
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

test('Cloudflare serves static assets with exact Markdown response headers', () => {
  const config = JSON.parse(
    readFileSync(resolve(appRoot, 'wrangler.jsonc'), 'utf8'),
  )
  const headers = readFileSync(resolve(dist, '_headers'), 'utf8')
  const manifest = JSON.parse(
    readFileSync(resolve(dist, 'agent-routes.json'), 'utf8'),
  )

  assert.equal(config.name, 'seo-skill')
  assert.equal(config.main, undefined)
  assert.equal(config.assets.binding, undefined)
  assert.equal(config.assets.run_worker_first, undefined)
  assert.equal(config.assets.html_handling, 'drop-trailing-slash')
  assert.equal(config.assets.not_found_handling, '404-page')
  assert.deepEqual(config.routes, [
    { pattern: 'seoskill.dev', custom_domain: true },
    { pattern: 'www.seoskill.dev', custom_domain: true },
  ])
  assert.equal(existsSync(resolve(appRoot, 'src/worker.ts')), false)
  assert.equal(existsSync(resolve(appRoot, 'tsconfig.worker.json')), false)
  assert.equal(existsSync(resolve(appRoot, 'worker-configuration.d.ts')), false)

  assert.match(headers, /Content-Signal: search=yes, ai-input=yes, ai-train=no/)
  assert.match(headers, /Strict-Transport-Security: max-age=300/)
  assert.match(headers, /rel="sitemap"; type="application\/xml"/)
  assert.match(headers, /rel="llms-txt"; type="text\/markdown"/)
  assert.match(headers, /rel="agent-skills"; type="application\/json"/)
  assert.match(
    headers,
    new RegExp(
      escapeRegExp(
        '/docs/*\n  Link: <https://seoskill.dev/docs/:splat.md>; rel="alternate"; type="text/markdown"\n  Vary: Accept',
      ),
    ),
  )

  assert.equal(manifest.pages.length, 71)
  assert.equal(matches(headers, /X-Markdown-Tokens: \d+/g).length, 71)
  for (const page of manifest.pages) {
    const rule = [
      page.markdownPath,
      '  ! Link',
      '  ! Vary',
      '  Content-Type: text/markdown; charset=utf-8',
      `  Link: <${page.canonical}>; rel="canonical"`,
      '  Link: <https://seoskill.dev/sitemap.xml>; rel="sitemap"; type="application/xml"',
      '  Link: <https://seoskill.dev/llms.txt>; rel="llms-txt"; type="text/markdown"',
      '  Link: <https://seoskill.dev/.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"',
      '  Vary: Accept',
      `  X-Markdown-Tokens: ${page.tokens}`,
    ].join('\n')
    assert.match(headers, new RegExp(escapeRegExp(rule)))
  }

  for (const page of [
    'cookies',
    'privacy',
    'security',
    'terms',
    'trademarks',
  ]) {
    assert.match(
      headers,
      new RegExp(`/${page}\\.md\\n  X-Robots-Tag: noindex, follow`),
    )
    assert.match(
      headers,
      new RegExp(
        `/${page}\\n  Link: <https://seoskill\\.dev/${page}\\.md>; rel="alternate"; type="text/markdown"\\n  Vary: Accept\\n  X-Robots-Tag: noindex, follow`,
      ),
    )
  }
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

test('site uses the keep-brutal visual system and copyable install choices', () => {
  const home = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const css = readFileSync(resolve(appRoot, 'src/styles/globals.css'), 'utf8')

  assert.match(home, /data-install-picker/)
  assert.match(home, /data-copy-install-command/)
  assert.match(home, /npm i -g seo/)
  assert.match(home, /seo start/)
  assert.match(home, /The only SEO skill/)
  assert.match(home, /your agent needs/)
  assert.match(
    home,
    /One SEO skill and 50\+ audit tools for AI agents to fix\s+issues, measure performance, and grow your organic and AI search\s+visibility\./,
  )
  assert.match(home, /data-glitch/)
  assert.match(home, /prefers-reduced-motion: reduce/)
  assert.match(
    home,
    /Chat with your SEO data to find out what works and what doesn&#39;t\./,
  )
  assert.match(home, /Claude \/ keep\.md/)
  assert.match(home, /Codex \/ keep\.md/)
  assert.match(home, /seo report --project keep/)
  assert.match(home, /data-chat-part="spinner"/)
  assert.match(home, /metadata findings/)
  assert.match(home, /indexability changes/)
  assert.match(home, /Search Console/)
  assert.match(home, /AI crawler access/)
  assert.match(home, /llms\.txt/)
  assert.match(home, /import/)
  assert.match(home, /auditPage/)
  assert.match(home, /Correlation only, not a causal claim/)
  assert.doesNotMatch(home, /npx seo/)
  assert.doesNotMatch(home, /data-install-option="skills"/)
  assert.doesNotMatch(home, /data-install-option="npm"/)
  assert.match(css, /font-family: "Martian Grotesk"/)
  assert.match(css, /font-family: "Martian Mono"/)
  assert.match(css, /--nav-bg: #171717/)
  assert.match(css, /--primary: #ff4500/)
  assert.match(
    readFileSync(resolve(appRoot, 'src/layouts/BaseLayout.astro'), 'utf8'),
    /max-w-4xl/,
  )
  assert.match(css, /prefers-color-scheme: dark/)
})

test('published guidance does not teach disposable npx CLI installs', () => {
  const guides = [
    resolve(repoRoot, 'README.md'),
    resolve(repoRoot, 'docs/mcp.md'),
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
    ['MartianGroteskVF.woff2', 'MartianMono-OFL.txt'],
    ['MartianMonoVF.woff2', 'MartianMono-OFL.txt'],
  ]

  for (const [fontName, licenseName] of fonts) {
    const font = resolve(appRoot, 'public/fonts', fontName)
    const license = readFileSync(
      resolve(appRoot, 'public/fonts', licenseName),
      'utf8',
    )

    assert.ok(statSync(font).size > 20_000)
    assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/)
  }
})
