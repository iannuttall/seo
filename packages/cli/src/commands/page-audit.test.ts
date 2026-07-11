import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../index.js', import.meta.url))

test('audit-page works with only a URL and does not require Google data', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-page-audit-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-page-audit-cache-'))
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(
      '<title>Standalone page audit</title><h1>Standalone page audit</h1><p>Technical evidence is available without Google access.</p>',
    )
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  try {
    const result = await execFileAsync(
      process.execPath,
      [
        cliPath,
        'audit-page',
        '--url',
        `http://127.0.0.1:${address.port}`,
        '--json',
      ],
      {
        env: {
          ...process.env,
          CI: '1',
          NO_UPDATE_NOTIFIER: '1',
          SEO_CACHE_DIR: cacheDir,
          SEO_CONFIG_DIR: configDir,
        },
      },
    )
    const report = JSON.parse(result.stdout) as {
      page: { title?: string }
      metrics?: unknown
    }

    assert.equal(report.page.title, 'Standalone page audit')
    assert.equal(report.metrics, undefined)
  } finally {
    await new Promise<void>((resolve, reject) => {
      ;(server as Server).close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('report runs a technical crawl when given only a URL', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'seo-report-config-'))
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-report-cache-'))
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(
      '<title>URL-only report</title><meta name="description" content="A local technical report test."><h1>URL-only report</h1><p>This report does not need Google data to fetch technical evidence.</p>',
    )
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  try {
    const result = await execFileAsync(
      process.execPath,
      [
        cliPath,
        'report',
        '--url',
        `http://127.0.0.1:${address.port}`,
        '--crawl-max-pages',
        '1',
        '--crawl-max-depth',
        '1',
        '--json',
      ],
      {
        env: {
          ...process.env,
          CI: '1',
          NO_UPDATE_NOTIFIER: '1',
          SEO_CACHE_DIR: cacheDir,
          SEO_CONFIG_DIR: configDir,
        },
      },
    )
    const report = JSON.parse(result.stdout) as {
      output: {
        narrative: {
          diagnosis: {
            dataStatus: string
            skippedSections?: Array<{ reason: string }>
          }
        }
      }
      technicalCrawl: { status: string }
      nextCommands: Array<{ command: string }>
    }

    assert.equal(report.output.narrative.diagnosis.dataStatus, 'unavailable')
    assert.equal(report.technicalCrawl.status, 'created')
    assert.ok(
      report.output.narrative.diagnosis.skippedSections?.every((section) =>
        section.reason.includes('no Search Console property'),
      ),
    )
    assert.deepEqual(
      report.nextCommands.map((command) => command.command),
      [`seo audit-page --url http://127.0.0.1:${address.port}`, 'seo start'],
    )

    const human = await execFileAsync(
      process.execPath,
      [
        cliPath,
        'report',
        '--url',
        `http://127.0.0.1:${address.port}`,
        '--crawl-max-pages',
        '1',
        '--crawl-max-depth',
        '1',
      ],
      {
        env: {
          ...process.env,
          CI: '1',
          NO_UPDATE_NOTIFIER: '1',
          SEO_CACHE_DIR: cacheDir,
          SEO_CONFIG_DIR: configDir,
        },
      },
    )
    assert.match(human.stdout, /# Technical SEO report/)
    assert.match(
      human.stdout,
      /Technical fixes \(no Search Console data joined\)/,
    )
    assert.doesNotMatch(human.stdout, /Diagnosis unavailable/)
  } finally {
    await new Promise<void>((resolve, reject) => {
      ;(server as Server).close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await rm(configDir, { recursive: true, force: true })
    await rm(cacheDir, { recursive: true, force: true })
  }
})
