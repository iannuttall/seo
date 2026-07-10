import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
  ['docs/reports/index.html', 'https://seoskills.dev/docs/reports'],
  ['docs/agents/index.html', 'https://seoskills.dev/docs/agents'],
  ['docs/ai-search/index.html', 'https://seoskills.dev/docs/ai-search'],
  ['privacy/index.html', 'https://seoskills.dev/privacy'],
  ['terms/index.html', 'https://seoskills.dev/terms'],
  ['security/index.html', 'https://seoskills.dev/security'],
  ['trademarks/index.html', 'https://seoskills.dev/trademarks'],
  ['cookies/index.html', 'https://seoskills.dev/cookies'],
  ['404.html', 'https://seoskills.dev/404'],
])

function matches(html, pattern) {
  return [...html.matchAll(pattern)]
}

test('build contains every public route with one complete SEO contract', () => {
  for (const [relativePath, canonical] of expectedPages) {
    const file = resolve(dist, relativePath)
    assert.ok(existsSync(file), `Missing built page ${relativePath}`)
    const html = readFileSync(file, 'utf8')

    assert.equal(
      matches(html, /<title>[^<]+<\/title>/g).length,
      1,
      relativePath,
    )
    assert.equal(
      matches(html, /<meta name="description" content="[^"]+">/g).length,
      1,
      relativePath,
    )
    assert.equal(
      matches(html, /<link rel="canonical" href="[^"]+">/g).length,
      1,
      relativePath,
    )
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}">`))
    assert.match(html, /<meta property="og:title" content="[^"]+">/)
    assert.match(
      html,
      /<meta property="og:image" content="https:\/\/seoskills\.dev\/og\.png">/,
    )
    assert.match(
      html,
      /<meta name="twitter:card" content="summary_large_image">/,
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

test('sitemap is exact and contains only indexable canonical pages', () => {
  const sitemap = readFileSync(resolve(dist, 'sitemap.xml'), 'utf8')
  const locations = matches(sitemap, /<loc>([^<]+)<\/loc>/g).map(
    (match) => match[1],
  )
  const indexable = [...expectedPages.entries()]
    .filter(([path]) => path === 'index.html' || path.startsWith('docs/'))
    .map(([, canonical]) => canonical)

  assert.deepEqual(locations.sort(), indexable.sort())
  assert.match(
    readFileSync(resolve(dist, 'robots.txt'), 'utf8'),
    /Sitemap: https:\/\/seoskills\.dev\/sitemap\.xml/,
  )
})

test('published product counts stay tied to the implementation', async () => {
  const { listRules } = await import(
    resolve(repoRoot, 'packages/core/dist/index.js')
  )
  const { listReportDefinitions, REPORT_CATEGORIES } = await import(
    resolve(repoRoot, 'packages/mcp/dist/report-registry.js')
  )
  const skillCount = readdirSync(resolve(repoRoot, 'skills'), {
    withFileTypes: true,
  }).filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(resolve(repoRoot, 'skills', entry.name, 'SKILL.md')),
  ).length
  const home = readFileSync(resolve(dist, 'index.html'), 'utf8')

  assert.equal(listRules().length, 50)
  assert.equal(listReportDefinitions().length, 51)
  assert.equal(REPORT_CATEGORIES.length, 9)
  assert.equal(skillCount, 57)
  assert.match(
    home,
    new RegExp(`${listReportDefinitions().length} discoverable reports`),
  )
  assert.match(home, new RegExp(`${listRules().length} crawler rules`))
  assert.match(home, new RegExp(`${skillCount} agent skills`))
})

test('site copy has no stale hosted product, email contact, or dash punctuation', () => {
  const sourceFiles = []
  const pending = [resolve(appRoot, 'src')]

  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (/\.(astro|css|ts)$/.test(entry.name)) sourceFiles.push(path)
    }
  }

  const copy = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(copy, /audits\.run/i)
  assert.doesNotMatch(copy, /mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)
  assert.doesNotMatch(copy, /[\u2013\u2014]/u)
})
