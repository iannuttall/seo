import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canOfferInteractiveUpdate,
  inferSelfUpdateCommand,
} from './self-update.js'

test('does not update temporary, linked, or Volta installations', () => {
  assert.equal(
    inferSelfUpdateCommand(
      '/Users/ian/.npm/_npx/abc/node_modules/seo/dist/cli.js',
    ),
    undefined,
  )
  assert.equal(
    inferSelfUpdateCommand('/Users/ian/dev/cli/seo/dist/cli.js'),
    undefined,
  )
  assert.equal(
    inferSelfUpdateCommand(
      '/Users/ian/.volta/tools/image/packages/seo/lib/node_modules/seo/dist/cli.js',
    ),
    undefined,
  )
})

test('only offers updates in a human terminal', () => {
  const base = {
    argv: ['report'],
    env: {},
    stdinIsTty: true,
    stdoutIsTty: true,
  }
  assert.equal(canOfferInteractiveUpdate(base), true)
  assert.equal(
    canOfferInteractiveUpdate({ ...base, argv: ['report', '--json'] }),
    false,
  )
  assert.equal(
    canOfferInteractiveUpdate({ ...base, argv: ['mcp', 'serve'] }),
    false,
  )
  assert.equal(canOfferInteractiveUpdate({ ...base, env: { CI: '1' } }), false)
  assert.equal(canOfferInteractiveUpdate({ ...base, stdinIsTty: false }), false)
})
