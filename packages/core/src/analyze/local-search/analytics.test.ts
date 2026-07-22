import assert from 'node:assert/strict'
import test from 'node:test'
import { localAnalyticsEvidence } from './analytics.js'

const templates = [
  {
    heuristic: true as const,
    signature: '/plumbers/:value',
    urlCount: 2,
    sampleUrls: [
      'https://example.test/plumbers/london',
      'https://example.test/plumbers/manchester',
    ],
    queryCount: 2,
    clicks: 3,
    impressions: 100,
  },
]

function analyticsResult(rows: string[][]) {
  return {
    dimensionHeaders: [
      { name: 'landingPagePlusQueryString' },
      { name: 'country' },
      { name: 'region' },
      { name: 'city' },
    ],
    metricHeaders: [{ name: 'sessions' }],
    rows: rows.map(([path, country, region, city, sessions]) => ({
      dimensionValues: [path, country, region, city].map((value) => ({
        value,
      })),
      metricValues: [sessions].map((value) => ({ value })),
    })),
    rowCount: rows.length,
  }
}

const input = {
  propertyId: '123',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  limit: 5_000,
  localPageUrls: [
    'https://example.test/plumbers/london',
    'https://example.test/plumbers/manchester',
  ],
  templates,
}

test('joins Analytics geography only through retained landing-page paths', async () => {
  const requests: unknown[] = []
  const rows = [
    [
      '/plumbers/london?source=one',
      'United Kingdom',
      'England',
      'London',
      '10',
    ],
    ['/plumbers/london?source=two', 'United Kingdom', 'England', 'London', '5'],
    ['/plumbers/manchester', 'United Kingdom', 'England', 'Manchester', '7'],
    ['/unrelated', 'United States', 'California', 'Los Angeles', '100'],
  ]
  const report = await localAnalyticsEvidence(input, {
    runReport: async (_propertyId, request) => {
      requests.push(request)
      return analyticsResult(rows)
    },
  })

  assert.equal(report.status, 'complete')
  assert.equal(report.source.returnedRows, 4)
  assert.equal(report.source.matchedRows, 3)
  assert.equal(report.source.matchedPages, 2)
  assert.equal(report.source.unmatchedRows, 1)
  assert.deepEqual(
    report.locations.map((location) => [location.city, location.sessions]),
    [
      ['London', 15],
      ['Manchester', 7],
    ],
  )
  assert.equal(report.locations[0]?.retainedSessionShare, 15 / 22)
  assert.deepEqual(report.templates[0], {
    signature: '/plumbers/:value',
    sessions: 22,
    landingPages: 2,
    locations: report.locations,
    locationCoverage: { available: 2, returned: 2, omitted: 0 },
  })
  assert.deepEqual(
    (requests[0] as { dimensions: Array<{ name: string }> }).dimensions.map(
      (dimension) => dimension.name,
    ),
    ['landingPagePlusQueryString', 'country', 'region', 'city'],
  )
})

test('keeps malformed, duplicate, capped, and quality states visible', async () => {
  const duplicate = [
    '/plumbers/london',
    'United Kingdom',
    'England',
    'London',
    '10',
  ]
  const report = await localAnalyticsEvidence(
    { ...input, limit: 3 },
    {
      runReport: async () => ({
        ...analyticsResult([
          duplicate,
          duplicate,
          [
            '/plumbers/manchester',
            'United Kingdom',
            'England',
            'Manchester',
            'bad',
          ],
        ]),
        rowCount: 20,
        metadata: { subjectToThresholding: true },
      }),
    },
  )

  assert.equal(report.status, 'partial')
  assert.equal(report.source.limitReached, true)
  assert.equal(report.source.invalidRows, 1)
  assert.equal(report.source.exactDuplicateRows, 1)
  assert.equal(report.source.matchedRows, 1)
  assert.match(report.source.qualityWarnings.join(' '), /thresholding/)
})

test('skips acquisition without local pages and isolates Analytics failures', async () => {
  let calls = 0
  const skipped = await localAnalyticsEvidence(
    { ...input, localPageUrls: [] },
    {
      runReport: async () => {
        calls++
        return analyticsResult([])
      },
    },
  )
  assert.equal(skipped.status, 'skipped')
  assert.equal(calls, 0)

  const unavailable = await localAnalyticsEvidence(input, {
    runReport: async () => {
      throw new Error('connection failed')
    },
  })
  assert.equal(unavailable.status, 'unavailable')
  assert.equal(unavailable.reason, 'connection failed')
})

test('returns the same geography order when provider rows are reversed', async () => {
  const rows = [
    ['/plumbers/london', 'United Kingdom', 'England', 'London', '5'],
    ['/plumbers/manchester', 'United Kingdom', 'England', 'Manchester', '5'],
  ]
  const run = (values: string[][]) =>
    localAnalyticsEvidence(input, {
      runReport: async () => analyticsResult(values),
    })
  assert.deepEqual(await run(rows), await run([...rows].reverse()))
})

test('keeps ten thousand Analytics rows and every returned list bounded', async () => {
  const rowCount = 10_000
  const rows = Array.from({ length: rowCount }, (_, index) => [
    `/plumbers/city-${index}`,
    'United Kingdom',
    `Region ${index % 50}`,
    `City ${index % 100}`,
    '1',
  ])
  let calls = 0
  const report = await localAnalyticsEvidence(
    {
      ...input,
      limit: rowCount,
      templates: [{ ...templates[0]!, signature: '/plumbers/:slug' }],
      localPageUrls: rows.map(([path]) => `https://example.test${path ?? '/'}`),
    },
    {
      runReport: async () => {
        calls++
        return analyticsResult(rows)
      },
    },
  )

  assert.equal(calls, 1)
  assert.equal(report.source.returnedRows, rowCount)
  assert.equal(report.source.matchedRows, rowCount)
  assert.equal(report.source.matchedPages, rowCount)
  assert.equal(report.locations.length, 25)
  assert.equal(report.locationCoverage.available, 100)
  assert.equal(report.locationCoverage.omitted, 75)
  assert.equal(report.templates.length, 1)
  assert.equal(report.templates[0]?.locations.length, 3)
})
