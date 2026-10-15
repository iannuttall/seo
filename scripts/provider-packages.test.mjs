import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'

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
