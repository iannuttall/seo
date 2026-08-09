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

test('Conductor carries local web configuration into new workspaces', () => {
  const includedFiles = readFileSync(
    resolve(repoRoot, '.worktreeinclude'),
    'utf8',
  )
    .trim()
    .split('\n')

  assert.deepEqual(includedFiles, [
    'apps/web/.dev.vars',
    'apps/web/.dev.vars.production',
    'apps/web/.env',
    'apps/web/.env.production',
  ])

  const conductorSettings = readFileSync(
    resolve(repoRoot, '.conductor/settings.toml'),
    'utf8',
  )
  assert.match(conductorSettings, /pnpm hooks:install/)
  assert.match(conductorSettings, /preview:cloudflare --ip 127\.0\.0\.1/)
  assert.doesNotMatch(conductorSettings, /preview:cloudflare -- --ip/)
})
