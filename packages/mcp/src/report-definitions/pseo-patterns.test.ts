import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPseoPatternsHandler,
  pseoPatternsInputSchema,
} from './pseo-patterns.js'

const pairSet = {
  id: 'reader-comparisons',
  kind: 'comparison' as const,
  shape: 'pairs' as const,
  coveragePolicy: 'complete-set' as const,
  values: ['keep', 'pocket', 'readwise reader'],
  pairing: 'all-pairs' as const,
  queryTemplates: ['{left} vs {right}', '{right} vs {left}'],
  pathTemplate: '/compare/{left}-vs-{right}',
}

test('pSEO pattern report definition passes bounded pattern and market inputs to core', async () => {
  const handler = createPseoPatternsHandler({
    pseoPatternsReport: async (input) => {
      assert.equal(input.site, 'sc-domain:example.com')
      assert.equal(input.includeBrand, true)
      assert.equal(input.candidateLimit, 200)
      assert.equal(input.observedQueryLimit, 150)
      assert.equal(input.includeExternal, true)
      assert.equal(input.market?.countryCode, 'GB')
      assert.equal(input.market?.languageCode, 'en')
      assert.equal(input.market?.device, 'mobile')
      assert.equal(input.keywordLimit, 25)
      assert.equal(input.serpLimit, 2)
      assert.deepEqual(input.patternSets, [pairSet])
      return {
        summary: { verdict: 'Pattern evidence retained.' },
      } as never
    },
  })

  await handler({
    site: 'sc-domain:example.com',
    patternSets: [pairSet],
    candidateLimit: 200,
    observedQueryLimit: 150,
    includeExternal: true,
    countryCode: 'GB',
    languageCode: 'en',
    device: 'mobile',
    keywordLimit: 25,
    serpLimit: 2,
  })
})

test('pSEO pattern schema supports general term, pair, and matrix shapes', () => {
  const result = pseoPatternsInputSchema.safeParse({
    site: 'sc-domain:example.com',
    patternSets: [
      {
        id: 'templates',
        kind: 'template',
        shape: 'terms',
        values: ['research brief', 'content brief'],
        queryTemplates: ['{value} template'],
        pathTemplate: '/templates/{value}',
      },
      pairSet,
      {
        id: 'local-tools',
        kind: 'utility',
        shape: 'matrix',
        axes: [
          { id: 'tool', values: ['reading time', 'word count'] },
          { id: 'location', values: ['London', 'Manchester'] },
        ],
        queryTemplates: ['{tool} tool for {location}'],
        pathTemplate: '/tools/{tool}/{location}',
      },
    ],
  })
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.includeBrand, true)
    assert.equal(result.data.includeExternal, false)
    assert.equal(result.data.patternSets[0]?.coveragePolicy, 'evidence-led')
  }
})

test('pSEO pattern schema rejects unbounded or contradictory work before acquisition', () => {
  for (const input of [
    { site: 'sc-domain:example.com', candidateLimit: 251 },
    { site: 'sc-domain:example.com', observedQueryLimit: 251 },
    { site: 'sc-domain:example.com', includeExternal: true },
    {
      site: 'sc-domain:example.com',
      countryCode: 'GB',
      languageCode: 'en',
    },
    {
      site: 'sc-domain:example.com',
      patternSets: [{ ...pairSet, pairing: 'anchor' }],
    },
    {
      site: 'sc-domain:example.com',
      patternSets: [{ ...pairSet, pairing: 'explicit', pairs: undefined }],
    },
    {
      site: 'sc-domain:example.com',
      patternSets: [
        {
          id: 'bad-shape',
          kind: 'comparison',
          shape: 'terms',
          values: ['keep'],
          queryTemplates: ['{value}'],
        },
      ],
    },
    {
      site: 'sc-domain:example.com',
      patternSets: Array.from({ length: 11 }, (_, index) => ({
        id: `templates-${index}`,
        kind: 'template',
        shape: 'terms',
        values: ['brief'],
        queryTemplates: ['{value} template'],
      })),
    },
  ]) {
    assert.equal(
      pseoPatternsInputSchema.safeParse(input).success,
      false,
      JSON.stringify(input),
    )
  }
})

test('pSEO pattern handler keeps the combined result inside one agent output budget', async () => {
  const candidates = Array.from({ length: 250 }, (_, index) => ({
    id: `candidate-${index}`,
    review: 'Bounded review evidence. '.repeat(250),
    samplePages: Array.from(
      { length: 10 },
      (_, pageIndex) => `https://example.test/${index}/${pageIndex}`,
    ),
  }))
  const handler = createPseoPatternsHandler({
    pseoPatternsReport: async () =>
      ({
        schemaVersion: 1,
        site: 'sc-domain:example.test',
        generatedAt: '2026-07-26T12:00:00.000Z',
        dataStatus: 'partial',
        source: { rowsFetched: 50_000, possiblyTruncated: true },
        selection: { candidateLimit: 250 },
        summary: { verdict: 'Bounded pattern evidence was retained.' },
        patternSets: candidates,
        candidates,
        caveats: ['Search Console evidence is capped.'],
        nextSteps: [],
      }) as never,
  })

  const result = await handler({ site: 'sc-domain:example.test' })
  const outputBudget = result.structuredContent?.outputBudget as Record<
    string,
    unknown
  >
  assert.equal(outputBudget.truncated, true)
  assert.ok(
    Buffer.byteLength(JSON.stringify(result.structuredContent)) <= 98_304,
  )
  assert.deepEqual(result.structuredContent?.source, {
    rowsFetched: 50_000,
    possiblyTruncated: true,
  })
})
