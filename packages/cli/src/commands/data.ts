import {
  inspectUrl,
  localError,
  localRefreshClicky,
  localResearchKeys,
  querySearchAnalytics,
  SeoError,
} from '@seo/core'
import {
  BRAND_CLASSES,
  BRAND_DATA_FROM,
  type BrandClass,
  DEVICES,
  type Device,
  DIMENSIONS,
  type Dimension,
  dateWindow,
  rowTextFilters,
  runBingRows,
  runClickyRows,
  runRows,
  runSimpleAnalyticsRows,
  SEARCH_TYPES,
  type SearchType,
  SORTS,
  type Sort,
} from '@seo/core/commands'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  jsonBodyArg,
  jsonFlag,
  numberArg,
  strictNumberArg,
  stringArg,
} from '../args.js'
import { requireSite } from '../selection.js'
import { printJson, printTable } from '../utils.js'
import {
  cliCall,
  common,
  dates,
  detail,
  detailArg,
  property,
  run,
  SIMPLE_ANALYTICS_CONNECT,
} from './core-commands.js'
import { printReportSummary } from './output.js'

export const gscQueryCommand = defineCommand({
  meta: {
    name: 'gsc-query',
    description: 'Run a raw Search Console Search Analytics query',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    account: {
      type: 'string',
      description: 'Saved Google account email.',
    },
    'start-date': { type: 'string', description: 'Start date YYYY-MM-DD.' },
    'end-date': {
      type: 'string',
      description:
        'End date YYYY-MM-DD. Without dates: the last 28 days of final data.',
    },
    dimensions: {
      type: 'string',
      description: 'Comma-separated GSC dimensions, for example query,page.',
    },
    type: { type: 'string', description: 'Search type. Defaults to web.' },
    limit: {
      type: 'string',
      description: 'Maximum rows to request and print.',
    },
    body: { type: 'string', description: 'Raw Search Analytics JSON body.' },
    'body-file': {
      type: 'string',
      description: 'Path to a Search Analytics JSON body file.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh GSC data.',
    },
  },
  run: async ({ args }) => {
    const body =
      (await jsonBodyArg(args.body, args['body-file'])) ??
      ({
        startDate: stringArg(args['start-date']),
        endDate: stringArg(args['end-date']),
        dimensions: csvArg(args.dimensions) ?? ['query', 'page'],
        type: stringArg(args.type) ?? 'web',
        rowLimit: numberArg(args.limit),
        dataState: 'final',
      } as Record<string, unknown>)
    // Missing dates default to the last 28 days of final data, as in seo
    // report; a start date alone runs to the latest final day.
    try {
      Object.assign(
        body,
        dateWindow(
          {
            startDate: stringArg(body.startDate),
            endDate: stringArg(body.endDate),
          },
          28,
        ),
      )
    } catch (error) {
      throw localError(error)
    }
    const json = jsonFlag(args)
    const site = requireSite(stringArg(args.site) ?? stringArg(body.siteUrl))
    delete body.siteUrl
    const result = await querySearchAnalytics(site, body as never, {
      refresh: booleanArg(args.refresh),
      accountEmail: stringArg(args.account),
    })
    const limit = numberArg(args.limit)
    const rows = limit ? result.rows.slice(0, limit) : result.rows
    if (json) {
      printJson({
        site,
        request: body,
        ...result,
        rows,
        rowsReturned: rows.length,
      })
      return
    }
    printReportSummary({
      title: 'Search Console query',
      target: site,
      status: result.rowsFetched > rows.length ? 'unknown' : 'info',
      summary: `${rows.length} rows returned from ${result.rowsFetched} fetched rows.`,
      metrics: [
        { label: 'Rows returned', value: rows.length },
        { label: 'Rows fetched', value: result.rowsFetched },
        { label: 'API calls', value: result.calls },
      ],
    })
    printTable(
      ['Keys', 'Clicks', 'Impr', 'CTR', 'Pos'],
      rows
        .slice(0, 25)
        .map((row) => [
          row.keys.join(' | '),
          Math.round(row.clicks),
          Math.round(row.impressions),
          row.ctr.toFixed(3),
          row.position.toFixed(1),
        ]),
    )
  },
})

