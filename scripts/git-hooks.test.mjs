import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '..')

test('the local pre-commit hook checks remote web secrets', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
  )
  const hookPath = resolve(repoRoot, '.githooks/pre-commit')
  const hook = readFileSync(hookPath, 'utf8')

  assert.equal(
    packageJson.scripts['hooks:install'],
    'node scripts/install-git-hooks.mjs',
  )
  assert.match(hook, /git diff --cached --quiet/)
  assert.match(hook, /pnpm secrets:web:check-local/)
  assert.notEqual(statSync(hookPath).mode & 0o111, 0)
  assert.equal(
    existsSync(resolve(repoRoot, '.github/workflows/web-env-check.yml')),
    false,
  )
})
