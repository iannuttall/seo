import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decayClusterDrafts } from './workflows/refresh-priorities.js'

test('decayClusterDrafts promotes material decay clusters', () => {
  const drafts = decayClusterDrafts({
    site: 'sc-domain:example.com',
    groups: [
      {
        label: 'Salary page - lost impressions',
        diagnosis: 'lost_impressions',
        count: 8,
        totalClickLoss: 42,
        template: {
          id: 'country-salary',
          label: 'Country salary page',
        },
        sampleUrls: ['https://example.com/a/'],
        sampleQueries: ['teacher salary', 'nurse salary'],
        recommendation: 'Refresh salary data.',
      },
      {
        label: 'Tiny page - lost ctr',
        diagnosis: 'lost_ctr',
        count: 1,
        totalClickLoss: 2,
        template: { id: 'other', label: 'Other page' },
        sampleUrls: ['https://example.com/b/'],
        sampleQueries: ['tiny query'],
        recommendation: 'Review title.',
      },
    ],
  })

  assert.equal(drafts.length, 1)
  assert.equal(drafts[0]?.source, 'decay')
  assert.equal(drafts[0]?.impact, 42)
  assert.equal(drafts[0]?.target, 'https://example.com/a/')
  assert.match(drafts[0]?.evidence ?? '', /teacher salary/)
})
