import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { OKF_MAX_FILE_BYTES, type OkfFile } from '@seo/core'
import { readOkfMarkdownFiles, writeOkfDirectory } from './okf-files.js'

function files(concepts: Array<{ name: string; url: string }> = []): OkfFile[] {
  const provenance =
    'generated: {"by":"seo/0.2.27","at":"2026-07-28T00:00:00.000Z"}\nsources:\n  - {"id":"crawl-report","resource":"crawl report test"}'
  return [
    {
      path: 'index.md',
      content: '---\nokf_version: "0.2"\n---\n\n# Test\n',
    },
    {
      path: 'log.md',
      content:
        '# Bundle Update Log\n\n## 2026-07-28\n* **Creation**: Created the bundle.\n',
    },
    {
      path: 'concepts/index.md',
      content: `# Concepts\n\n${concepts.map((item) => `- [${item.name}](${item.name})`).join('\n')}\n`,
    },
    {
      path: 'inventory/pages.md',
      content: `---\ntype: "inventory"\n${provenance}\n---\n\n# Inventory\n`,
    },
    {
      path: 'graph/links.md',
      content: `---\ntype: "graph"\n${provenance}\n---\n\n# Graph\n`,
    },
    {
      path: 'caveats.md',
      content: `---\ntype: "caveats"\n${provenance}\n---\n\n# Caveats\n`,
    },
    ...concepts.map((item) => ({
      path: `concepts/${item.name}`,
      content: `---\ntype: "webpage"\nresource: ${JSON.stringify(item.url)}\nhttp_status: 200\n${provenance}\n---\n\n# Page\n`,
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

test('directory validation rejects oversized Markdown before reading it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seo-okf-oversized-'))
  try {
    await writeFile(
      join(root, 'large.md'),
      Buffer.alloc(OKF_MAX_FILE_BYTES + 1, 'a'),
    )
    await assert.rejects(
      readOkfMarkdownFiles(root),
      /OKF file exceeds 2000000 bytes/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
