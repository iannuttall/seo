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
  ['index.html', 'https://seoskills.dev'],
  ['docs/index.html', 'https://seoskills.dev/docs'],
  [
    'docs/getting-started/index.html',
    'https://seoskills.dev/docs/getting-started',
  ],
  ['docs/cli/index.html', 'https://seoskills.dev/docs/cli'],
  ['docs/crawler/index.html', 'https://seoskills.dev/docs/crawler'],
  ['docs/google/index.html', 'https://seoskills.dev/docs/google'],
  ['docs/library/index.html', 'https://seoskills.dev/docs/library'],
  ['docs/mcp/index.html', 'https://seoskills.dev/docs/mcp'],
  ['docs/reports/index.html', 'https://seoskills.dev/docs/reports'],
  ['docs/skills/index.html', 'https://seoskills.dev/docs/skills'],
  ['docs/agents/index.html', 'https://seoskills.dev/docs/agents'],
  ['docs/ai-search/index.html', 'https://seoskills.dev/docs/ai-search'],
  ['privacy/index.html', 'https://seoskills.dev/privacy'],
  ['terms/index.html', 'https://seoskills.dev/terms'],
  ['security/index.html', 'https://seoskills.dev/security'],
  ['trademarks/index.html', 'https://seoskills.dev/trademarks'],
  ['cookies/index.html', 'https://seoskills.dev/cookies'],
  ['404.html', 'https://seoskills.dev/404'],
])
const discoverySchema =
  'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

function matches(html, pattern) {
  return [...html.matchAll(pattern)]
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
    assert.match(
      html,
      /<meta property="og:image" content="https:\/\/seoskills\.dev\/og\.png"\s*\/?>/,
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
  assert.doesNotMatch(
    readFileSync(resolve(dist, 'robots.txt'), 'utf8'),
    /Disallow:/,
  )
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
      ({ id }) => `https://seoskills.dev/docs/reports/${reportSlugs[id] ?? id}`,
    ),
  )

  assert.deepEqual(locations.sort(), indexable.sort())
  assert.match(
    readFileSync(resolve(dist, 'robots.txt'), 'utf8'),
    /Sitemap: https:\/\/seoskills\.dev\/sitemap\.xml/,
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
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]
    const description = html.match(
      /<meta name="description" content="([^"]+)"\s*\/?>/,
    )?.[1]

    assert.ok(title && title.length >= 55 && title.length <= 80, id)
    assert.ok(
      description && description.length >= 110 && description.length <= 160,
      id,
    )
    assert.match(catalogHtml, new RegExp(`href="/docs/reports/${slug}"`))
    assert.match(
      html,
      new RegExp(
        `<link rel="canonical" href="https://seoskills\\.dev/docs/reports/${slug}"\\s*/?>`,
      ),
    )
    assert.match(html, /<h1[^>]*>[^<]+<\/h1>/)
    assert.match(html, /What this report helps you decide/)
    assert.match(html, /When this report is not the right tool/)
    assert.match(html, /Data sources and inputs/)
    assert.match(html, /What this report checks/)
    assert.match(html, /Run the report from the CLI/)
    assert.match(html, /How an MCP agent should use it/)
    assert.match(html, /Use the report in a TypeScript app/)
    assert.match(html, /npm install seo/)
    assert.match(html, /What comes back/)
    assert.match(html, /What comes back and how to read it/)
    assert.match(html, /What this report cannot tell you/)
    assert.match(html, /What to do next/)
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
  assert.match(
    pseo,
    /<title>Programmatic SEO Audit: Templates, Pages and Demand \| SEO Skills CLI<\/title>/,
  )
  assert.match(
    pseo,
    /<meta name="description" content="Audit programmatic SEO templates, repeated URL patterns, page evidence, Search Console demand, and pSEO-specific fixes\."\s*\/?>/,
  )
  assert.match(
    pseo,
    /<h1[^>]*>Programmatic SEO audit for templates, scaled pages, and search demand\.<\/h1>/,
  )
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

  assert.equal(listReportDefinitions().length, 51)
  assert.match(
    homeText,
    new RegExp(`${listReportDefinitions().length} reports`),
  )
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

test('site uses the shared visual system and copyable install choices', () => {
  const home = readFileSync(resolve(dist, 'index.html'), 'utf8')
  const css = readFileSync(resolve(appRoot, 'src/styles/globals.css'), 'utf8')

  assert.match(home, /data-install-picker/)
  assert.match(home, /data-copy-install-command/)
  assert.match(home, /npx skills add iannuttall\/seo --all/)
  assert.match(home, /npm i -g seo/)
  assert.match(home, /seo start/)
  assert.match(home, /Install the CLI and agent skills\. Then run seo start\./)
  assert.match(home, /Install the CLI first, then connect its local MCP server/)
  assert.doesNotMatch(home, /npx seo/)
  assert.doesNotMatch(home, /data-install-option="skills"/)
  assert.doesNotMatch(home, /data-install-option="npm"/)
  assert.match(home, /seo mcp install/)
  assert.match(css, /font-family: "InterVariable"/)
  assert.match(css, /font-family: "JetBrains Mono"/)
  assert.match(css, /--frame-max: 48rem/)
  assert.match(css, /prefers-color-scheme: dark/)
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
    assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/)
  }
})
