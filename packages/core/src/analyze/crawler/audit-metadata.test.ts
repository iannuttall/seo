import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditCrawlPages } from './audit.js'
import { crawlPage as page } from './audit.test-fixtures.js'

test('auditCrawlPages reports title display estimates and metadata duplicates', () => {
  const duplicateTitle = 'Evergreen Product Guide for Search Teams'
  const duplicateDescription =
    'A clear product guide for search teams that explains the exact page value and why someone should read it today.'
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/short',
      title: 'Short',
      metaDescription: 'Too short.',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/long',
      title:
        'This is a very long page title that keeps going until it will almost certainly truncate in search results',
      metaDescription:
        'This description is intentionally long enough to prove that the crawler does not invent a fixed Google character limit for snippets.',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/duplicate-a',
      title: duplicateTitle,
      metaDescription: duplicateDescription,
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/duplicate-b',
      title: duplicateTitle.toLowerCase(),
      metaDescription: duplicateDescription.replace(/\s+/g, '  '),
      internalInlinkCount: 1,
    }),
  ])
  const metadataIssues = issues.filter((issue) => issue.category === 'metadata')

  assert.deepEqual(
    metadataIssues.map((issue) => issue.ruleId),
    [
      'title_too_wide',
      'title_duplicate',
      'meta_description_duplicate',
      'title_duplicate',
      'meta_description_duplicate',
    ],
  )
  assert.equal(
    metadataIssues.find((issue) => issue.ruleId === 'title_duplicate')?.evidence
      ?.duplicateCount,
    2,
  )
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(
        metadataIssues.find((issue) => issue.ruleId === 'title_too_wide')
          ?.evidence ?? {},
      ).filter(([key]) =>
        ['confidence', 'profile', 'referencePixels', 'status'].includes(key),
      ),
    ),
    {
      referencePixels: 580,
      status: 'over-reference',
      confidence: 'high',
      profile: {
        id: 'arial-20-v1',
        fontFamily: 'Arial',
        fontSizePixels: 20,
        fontWeight: 400,
      },
    },
  )
  assert.deepEqual(
    metadataIssues.find(
      (issue) => issue.ruleId === 'meta_description_duplicate',
    )?.evidence?.sampleUrls,
    ['https://example.com/duplicate-a', 'https://example.com/duplicate-b'],
  )
})
