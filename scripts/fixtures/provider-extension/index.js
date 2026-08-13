const PAGE_SIZE = 1_000
const SERP_PAGE_SIZE = 10

async function landingPageVisits(input, runtime) {
  const rows = []
  let page = 1
  while (rows.length < input.limit) {
    const limit = Math.min(PAGE_SIZE, input.limit - rows.length)
    const response = await runtime.requestJson({
      operation: 'landing-page-visits',
      url: `https://fixture.invalid/analytics?page=${page}&limit=${limit}`,
    })
    const batch = Array.isArray(response?.rows) ? response.rows : []
    rows.push(...batch.slice(0, limit))
    if (batch.length < limit) break
    page += 1
  }
  return {
    metric: 'landing-page-visits',
    rows,
    returnedRows: rows.length,
    retainedRowLimit: input.limit,
    retainedRowLimitReached: rows.length >= input.limit,
    dataStatus: rows.length >= input.limit ? 'partial' : 'complete',
    qualityWarnings:
      rows.length >= input.limit ? ['The fixture reached its row limit.'] : [],
  }
}

async function serpSnapshot(input, runtime) {
  const pageCount = Math.ceil(input.depth / SERP_PAGE_SIZE)
  const pages = []
  for (let page = 1; page <= pageCount; page += 1) {
    pages.push(
      await runtime.requestJson({
        operation: 'serp-snapshot',
        url: `https://fixture.invalid/serp?page=${page}&keyword=${encodeURIComponent(input.keyword)}`,
      }),
    )
  }
  const organicResults = pages
    .flatMap((page) =>
      Array.isArray(page.organicResults) ? page.organicResults : [],
    )
    .slice(0, input.depth)
  return {
    observedAt: runtime.now(),
    effectiveKeyword: input.keyword,
    searchEngineDomain: 'google.com',
    checkUrl: null,
    resultCount: null,
    pagesCount: pages.length,
    features: organicResults.length > 0 ? ['organic'] : [],
    organicResults,
    localPack: {
      present: false,
      returnedRows: 0,
      retainedRows: 0,
      invalidRows: 0,
      results: [],
    },
    coverage: {
      returnedRows: organicResults.length,
      retainedRows: organicResults.length,
      invalidRows: 0,
      providerTotalRows: null,
      completeness: 'complete',
      nextCursor: null,
    },
    request: {
      endpoint: 'fixture-serp',
      filters: { pages: pages.length },
      sort: ['rankAbsolute:ascending'],
    },
    cost: {
      estimatedMicros: 0,
      actualMicros: 0,
      taskIds: [],
    },
    qualityWarnings: [],
  }
}

export default function activate(host) {
  host.registerProvider({
    id: 'fixture',
    displayName: 'Provider fixture',
    description: 'Test provider for the external package protocol.',
    kinds: ['traffic-analytics', 'search-results'],
    connection: {
      fields: [
        { id: 'siteId', label: 'Site ID', kind: 'account', required: false },
        {
          id: 'apiKey',
          label: 'API key',
          kind: 'secret',
          required: true,
          envVar: 'SEO_PROVIDER_FIXTURE_KEY',
        },
      ],
      async verify() {},
    },
    capabilities: [
      { id: 'landing-page-visits', run: landingPageVisits },
      {
        id: 'serp-snapshot',
        defaultDepth: 10,
        maxDepth: 100,
        maxRequests: 10,
        markets: [
          {
            searchEngines: ['google'],
            devices: ['desktop', 'mobile'],
            location: 'country-only',
          },
        ],
        estimateCostMicros: () => 0,
        estimateRequests: ({ depth }) => Math.ceil(depth / SERP_PAGE_SIZE),
        run: serpSnapshot,
      },
    ],
    actions: [
      {
        id: 'echo',
        description: 'Return the supplied JSON input.',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        async run(input) {
          return { account: input.account, params: input.params }
        },
      },
    ],
  })
}
