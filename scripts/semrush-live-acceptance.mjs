import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const MARKET = {
  searchEngine: 'google',
  countryCode: 'US',
  languageCode: 'en',
}

export const SEMRUSH_LIVE_PLAN = Object.freeze({
  provider: 'semrush',
  market: MARKET,
  domain: 'semrush.com',
  keywords: ['seo', 'technical seo'],
  maximumApiUnits: 180,
  paidRequests: 6,
  checks: Object.freeze([
    { id: 'keyword-metrics', maximumRows: 2, unitsPerRow: 10 },
    { id: 'keyword-discovery', maximumRows: 3, unitsPerRow: 20 },
    { id: 'domain-overview', maximumRows: 1, unitsPerRow: 10 },
    { id: 'ranked-keywords', maximumRows: 3, unitsPerRow: 10 },
    { id: 'ranking-pages', maximumRows: 3, unitsPerRow: 10 },
    { id: 'serp-competitors', maximumRows: 3, unitsPerRow: 10 },
  ]),
})

const HELP = `Usage:
  node scripts/semrush-live-acceptance.mjs --plan
  node scripts/semrush-live-acceptance.mjs --accept-api-units 180

The live run uses six bounded paid requests and will spend no more than 180
Semrush API units. It reads the saved local credential, uses an isolated
temporary cache, and prints only an acceptance summary.
`

export function parseSemrushLiveArguments(args) {
  if (args[0] === '--') return parseSemrushLiveArguments(args.slice(1))
  if (args.length === 1 && args[0] === '--plan') return { mode: 'plan' }
  if (args.length === 1 && args[0] === '--help') return { mode: 'help' }

  const equalsArgument = args.find((value) =>
    value.startsWith('--accept-api-units='),
  )
  const flagIndex = args.indexOf('--accept-api-units')
  const acceptedValue =
    equalsArgument?.slice('--accept-api-units='.length) ??
    (flagIndex >= 0 ? args[flagIndex + 1] : undefined)
  const expectedArguments = equalsArgument
    ? [equalsArgument]
    : ['--accept-api-units', acceptedValue]

  if (
    acceptedValue === undefined ||
    args.length !== expectedArguments.length ||
    args.some((value, index) => value !== expectedArguments[index])
  ) {
    throw new Error(
      'Live acceptance requires `--accept-api-units 180`. Use `--plan` to inspect the requests without calling Semrush.',
    )
  }

  const acceptedApiUnits = Number(acceptedValue)
  if (
    !Number.isSafeInteger(acceptedApiUnits) ||
    acceptedApiUnits !== SEMRUSH_LIVE_PLAN.maximumApiUnits
  ) {
    throw new Error(
      `Set --accept-api-units to exactly ${SEMRUSH_LIVE_PLAN.maximumApiUnits} for this acceptance plan.`,
    )
  }
  return { mode: 'live', acceptedApiUnits }
}

function requestUrl(input) {
  if (input instanceof URL) return input
  if (typeof input === 'string') return new URL(input)
  if (input && typeof input === 'object' && 'url' in input) {
    return new URL(String(input.url))
  }
  throw new Error('Semrush acceptance received an unsupported request URL.')
}

function checkEvidence(id, capability, evidence, maximumRows) {
  assert.equal(evidence.provider, 'semrush', `${id} provider`)
  assert.equal(evidence.capability, capability, `${id} capability`)
  assert.equal(evidence.cache.status, 'miss', `${id} live cache state`)
  assert.ok(
    evidence.coverage.requestedRows <= maximumRows,
    `${id} requested row bound`,
  )
  assert.ok(
    evidence.coverage.returnedRows <= maximumRows,
    `${id} returned row bound`,
  )
  assert.ok(
    evidence.coverage.retainedRows <= maximumRows,
    `${id} retained row bound`,
  )
  assert.equal(evidence.cost.native?.unit, 'api-unit', `${id} cost unit`)
  assert.ok(
    Number.isSafeInteger(evidence.cost.native?.estimatedUnits),
    `${id} estimated API units`,
  )
  assert.ok(
    Number.isSafeInteger(evidence.cost.native?.actualUnits),
    `${id} actual API units`,
  )
  assert.ok(
    evidence.cost.native.actualUnits <= evidence.cost.native.estimatedUnits,
    `${id} actual API unit bound`,
  )
}

function costTotal(results, field) {
  return results.reduce(
    (sum, result) => sum + (result.cost.native?.[field] ?? 0),
    0,
  )
}

