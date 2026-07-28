import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  OKF_MAX_FILE_BYTES,
  OKF_MAX_FILES,
  OKF_MAX_VALIDATION_ISSUES,
  validateOkfFiles,
} from './okf.js'
import type { OkfFile } from './okf-types.js'

const NOW = '2026-07-28T12:00:00.000Z'

function validate(files: OkfFile[]) {
  return validateOkfFiles(files, { now: NOW })
}

test('OKF v0.1 remains valid through legacy fallbacks', () => {
  const report = validate([
    {
      path: 'index.md',
      content:
        '---\nokf_version: "0.1"\n---\n\n# Example bundle\n\n* [Metric](metrics/revenue.md)\n',
    },
    {
      path: 'log.md',
      content:
        '# Bundle Update Log\n\n## 2026-07-20\n* **Update**: Revised revenue.\n\n## 2026-07-10\n* **Creation**: Created the bundle.\n',
    },
    {
      path: 'metrics/index.md',
      content: '# Metrics\n\n* [Revenue](revenue.md)\n',
    },
    {
      path: 'metrics/revenue.md',
      content:
        '---\ntype: Metric\ntitle: Revenue\ntimestamp: 2026-07-20T10:00:00Z\ncustom_key: retained\n---\n\n# Revenue\n\nA legacy claim.\n\n# Citations\n\n[1] Source\n',
    },
  ])

  assert.equal(report.valid, true)
  assert.equal(report.formatVersion, '0.1')
  assert.equal(report.compatibility, 'v0.1')
  assert.equal(report.concepts, 1)
  assert.deepEqual(report.provenance, {
    sources: 0,
    legacyCitations: 1,
    unspecified: 0,
  })
  assert.deepEqual(report.generation, {
    generated: 0,
    legacyTimestamp: 1,
    unspecified: 0,
  })
  assert.equal(report.issueCounts.errors, 0)
  assert.equal(report.issueCounts.warnings, 0)
})

test('OKF v0.2 derives trust, lifecycle, freshness, and provenance', () => {
  const report = validate([
    {
      path: 'index.md',
      content: '---\nokf_version: "0.2"\n---\n\n# Example bundle\n',
    },
    {
      path: 'metrics/human.md',
      content:
        '---\ntype: Metric\ntitle: Human reviewed\ngenerated: { by: agent/model, at: 2026-07-20T10:00:00Z }\nverified: { by: human:reviewer, at: 2026-07-21T10:00:00Z }\nstale_after: 2026-08-01\nsources:\n  - { id: policy, resource: https://example.com/policy }\n---\n\n# Metric\n\nConfirmed claim.[^policy]\n\n[^policy]: Policy\n',
    },
    {
      path: 'metrics/machine.md',
      content:
        '---\ntype: Metric\ngenerated: { by: agent/model, at: 2026-07-20T10:00:00Z }\nverified:\n  - { by: process:nightly, at: 2026-07-21T10:00:00Z }\nstatus: draft\nstale_after: 2026-07-28\nsources:\n  - { id: query, resource: all queries in project X }\n---\n\n# Metric\n\nObserved claim.[^query]\n\n[^query]: Query scope\n',
    },
    {
      path: 'metrics/legacy.md',
      content:
        '---\ntype: Custom Metric\nstatus: deprecated\nunknown_extension: true\n---\n\n# Legacy\n\n[Missing concept](missing.md)\n',
    },
  ])

  assert.equal(report.valid, true)
  assert.equal(report.issueCounts.errors, 0)
  assert.equal(report.compatibility, 'v0.2')
  assert.deepEqual(report.trust, {
    unverified: 1,
    machineConfirmed: 1,
    humanReviewed: 1,
  })
  assert.deepEqual(report.lifecycle, {
    draft: 1,
    stable: 1,
    deprecated: 1,
    invalid: 0,
  })
  assert.deepEqual(report.freshness, {
    fresh: 1,
    stale: 1,
    unspecified: 1,
    invalid: 0,
    evaluatedOn: '2026-07-28',
  })
  assert.deepEqual(report.provenance, {
    sources: 2,
    legacyCitations: 0,
    unspecified: 1,
  })
  assert.match(
    report.issues.map((issue) => issue.message).join(' '),
    /Linked bundle path was not supplied/,
  )
})

test('generic OKF validation does not require the SEO export layout', () => {
  const report = validate([
    {
      path: 'index.md',
      content:
        '---\nokf_version: "0.2"\n---\n\n# Finance\n\n* [Revenue](computations/revenue.md)\n',
    },
    {
      path: 'computations/index.md',
      content: '# Computations\n\n* [Revenue](revenue.md)\n',
    },
    {
      path: 'computations/revenue.md',
      content:
        '---\ntype: Attested Computation\nruntime: bigquery\nparameters:\n  - { name: year, type: integer, required: true }\nexecutor:\n  resource: https://example.com/run\n  receipt: [job_id, result]\nattester:\n  resource: https://example.com/attest\n---\n\n# Computation\n\n```sql\nSELECT @year\n```\n',
    },
  ])

  assert.equal(report.valid, true)
  assert.equal(report.profile, 'okf')
  assert.equal(report.concepts, 1)
  assert.equal(report.issueCounts.errors, 0)
})

