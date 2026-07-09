import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { OkfFile } from '@seo/core'
import { readOkfMarkdownFiles, writeOkfDirectory } from './okf-files.js'

function files(concepts: Array<{ name: string; url: string }> = []): OkfFile[] {
  return [
    {
      path: 'index.md',
      content: '---\nokf: "0.1"\ntype: "index"\n---\n\n# Test\n',
    },
    { path: 'log.md', content: '# Log\n' },
    {
      path: 'concepts/index.md',
      content: `# Concepts\n\n${concepts.map((item) => `- [${item.name}](${item.name})`).join('\n')}\n`,
    },
    {
      path: 'inventory/pages.md',
      content: '---\ntype: "inventory"\n---\n\n# Inventory\n\n# Citations\n',
    },
    {
      path: 'graph/links.md',
      content: '---\ntype: "graph"\n---\n\n# Graph\n\n# Citations\n',
    },
    {
      path: 'caveats.md',
      content: '---\ntype: "caveats"\n---\n\n# Caveats\n\n# Citations\n',
    },
    ...concepts.map((item) => ({
      path: `concepts/${item.name}`,
      content: `---\ntype: "webpage"\nurl: ${JSON.stringify(item.url)}\n---\n\n# Page\n\n# Citations\n`,
    })),
  ]
}

test('atomic OKF replacement removes stale managed concepts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seo-okf-write-'))
  const output = join(root, 'bundle')
  try {
    await writeOkfDirectory(
      output,
      files([{ name: 'old.md', url: 'https://example.com/old' }]),
    )
    await writeOkfDirectory(output, files())

    const written = await readOkfMarkdownFiles(output)
    assert.equal(
      written.some((file) => file.path === 'concepts/old.md'),
      false,
    )
    await assert.rejects(access(join(output, 'concepts/old.md')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('atomic OKF replacement refuses unmanaged non-empty directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seo-okf-unmanaged-'))
  const output = join(root, 'bundle')
  try {
    await mkdir(output)
    await writeFile(join(output, 'notes.txt'), 'not managed by seo')
    await assert.rejects(
      writeOkfDirectory(output, files()),
      /non-empty unmanaged directory/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
