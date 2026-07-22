import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { importLinkEvidence } from './import.js'
import { linkEvidenceReport } from './report.js'
import type { CollectedLinkEvidence } from './types.js'

test('CSV link imports stream, normalize, deduplicate, and retain provenance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-links-'))
  const path = join(directory, 'links.csv')
  try {
    await writeFile(
      path,
      [
        'Source URL,Target URL,Anchor Text,Nofollow',
        'https://source.example/a,https://target.example/a,"Useful, guide",yes',
        'https://source.example/a,https://target.example/a,"Useful, guide",yes',
        'not-a-url,https://target.example/b,Invalid,no',
        'https://source.example/b,https://target.example/b,"Two\nlines",no',
      ].join('\n'),
    )
    const evidence = await importLinkEvidence({ file: path })
    assert.equal(evidence.rows.length, 2)
    assert.equal(evidence.rows[0]?.anchorText, 'Useful, guide')
    assert.equal(evidence.rows[1]?.anchorText, 'Two\nlines')
    assert.equal(evidence.provenance.invalidRows, 1)
    assert.equal(evidence.provenance.duplicateRows, 1)
    assert.equal(
      evidence.provenance.file?.bytesRead,
      evidence.provenance.file?.fileBytes,
    )
    assert.equal(evidence.provenance.completeness, 'unknown')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('JSONL imports stop at the configured row bound without reading the whole file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-links-'))
  const path = join(directory, 'links.jsonl')
  try {
    await writeFile(
      path,
      Array.from({ length: 20_000 }, (_, index) =>
        JSON.stringify({
          sourceUrl: `https://source.example/${index}`,
          targetUrl: 'https://target.example/',
        }),
      ).join('\n'),
    )
    const evidence = await importLinkEvidence({ file: path, rowLimit: 3 })
    assert.equal(evidence.rows.length, 3)
    assert.equal(evidence.provenance.capped, true)
    assert.equal(evidence.provenance.completeness, 'partial')
    assert.ok(
      (evidence.provenance.file?.bytesRead ?? Infinity) <
        (evidence.provenance.file?.fileBytes ?? 0),
    )
    assert.match(evidence.warnings[0] ?? '', /stopped after 3 rows/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('link reports bound returned evidence and do not imply complete coverage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'seo-links-'))
  const path = join(directory, 'links.json')
  try {
    await writeFile(
      path,
      JSON.stringify(
        Array.from({ length: 4 }, (_, index) => ({
          source: `https://source-${index}.example/a`,
          target: 'https://target.example/a',
        })),
      ),
    )
    const evidence = await importLinkEvidence({ file: path })
    const report = linkEvidenceReport({ evidence, limit: 2 })
    assert.deepEqual(report.summary, {
      observedLinks: 4,
      referringDomains: 4,
      targetPages: 1,
      providerTargetPages: 1,
    })
    assert.equal(report.selection.returnedRows, 2)
    assert.equal(report.selection.omittedRows, 2)
    assert.equal(report.dataStatus, 'partial')
    assert.match(report.caveats[0] ?? '', /not a complete backlink index/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('link reports enforce one structured output budget for large evidence sets', () => {
  const rows = Array.from({ length: 10_000 }, (_, index) => ({
    sourceUrl: `https://source-${index}.example/post`,
    sourceDomain: `source-${index}.example`,
    targetUrl: `https://target.example/page-${index % 1_000}`,
  }))
  const evidence: CollectedLinkEvidence = {
    rows,
    targetCounts: [],
    provenance: {
      provider: 'json-import',
      observedAt: '2026-07-22T08:00:00.000Z',
      cached: false,
      suppliedRows: rows.length,
      validRows: rows.length,
      invalidRows: 0,
      duplicateRows: 0,
      capped: false,
      rowLimit: rows.length,
      completeness: 'unknown',
    },
    warnings: [],
  }

  const report = linkEvidenceReport({ evidence, limit: 500 })

  assert.equal(report.links.length, 500)
  assert.equal(report.targetCounts.length, 100)
  assert.equal(report.outputBudget.returned, 600)
  assert.ok(report.outputBudget.returned <= report.outputBudget.limit)
  assert.ok(report.outputBudget.omitted > 0)
  assert.ok(Buffer.byteLength(JSON.stringify(report)) < 250_000)
})