test('generic validation accepts official v0.2 compatibility edges', () => {
  const report = validate([
    {
      path: 'index.md',
      content: '# Acme bundle\n\n* [Attester](attesters/index.md)\n',
    },
    {
      path: 'log.md',
      content:
        '---\ntype: Log\ntitle: Bundle history\n---\n\n# Bundle history\n\n## 2026-07-01\n\nCreated the bundle.\n',
    },
    {
      path: 'attesters/index.md',
      content: '# Attesters\n\n* [SQL equality attester](sql_equality.py)\n',
    },
  ])

  assert.equal(report.valid, true)
  assert.equal(report.compatibility, 'undeclared')
  assert.equal(report.issueCounts.errors, 0)
  assert.equal(report.issueCounts.warnings, 1)
  assert.match(report.issues[0]?.message ?? '', /Log frontmatter is ignored/)
})

test('optional v0.2 family problems remain visible warnings', () => {
  const report = validate([
    {
      path: 'metric.md',
      content:
        '---\ntype: Metric\ngenerated: {}\nverified: []\nstatus: 200\nstale_after: soon\nsources:\n  - {}\nusage_window: { from: 2026-08-01, to: 2026-07-01 }\n---\n\n# Metric\n',
    },
  ])

  assert.equal(report.valid, true)
  assert.equal(report.issueCounts.errors, 0)
  assert.ok(report.issueCounts.warnings >= 6)
  assert.equal(report.lifecycle.invalid, 1)
  assert.equal(report.freshness.invalid, 1)
  assert.equal(report.trust.unverified, 1)
})

test('reserved files and required concept structure fail clearly', () => {
  const report = validate([
    {
      path: 'index.md',
      content: '---\nokf_version: "0.2"\ntype: index\n---\n\nNo heading\n',
    },
    {
      path: 'nested/index.md',
      content: '---\ntype: index\n---\n\n# Nested\n',
    },
    {
      path: 'log.md',
      content: '# Log\n\n* 2026-07-28 changed\n',
    },
    {
      path: 'broken.md',
      content: '---\ntitle: Missing type\n---\n\n# Broken\n',
    },
  ])

  assert.equal(report.valid, false)
  assert.ok(report.issueCounts.errors >= 4)
  assert.match(
    report.issues.map((issue) => issue.message).join(' '),
    /only contain okf_version/,
  )
  assert.match(
    report.issues.map((issue) => issue.message).join(' '),
    /Only the bundle-root index/,
  )
  assert.match(
    report.issues.map((issue) => issue.message).join(' '),
    /Log files need date headings/,
  )
  assert.match(
    report.issues.map((issue) => issue.message).join(' '),
    /non-empty type/,
  )
})

test('future versions use deterministic best-effort validation', () => {
  const files: OkfFile[] = [
    {
      path: 'index.md',
      content: '---\nokf_version: "0.3"\n---\n\n# Future bundle\n',
    },
    {
      path: 'concept.md',
      content: '---\ntype: Future concept\n---\n\n# Future\n',
    },
  ]
  const first = validate(files)
  const second = validate([...files].reverse())

  assert.deepEqual(first, second)
  assert.equal(first.valid, true)
  assert.equal(first.compatibility, 'best-effort')
  assert.equal(first.issueCounts.warnings, 1)
})

test('duplicate paths produce deterministic reports in either input order', () => {
  const files: OkfFile[] = [
    {
      path: 'index.md',
      content: '---\nokf_version: "0.2"\n---\n\n# Version two\n',
    },
    {
      path: 'index.md',
      content: '---\nokf_version: "0.1"\n---\n\n# Version one\n',
    },
  ]

  assert.deepEqual(validate(files), validate([...files].reverse()))
})

test('validation bounds files, file bytes, and retained issues', () => {
  const tooMany = validateOkfFiles(
    Array.from({ length: OKF_MAX_FILES + 1 }, (_, index) => ({
      path: `concept-${String(index).padStart(4, '0')}.md`,
      content: '---\ntype: Concept\n---\n',
    })),
    { now: NOW },
  )
  assert.equal(tooMany.valid, false)
  assert.match(tooMany.issues[0]?.message ?? '', /at most/)

  const oversized = validate([
    {
      path: 'large.md',
      content: 'x'.repeat(OKF_MAX_FILE_BYTES + 1),
    },
  ])
  assert.equal(oversized.valid, false)
  assert.match(
    oversized.issues.map((issue) => issue.message).join(' '),
    /must not exceed/,
  )

  const warnings = validate(
    Array.from({ length: OKF_MAX_VALIDATION_ISSUES + 50 }, (_, index) => ({
      path: `warning-${String(index).padStart(3, '0')}.md`,
      content: '---\ntype: Concept\nstatus: 200\n---\n',
    })),
  )
  assert.equal(warnings.valid, true)
  assert.equal(warnings.issueCounts.warnings, 300)
  assert.equal(warnings.issues.length, OKF_MAX_VALIDATION_ISSUES)
  assert.equal(warnings.issuesTruncated, true)
  assert.equal(warnings.omittedIssues, 50)
})
