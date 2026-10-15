import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Ian's rule: a URL the old site published must still work. Each path in
// the fixture (the old sitemap plus every page with Search Console
// impressions) is either a built page or one 301 to a built page.

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(appRoot, 'dist')

const oldPaths = readFileSync(
  resolve(appRoot, 'scripts/fixtures/old-paths.txt'),
  'utf8',
)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)

const rules = readFileSync(resolve(dist, '_redirects'), 'utf8')
  .split('\n')
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const [from, to, status] = line.split(' ')
    return { from, to, status }
  })

function builtFile(path) {
  const clean = path.split(/[?#]/)[0]
  const candidates =
    clean === '/'
      ? ['index.html']
      : [
          clean.slice(1),
          `${clean.slice(1)}/index.html`,
          `${clean.slice(1)}.html`,
        ]
  return candidates
    .map((candidate) => resolve(dist, candidate))
    .find((file) => existsSync(file) && statSync(file).isFile())
}

function redirectFor(path) {
  return rules.find(({ from }) =>
    from.endsWith('*') ? path.startsWith(from.slice(0, -1)) : from === path,
  )
}

test('the old URL list is public paths only', () => {
  assert.ok(oldPaths.length > 100)
  for (const path of oldPaths) {
    assert.match(path, /^\/[A-Za-z0-9._/-]*$/, path)
  }
})

test('every old URL is a page or one 301 to a page', () => {
  const failures = []
  for (const path of oldPaths) {
    const redirect = redirectFor(path)
    if (!redirect) {
      if (!builtFile(path)) failures.push(`${path}: no page and no redirect`)
      continue
    }
    if (redirect.status !== '301') {
      failures.push(`${path}: redirect status ${redirect.status}`)
    }
    // A few pages now live on another site, such as the security policy.
    if (redirect.to.startsWith('https://')) continue
    if (redirectFor(redirect.to)) {
      failures.push(
        `${path}: redirects to ${redirect.to}, which redirects again`,
      )
    }
    if (!builtFile(redirect.to)) {
      failures.push(`${path}: redirects to missing page ${redirect.to}`)
    }
  }
  assert.deepEqual(failures, [])
})