async function runLiveAcceptance(acceptedApiUnits) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'seo-semrush-live-'))
  const previousCacheDir = process.env.SEO_CACHE_DIR
  process.env.SEO_CACHE_DIR = cacheDir

  try {
    const {
      SemrushClient,
      SemrushDomainResearchProvider,
      SemrushKeywordDiscoveryProvider,
      SemrushKeywordMetricsProvider,
    } = await import('../dist/index.js')

    let balanceRequests = 0
    let paidRequests = 0
    const countedFetch = async (input, init) => {
      const url = requestUrl(input)
      if (url.hostname === 'www.semrush.com') {
        balanceRequests += 1
      } else if (url.hostname === 'api.semrush.com') {
        paidRequests += 1
      } else {
        throw new Error(
          'Semrush acceptance refused a request to an unexpected host.',
        )
      }
      return fetch(input, init)
    }

    const client = new SemrushClient({
      fetch: countedFetch,
      reportTtlMs: 5 * 60 * 1_000,
    })
    const keywordMetrics = new SemrushKeywordMetricsProvider({ client })
    const keywordDiscovery = new SemrushKeywordDiscoveryProvider({ client })
    const domainResearch = new SemrushDomainResearchProvider({ client })

    const before = await client.apiUnitBalance()
    if (before.remainingUnits < acceptedApiUnits) {
      throw new Error(
        `Semrush has ${before.remainingUnits} API units. This acceptance plan requires at least ${acceptedApiUnits}.`,
      )
    }

    const metrics = await keywordMetrics.keywordMetrics({
      keywords: SEMRUSH_LIVE_PLAN.keywords,
      market: MARKET,
      refresh: true,
    })
    checkEvidence('keyword-metrics', 'keyword-metrics', metrics, 2)

    const discovery = await keywordDiscovery.discoverKeywords({
      seeds: ['seo'],
      sources: ['ideas'],
      market: MARKET,
      limit: 3,
      refresh: true,
    })
    checkEvidence('keyword-discovery', 'keyword-discovery', discovery, 3)

    const overview = await domainResearch.domainOverview({
      domain: SEMRUSH_LIVE_PLAN.domain,
      market: MARKET,
      refresh: true,
    })
    checkEvidence('domain-overview', 'domain-overview', overview, 1)

    const rankedKeywords = await domainResearch.rankedKeywords({
      target: SEMRUSH_LIVE_PLAN.domain,
      market: MARKET,
      includeSubdomains: true,
      resultTypes: ['organic'],
      limit: 3,
      refresh: true,
    })
    checkEvidence('ranked-keywords', 'ranked-keywords', rankedKeywords, 3)

    const rankingPages = await domainResearch.rankingPages({
      domain: SEMRUSH_LIVE_PLAN.domain,
      market: MARKET,
      limit: 3,
      refresh: true,
    })
    checkEvidence('ranking-pages', 'relevant-pages', rankingPages, 3)

    const competitors = await domainResearch.serpCompetitors({
      keywords: ['seo'],
      market: MARKET,
      includeSubdomains: false,
      resultTypes: ['organic'],
      limit: 3,
      refresh: true,
    })
    checkEvidence('serp-competitors', 'serp-competitors', competitors, 3)

    const results = [
      metrics,
      discovery,
      overview,
      rankedKeywords,
      rankingPages,
      competitors,
    ]
    const estimatedApiUnits = costTotal(results, 'estimatedUnits')
    const actualApiUnits = costTotal(results, 'actualUnits')
    assert.equal(
      estimatedApiUnits,
      SEMRUSH_LIVE_PLAN.maximumApiUnits,
      'acceptance plan API unit estimate',
    )
    assert.ok(
      actualApiUnits <= acceptedApiUnits,
      'acceptance plan actual API unit bound',
    )
    assert.equal(
      paidRequests,
      SEMRUSH_LIVE_PLAN.paidRequests,
      'bounded paid request count',
    )

    const requestsBeforeCacheCheck = {
      balance: balanceRequests,
      paid: paidRequests,
    }
    const cachedMetrics = await keywordMetrics.keywordMetrics({
      keywords: SEMRUSH_LIVE_PLAN.keywords,
      market: MARKET,
    })
    assert.equal(cachedMetrics.cache.status, 'hit', 'keyword metrics cache hit')
    assert.equal(
      cachedMetrics.cost.native?.actualUnits,
      0,
      'cache hit API unit cost',
    )
    assert.deepEqual(
      { balance: balanceRequests, paid: paidRequests },
      requestsBeforeCacheCheck,
      'cache hit network requests',
    )

    const after = await client.apiUnitBalance()
    assert.ok(balanceRequests <= 24, 'bounded balance request count')

    return {
      provider: 'semrush',
      status: 'passed',
      market: MARKET,
      target: SEMRUSH_LIVE_PLAN.domain,
      checks: SEMRUSH_LIVE_PLAN.checks.map((check, index) => ({
        id: check.id,
        returnedRows: results[index].coverage.returnedRows,
        retainedRows: results[index].coverage.retainedRows,
        completeness: results[index].coverage.completeness,
      })),
      apiUnits: {
        acceptedMaximum: acceptedApiUnits,
        estimated: estimatedApiUnits,
        reportedActual: actualApiUnits,
        balanceBefore: before.remainingUnits,
        balanceAfter: after.remainingUnits,
        observedBalanceChange: before.remainingUnits - after.remainingUnits,
      },
      network: {
        balanceRequests,
        paidRequests,
      },
      cache: {
        keywordMetricsRepeat: cachedMetrics.cache.status,
        isolatedCacheRemoved: true,
      },
    }
  } finally {
    if (previousCacheDir === undefined) delete process.env.SEO_CACHE_DIR
    else process.env.SEO_CACHE_DIR = previousCacheDir
    await rm(cacheDir, { force: true, recursive: true })
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseSemrushLiveArguments(args)
  if (options.mode === 'help') {
    process.stdout.write(HELP)
    return
  }
  if (options.mode === 'plan') {
    process.stdout.write(`${JSON.stringify(SEMRUSH_LIVE_PLAN, null, 2)}\n`)
    return
  }
  const summary = await runLiveAcceptance(options.acceptedApiUnits)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirect) {
  main().catch((error) => {
    const message =
      error instanceof Error ? error.message : 'Unknown acceptance failure.'
    process.stderr.write(`Semrush live acceptance failed: ${message}\n`)
    process.exitCode = 1
  })
}