export const urlInspectCommand = defineCommand({
  meta: {
    name: 'url-inspect',
    description: 'Inspect a URL with the Search Console URL Inspection API',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    account: {
      type: 'string',
      description: 'Saved Google account email.',
    },
    url: { type: 'string', description: 'URL to inspect.' },
    language: {
      type: 'string',
      description: 'Optional inspection language code.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const siteUrl = requireSite(stringArg(args.site))
    const inspectionUrl = stringArg(args.url)
    if (!inspectionUrl) throw new Error('Pass --url.')
    const result = await inspectUrl({
      siteUrl,
      inspectionUrl,
      accountEmail: stringArg(args.account),
      languageCode: stringArg(args.language),
    })
    if (json) {
      printJson(result)
      return
    }
    const indexStatus = result.inspectionResult?.indexStatusResult
    printReportSummary({
      title: 'URL Inspection',
      target: inspectionUrl,
      status:
        indexStatus === undefined
          ? 'unknown'
          : indexStatus.verdict === 'PASS'
            ? 'pass'
            : 'warning',
      summary:
        indexStatus === undefined
          ? 'Google did not return index status evidence for this URL.'
          : `${indexStatus.verdict ?? 'Unknown'}: ${indexStatus.coverageState ?? 'Coverage state unavailable'}.`,
      metrics: [
        { label: 'Property', value: siteUrl },
        { label: 'Robots', value: indexStatus?.robotsTxtState ?? 'Unknown' },
        { label: 'Last crawl', value: indexStatus?.lastCrawlTime ?? 'Unknown' },
        {
          label: 'Google canonical',
          value: indexStatus?.googleCanonical ?? 'Unknown',
        },
      ],
    })
  },
})

export const dataCommand = defineCommand({
  meta: {
    name: 'data',
    description:
      'Raw Search Console or Bing rows beside the previous period, or Clicky or Simple Analytics landing pages',
  },
  args: {
    site: {
      type: 'string',
      description: 'Site, URL or Search Console property.',
    },
    source: {
      type: 'string',
      description:
        'search_console (default), bing, clicky or simple_analytics. Bing takes the first dimension, query or page. Clicky takes the site or its Clicky site ID. Simple Analytics takes the site.',
    },
    dimensions: {
      type: 'string',
      description: `Comma-separated: ${DIMENSIONS.join(', ')}. Default query (page for discover and google_news).`,
    },
    page: {
      type: 'string',
      description: 'Optional: only rows for pages whose URL contains this.',
    },
    query: {
      type: 'string',
      description: 'Optional: only rows for queries that contain this.',
    },
    'page-regex': {
      type: 'string',
      description:
        'Optional: only rows for pages whose URL matches this RE2 regular expression.',
    },
    'query-regex': {
      type: 'string',
      description:
        'Optional: only rows for queries that match this RE2 regular expression.',
    },
    'exclude-query-regex': {
      type: 'string',
      description:
        'Optional: leave out queries that match this RE2 regular expression, such as your brand.',
    },
    'search-type': {
      type: 'string',
      description: `Optional: ${Object.keys(SEARCH_TYPES).join(', ')}. Default web. discover and google_news have pages but no queries or positions.`,
    },
    sort: {
      type: 'string',
      description: `Optional row order: ${SORTS.join(', ')}. Default clicks (date order when grouped by date). position puts the best first; the gains and losses compare with the previous period.`,
    },
    'min-impressions': {
      type: 'string',
      description:
        'Optional: leave out rows with fewer impressions than this, so ctr and position sorts skip rows seen once or twice.',
    },
    brand: {
      type: 'string',
      description: `Optional: Google's own brand split, ${BRAND_CLASSES.join(' or ')}. Top-level properties with enough searches only, from ${BRAND_DATA_FROM}, and not with query filters.`,
    },
    country: {
      type: 'string',
      description:
        'Optional: comma-separated three-letter country codes, such as fra,bel,che, for rows from any of them.',
    },
    device: {
      type: 'string',
      description: `Optional: comma-separated ${DEVICES.join(', ')}.`,
    },
    ...dates,
    ...detail,
    ...common,
  },
  run: async ({ args }) => {
    const asked = csvArg(args.dimensions)
    const dimensions = asked ?? ['query']
    const unknown = dimensions.filter(
      (dimension) => !DIMENSIONS.includes(dimension as Dimension),
    )
    if (unknown.length) {
      throw new SeoError(
        'INVALID_INPUT',
        `Unknown dimensions: ${unknown.join(', ')}. Use ${DIMENSIONS.join(', ')}.`,
      )
    }
    const source = stringArg(args.source) ?? 'search_console'
    if (
      !['search_console', 'bing', 'clicky', 'simple_analytics'].includes(source)
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        '--source is search_console, bing, clicky or simple_analytics.',
      )
    }
    if (source === 'simple_analytics') {
      const site = requireSite(stringArg(args.site))
      await run(args, async () =>
        runSimpleAnalyticsRows(
          {
            site,
            startDate: stringArg(args['start-date']),
            endDate: stringArg(args['end-date']),
            detail: detailArg(args),
            offset: numberArg(args.offset),
          },
          await localResearchKeys(),
          {
            connect: SIMPLE_ANALYTICS_CONNECT,
            call: (offset) =>
              cliCall('data', {
                source: 'simple_analytics',
                site,
                detail: 'rows',
                offset,
              }),
          },
        ),
      )
      return
    }
    if (source === 'clicky') {
      const site = requireSite(stringArg(args.site))
      await run(args, async () =>
        runClickyRows(
          {
            site,
            startDate: stringArg(args['start-date']),
            endDate: stringArg(args['end-date']),
            detail: detailArg(args),
            offset: numberArg(args.offset),
          },
          await localResearchKeys(),
          {
            connect:
              'save it at https://seoskill.dev/account#keys and run `seo login`, or run `seo analytics clicky connect` to keep it on this machine only.',
            refresh: localRefreshClicky,
            call: (offset) =>
              cliCall('data', {
                source: 'clicky',
                site,
                detail: 'rows',
                offset,
              }),
          },
        ),
      )
      return
    }
    // Bing needs only Bing: its own site list matches the site.
    if (source === 'bing') {
      const site = requireSite(stringArg(args.site))
      await run(args, (deps) =>
        runBingRows(
          {
            site,
            dimension: dimensions[0] === 'page' ? 'page' : 'query',
            startDate: stringArg(args['start-date']),
            endDate: stringArg(args['end-date']),
            detail: detailArg(args),
            offset: numberArg(args.offset),
          },
          deps,
        ),
      )
      return
    }
    const searchType = stringArg(args['search-type']) ?? 'web'
    if (!(searchType in SEARCH_TYPES)) {
      throw new SeoError(
        'INVALID_INPUT',
        `--search-type is ${Object.keys(SEARCH_TYPES).join(', ')}.`,
      )
    }
    const sort = stringArg(args.sort)
    if (sort && !SORTS.includes(sort as Sort)) {
      throw new SeoError('INVALID_INPUT', `--sort is ${SORTS.join(', ')}.`)
    }
    const minImpressions = strictNumberArg(
      args['min-impressions'],
      '--min-impressions',
    )
    if (
      minImpressions !== undefined &&
      !(Number.isInteger(minImpressions) && minImpressions >= 1)
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        '--min-impressions is a whole number of 1 or more.',
      )
    }
    const brand = stringArg(args.brand)
    if (brand && !BRAND_CLASSES.includes(brand as BrandClass)) {
      throw new SeoError(
        'INVALID_INPUT',
        `--brand is ${BRAND_CLASSES.join(' or ')}.`,
      )
    }
    const countries = csvArg(args.country)
    if (countries?.some((code) => !/^[A-Za-z]{3}$/.test(code))) {
      throw new SeoError(
        'INVALID_INPUT',
        '--country takes three-letter country codes, such as fra,bel,che.',
      )
    }
    const devices = csvArg(args.device)?.map((device) => device.toLowerCase())
    if (devices?.some((device) => !DEVICES.includes(device as Device))) {
      throw new SeoError('INVALID_INPUT', `--device is ${DEVICES.join(', ')}.`)
    }
    const site = await property(args, stringArg(args.site))
    const filters = rowTextFilters({
      page: stringArg(args.page),
      query: stringArg(args.query),
      pageRegex: stringArg(args['page-regex']),
      queryRegex: stringArg(args['query-regex']),
      excludeQueryRegex: stringArg(args['exclude-query-regex']),
    })
    await run(args, (deps) =>
      runRows(
        {
          site,
          dimensions: asked as Dimension[] | undefined,
          filters,
          searchType: searchType as SearchType,
          brand: brand as BrandClass | undefined,
          countries,
          devices: devices as Device[] | undefined,
          sort: sort as Sort | undefined,
          minImpressions,
          startDate: stringArg(args['start-date']),
          endDate: stringArg(args['end-date']),
          detail: detailArg(args),
          offset: numberArg(args.offset),
        },
        deps,
      ),
    )
  },
})
