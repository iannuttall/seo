import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { writeAgentMarkdownArtifacts } from './integration.js'

const llmsTxt = {
  title: 'Example',
  summary: 'Useful docs for agents.',
  sections: [{ heading: 'Start here', items: [{ path: '/' }] }],
} as const

function page(path: string, title: string, noindex = false): string {
  return `<!doctype html><html lang="en"><head>
    <title>${title}</title>
    <meta name="description" content="${title} description">
    ${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
    <link rel="canonical" href="https://example.com${path}">
  </head><body><main><h1>${title}</h1><p>Useful ${title} content.</p></main></body></html>`
}

async function fixtureDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'seo-astro-integration-'))
  await mkdir(join(directory, 'docs'), { recursive: true })
  await writeFile(join(directory, 'index.html'), page('/', 'Home'))
  await writeFile(
    join(directory, 'docs', 'index.html'),
    page('/docs', 'Docs', true),
  )
  await writeFile(
    join(directory, 'old.html'),
    '<html><head><meta http-equiv="refresh" content="0;url=/docs"></head></html>',
  )
  await writeFile(
    join(directory, '404.html'),
    page('/404', 'Missing page', true),
  )
  return directory
}

async function artifactHash(directory: string): Promise<string> {
  const values = await Promise.all(
    ['index.md', 'docs.md', 'agent-routes.json', 'llms.txt'].map((file) =>
      readFile(join(directory, file)),
    ),
  )
  return createHash('sha256').update(Buffer.concat(values)).digest('hex')
}

test('writes one deterministic artifact for each public content page', async () => {
  const directory = await fixtureDirectory()
  try {
    const first = await writeAgentMarkdownArtifacts({
      outputDir: directory,
      site: 'https://example.com',
      llmsTxt,
    })
    const firstHash = await artifactHash(directory)
    const second = await writeAgentMarkdownArtifacts({
      outputDir: directory,
      site: 'https://example.com',
      llmsTxt,
    })

    assert.equal(first.length, 2)
    assert.deepEqual(second, first)
    assert.equal(await artifactHash(directory), firstHash)
    assert.deepEqual(
      first.map((entry) => [entry.htmlPath, entry.markdownPath, entry.noindex]),
      [
        ['/', '/index.md', false],
        ['/docs', '/docs.md', true],
      ],
    )
    assert.equal(
      (
        (await readFile(join(directory, 'index.html'), 'utf8')).match(
          /type="text\/markdown"/gu,
        ) ?? []
      ).length,
      1,
    )
    await assert.rejects(readFile(join(directory, 'old.md')), /ENOENT/u)
    await assert.rejects(readFile(join(directory, '404.md')), /ENOENT/u)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('two clean checkout paths produce identical artifact bytes', async () => {
  const first = await fixtureDirectory()
  const second = await fixtureDirectory()
  try {
    await writeAgentMarkdownArtifacts({
      outputDir: first,
      site: 'https://example.com',
      llmsTxt,
    })
    await writeAgentMarkdownArtifacts({
      outputDir: second,
      site: 'https://example.com',
      llmsTxt,
    })
    assert.equal(await artifactHash(first), await artifactHash(second))
  } finally {
    await rm(first, { force: true, recursive: true })
    await rm(second, { force: true, recursive: true })
  }
})

test('refuses a conflicting hand-authored Markdown target', async () => {
  const directory = await fixtureDirectory()
  try {
    await writeFile(join(directory, 'index.md'), '# Hand-authored\n')
    await assert.rejects(
      writeAgentMarkdownArtifacts({
        outputDir: directory,
        site: 'https://example.com',
      }),
      /Refusing to overwrite existing Markdown: index\.md/u,
    )
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('supports directory, file, and mixed static build layouts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-astro-layouts-'))
  try {
    await mkdir(join(directory, 'guide'), { recursive: true })
    await writeFile(
      join(directory, 'guide', 'index.html'),
      page('/guide', 'Directory page'),
    )
    await writeFile(
      join(directory, 'reference.html'),
      page('/reference', 'File page'),
    )

    const entries = await writeAgentMarkdownArtifacts({
      outputDir: directory,
      site: 'https://example.com',
    })

    assert.deepEqual(
      entries.map((entry) => [entry.htmlFile, entry.markdownFile]),
      [
        ['guide/index.html', 'guide.md'],
        ['reference.html', 'reference.md'],
      ],
    )
    assert.match(
      await readFile(join(directory, 'guide.md'), 'utf8'),
      /# Directory page/u,
    )
    assert.match(
      await readFile(join(directory, 'reference.md'), 'utf8'),
      /# File page/u,
    )
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})
