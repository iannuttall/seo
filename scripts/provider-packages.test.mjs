import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('the provider protocol accepts a self-contained external package', async () => {
  const root = new URL('./fixtures/provider-extension/', import.meta.url)
  const manifest = JSON.parse(
    await readFile(new URL('package.json', root), 'utf8'),
  )
  assert.deepEqual(manifest.seo, {
    apiVersion: 1,
    providers: ['./dist/index.js'],
  })
  assert.deepEqual(manifest.dependencies, undefined)

  let registration
  const activate = (await import(new URL('dist/index.js', root))).default
  await activate({
    apiVersion: 1,
    registerProvider(value) {
      registration = value
    },
  })
  assert.equal(registration?.id, 'fixture')
  assert.deepEqual(
    registration?.capabilities.map((item) => item.id),
    ['landing-page-visits', 'serp-snapshot'],
  )
  assert.deepEqual(
    registration?.actions.map((item) => item.id),
    ['echo'],
  )
})

test('provider API endpoints stay outside the main runtime bundles', async () => {
  const dist = new URL('../dist/', import.meta.url)
  const bundleNames = (await readdir(dist)).filter((file) =>
    file.endsWith('.js'),
  )
  const rootBundles = await Promise.all(
    bundleNames.map((file) => readFile(new URL(file, dist), 'utf8')),
  )
  const bundledSource = rootBundles.join('\n')

  assert.doesNotMatch(bundledSource, /api\.clicky\.com/)
  assert.doesNotMatch(bundledSource, /api\.serpbase\.dev/)
})
