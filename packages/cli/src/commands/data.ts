import {
  ga4RowsToObjects,
  inspectUrl,
  querySearchAnalytics,
  runGa4Report,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  jsonBodyArg,
  jsonFlag,
  numberArg,
  stringArg,
  projectArg,
} from '../args.js'
import { resolveClient, resolveGa4Property } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { selectedSiteOrThrow } from './shared.js'

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
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
    },
    'start-date': { type: 'string', description: 'Start date YYYY-MM-DD.' },
    'end-date': { type: 'string', description: 'End date YYYY-MM-DD.' },
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
    const json = jsonFlag(args)
    const site = await selectedSiteOrThrow(
      {
        client: projectArg(args),
        site: stringArg(args.site) ?? stringArg(body.siteUrl),
      },
      { json, refresh: booleanArg(args.refresh) },
    )
    delete body.siteUrl
    const result = await querySearchAnalytics(site, body as never, {
      refresh: booleanArg(args.refresh),
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
    printKeyValue([
      ['Property', site],
      ['Rows returned', String(rows.length)],
      ['Rows fetched', String(result.rowsFetched)],
      ['API calls', String(result.calls)],
    ])
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
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
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
    const siteUrl = await selectedSiteOrThrow(
      { client: projectArg(args), site: stringArg(args.site) },
      { json },
    )
    const inspectionUrl = stringArg(args.url)
    if (!inspectionUrl) throw new Error('Pass --url.')
    const result = await inspectUrl({
      siteUrl,
      inspectionUrl,
      languageCode: stringArg(args.language),
    })
    if (json) {
      printJson(result)
      return
    }
    const indexStatus = result.inspectionResult?.indexStatusResult
    printKeyValue([
      ['Property', siteUrl],
      ['URL', inspectionUrl],
      ['Verdict', indexStatus?.verdict ?? 'unknown'],
      ['Coverage', indexStatus?.coverageState ?? 'unknown'],
      ['Robots', indexStatus?.robotsTxtState ?? 'unknown'],
      ['Last crawl', indexStatus?.lastCrawlTime ?? 'unknown'],
      ['Google canonical', indexStatus?.googleCanonical ?? 'unknown'],
    ])
  },
})

export const ga4ReportCommand = defineCommand({
  meta: {
    name: 'ga4-report',
    description: 'Run a GA4 Data API report',
  },
  args: {
    property: {
      type: 'string',
      description: 'GA4 property ID. If omitted in a terminal, choose one.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name with an optional GA4 property.',
    },
    'start-date': { type: 'string', default: '28daysAgo' },
    'end-date': { type: 'string', default: 'yesterday' },
    dimensions: { type: 'string', default: 'landingPage' },
    metrics: { type: 'string', default: 'sessions,totalUsers,eventCount' },
    limit: { type: 'string', default: '25' },
    body: { type: 'string' },
    'body-file': { type: 'string' },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const client = await resolveClient({
      client: projectArg(args),
      options: { json },
    })
    const property = await resolveGa4Property({
      property: stringArg(args.property) ?? client?.ga4PropertyId,
      options: { json },
    })
    const body =
      (await jsonBodyArg(args.body, args['body-file'])) ??
      ({
        dateRanges: [
          {
            startDate: stringArg(args['start-date']),
            endDate: stringArg(args['end-date']),
          },
        ],
        dimensions: (csvArg(args.dimensions) ?? []).map((name) => ({ name })),
        metrics: (csvArg(args.metrics) ?? []).map((name) => ({ name })),
        limit: stringArg(args.limit),
      } as Record<string, unknown>)
    const result = await runGa4Report(property, body as never)
    if (json) {
      printJson(result)
      return
    }
    const rows = ga4RowsToObjects(result)
    printKeyValue([
      ['Property', property],
      ['Rows', String(result.rowCount ?? rows.length)],
    ])
    if (rows.length) {
      const headings = Object.keys(rows[0] ?? {})
      printTable(
        headings,
        rows
          .slice(0, 25)
          .map((row) => headings.map((heading) => row[heading] ?? '')),
      )
    }
  },
})
