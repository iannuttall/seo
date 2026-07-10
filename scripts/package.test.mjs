import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

test('the public package exposes one unscoped API, CLI, and MCP surface', () => {
  assert.equal(packageJson.name, 'seo')
  assert.equal(packageJson.private, undefined)
  assert.equal(packageJson.bin.seo, './dist/cli.js')
  assert.equal(packageJson.exports['.'].import, './dist/index.js')
  assert.equal(packageJson.exports['./mcp'].import, './dist/mcp.js')
  assert.equal(packageJson.license, 'Apache-2.0')
})

test('public runtime bundles do not depend on private workspace packages', async () => {
  const files = (await readdir('dist')).filter((file) => file.endsWith('.js'))
  assert.ok(files.length >= 3)
  for (const file of files) {
    const source = await readFile(`dist/${file}`, 'utf8')
    assert.doesNotMatch(source, /(?:from\s*|import\()['"]@seo\//)
  }
})

test('the CLI bundle is executable and skills ship in the package', async () => {
  const cli = await readFile('dist/cli.js', 'utf8')
  assert.match(cli, /^#!\/usr\/bin\/env node\n/)

  const skillFolders = await readdir('skills', { withFileTypes: true })
  const skills = skillFolders.filter((entry) => entry.isDirectory())
  assert.ok(skills.length > 0)
  for (const skill of skills) {
    const source = await readFile(`skills/${skill.name}/SKILL.md`, 'utf8')
    assert.match(source, /^---\nname: /)
  }
})

test('the public package includes its privacy policy and terms', async () => {
  await Promise.all([
    readFile('PRIVACY.md', 'utf8'),
    readFile('TERMS.md', 'utf8'),
  ])
  assert.ok(packageJson.files.includes('PRIVACY.md'))
  assert.ok(packageJson.files.includes('TERMS.md'))
})

test('root runtime dependencies cover private workspace dependencies', async () => {
  const workspaceFiles = [
    'packages/core/package.json',
    'packages/cli/package.json',
    'packages/mcp/package.json',
  ]

  for (const file of workspaceFiles) {
    const workspacePackage = JSON.parse(await readFile(file, 'utf8'))
    for (const [name, version] of Object.entries(
      workspacePackage.dependencies ?? {},
    )) {
      if (name.startsWith('@seo/')) continue
      assert.equal(
        packageJson.dependencies[name],
        version,
        `${name} from ${file} must match the public package`,
      )
    }
  }
})
