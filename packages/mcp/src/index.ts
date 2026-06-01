import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  auditPage,
  cannibalReport,
  crawlDiff,
  createContentGroup,
  ctrUnderperformersReport,
  decayingReport,
  deleteChange,
  deleteContentGroup,
  diagnoseProperty,
  ga4PropertyIdFromName,
  ga4RowsToObjects,
  getCacheStats,
  getKeywordProvider,
  indexWatch,
  inspectUrl,
  internalLinksReport,
  listChanges,
  listContentGroups,
  listGa4AccountSummaries,
  listSearchUpdates,
  listSites,
  measureChange,
  queryClusterReport,
  querySearchAnalytics,
  quickWinsReport,
  recordChange,
  runDoctor,
  runGa4Report,
  secondPage,
  segmentImpact,
  strikingDistance,
  trafficAnomaly,
  updateCorrelation,
} from '@seo/core'
import * as z from 'zod/v4'

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

function summarize(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  }
}

function toolSuccess(
  summaryText: string,
  structuredContent: unknown,
): ToolResult {
  return {
    content: [{ type: 'text', text: summaryText }],
    structuredContent: structuredContent as Record<string, unknown>,
  }
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'seo-second-page',
    {
      description: 'Run second-page opportunity analysis',
      argsSchema: {
        site: z.string(),
        range: z.string().optional(),
        limit: z.string().optional(),
      },
    },
    async ({ site, range, limit }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Run the seo_second_page tool with site=${site}, range=${range ?? '28'}, limit=${limit ?? '5'}. Use only tool output. Quote the evidenceRef. Do not invent data.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'seo-audit-page',
    {
      description: 'Run a page audit and explain issues without inventing data',
      argsSchema: {
        url: z.string(),
      },
    },
    async ({ url }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Run seo_audit_page for ${url}. Explain findings using the returned principle and evidenceRef values only.`,
          },
        },
      ],
    }),
  )
}

function registerResources(server: McpServer): void {
  server.registerResource(
    'gsc-sites',
    'gsc://sites',
    {
      mimeType: 'application/json',
      description: 'Configured Search Console properties',
    },
    async () => {
      const sites = await listSites().catch(() => [])
      return {
        contents: [
          {
            uri: 'gsc://sites',
            text: JSON.stringify(sites, null, 2),
          },
        ],
      }
    },
  )

  server.registerResource(
    'cache-stats',
    'cache://stats',
    { mimeType: 'application/json', description: 'Local cache stats' },
    async () => ({
      contents: [
        {
          uri: 'cache://stats',
          text: JSON.stringify(getCacheStats(), null, 2),
        },
      ],
    }),
  )

  server.registerResource(
    'last-audit',
    'gsc://report/last-audit',
    { mimeType: 'text/plain', description: 'Placeholder last audit resource' },
    async () => ({
      contents: [
        {
          uri: 'gsc://report/last-audit',
          text: 'Last audit persistence is not wired yet. Use seo_audit_page directly.',
        },
      ],
    }),
  )
}

function registerTools(server: McpServer): void {
  server.registerTool(
    'seo_doctor',
    {
      description: 'Check local auth, scopes, config, and defaults',
      inputSchema: {},
    },
    async () => {
      try {
        const result = await runDoctor()
        return toolSuccess(
          result.ok
            ? 'Local seo setup is ready.'
            : 'Local seo setup needs attention.',
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'ga4_properties',
    {
      description: 'List GA4 accounts and properties available to Google OAuth',
      inputSchema: {},
    },
    async () => {
      try {
        const accountSummaries = await listGa4AccountSummaries()
        const properties = accountSummaries.flatMap((account) =>
          account.propertySummaries.map((property) => ({
            account: account.displayName ?? account.account,
            property: ga4PropertyIdFromName(property.property),
            displayName: property.displayName ?? property.property,
          })),
        )
        return toolSuccess(`${properties.length} GA4 properties found.`, {
          accountSummaries,
          properties,
        })
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_diagnose_property',
    {
      description:
        'Run end-to-end property diagnosis across anomaly, update, segment, decay, cannibalisation, and opportunity signals',
      inputSchema: {
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, days, recentDays, limit, refresh }) => {
      try {
        const result = await diagnoseProperty({
          site,
          days,
          recentDays,
          limit,
          refresh,
        })
        return toolSuccess(
          `Diagnosis complete. Classification: ${result.summary.classification}.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_segment_impact',
    {
      description:
        'Compare GSC movement by page, query, device, or country across two adjacent periods',
      inputSchema: {
        site: z.string(),
        dimension: z.enum(['page', 'query', 'country', 'device']).optional(),
        days: z.number().optional(),
        compareDays: z.number().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, dimension, days, compareDays, limit, refresh }) => {
      try {
        const result = await segmentImpact({
          site,
          dimension,
          days,
          compareDays,
          limit,
          refresh,
        })
        return toolSuccess(
          `${result.items.length} ${result.dimension} segments compared.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_striking_distance',
    {
      description: 'Find position 11-20 query/page opportunities from GSC',
      inputSchema: {
        site: z.string(),
        days: z.number().optional(),
        minImpressions: z.number().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, days, minImpressions, limit, refresh }) => {
      try {
        const result = await strikingDistance({
          site,
          days,
          minImpressions,
          limit,
          refresh,
        })
        return toolSuccess(
          `${result.items.length} striking-distance opportunities found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_content_groups',
    {
      description: 'List, create, or delete reusable page/query groups',
      inputSchema: {
        action: z.enum(['list', 'add', 'delete']),
        site: z.string().optional(),
        id: z.string().optional(),
        name: z.string().optional(),
        dimension: z.enum(['page', 'query']).optional(),
        matchType: z.enum(['equals', 'contains', 'regex']).optional(),
        pattern: z.string().optional(),
      },
    },
    async ({ action, site, id, name, dimension, matchType, pattern }) => {
      try {
        if (action === 'list') {
          const groups = listContentGroups(site)
          return toolSuccess(`${groups.length} content groups found.`, {
            groups,
          })
        }
        if (action === 'delete') {
          if (!id) throw new Error('Pass id to delete a content group.')
          const deleted = deleteContentGroup(id)
          return toolSuccess(
            deleted ? 'Content group deleted.' : 'Not found.',
            {
              id,
              deleted,
            },
          )
        }
        if (!site || !name || !pattern) {
          throw new Error(
            'Pass site, name, and pattern to add a content group.',
          )
        }
        const group = createContentGroup({
          site,
          name,
          dimension,
          matchType,
          pattern,
        })
        return toolSuccess(`Content group created: ${group.name}.`, group)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_change_log',
    {
      description: 'List or record SEO annotations and site changes',
      inputSchema: {
        action: z.enum(['list', 'add', 'delete']),
        site: z.string().optional(),
        id: z.string().optional(),
        limit: z.number().optional(),
        scope: z.enum(['site', 'page', 'query', 'group']).optional(),
        target: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        changedAt: z.string().optional(),
      },
    },
    async ({
      action,
      site,
      id,
      limit,
      scope,
      target,
      title,
      description,
      changedAt,
    }) => {
      try {
        if (action === 'list') {
          const changes = listChanges({ site, limit })
          return toolSuccess(`${changes.length} changes found.`, { changes })
        }
        if (action === 'delete') {
          if (!id) throw new Error('Pass id to delete a change.')
          const deleted = deleteChange(id)
          return toolSuccess(deleted ? 'Change deleted.' : 'Not found.', {
            id,
            deleted,
          })
        }
        if (!site || !scope || !target || !title) {
          throw new Error(
            'Pass site, scope, target, and title to add a change.',
          )
        }
        const change = recordChange({
          site,
          scope,
          target,
          title,
          description,
          changedAt: changedAt ?? new Date().toISOString().slice(0, 10),
        })
        return toolSuccess(`Change recorded: ${change.title}.`, change)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_measure_change',
    {
      description:
        'Measure before/after GSC impact for a saved or ad hoc SEO change',
      inputSchema: {
        id: z.string().optional(),
        site: z.string().optional(),
        scope: z.enum(['site', 'page', 'query', 'group']).optional(),
        target: z.string().optional(),
        title: z.string().optional(),
        changedAt: z.string().optional(),
        beforeDays: z.number().optional(),
        afterDays: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      id,
      site,
      scope,
      target,
      title,
      changedAt,
      beforeDays,
      afterDays,
      refresh,
    }) => {
      try {
        const result = await measureChange({
          id,
          site,
          scope,
          target,
          title,
          changedAt,
          beforeDays,
          afterDays,
          refresh,
        })
        return toolSuccess(
          `Measurement complete. Verdict: ${result.verdict}.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_crawl_diff',
    {
      description:
        'Crawl a bounded same-origin URL set and compare technical/page changes with the previous run',
      inputSchema: {
        startUrl: z.string().url(),
        site: z.string().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
        js: z.boolean().optional(),
      },
    },
    async ({ startUrl, site, limit, refresh, js }) => {
      try {
        const result = await crawlDiff({
          startUrl,
          site,
          limit,
          refresh,
          js: js ? true : 'auto',
        })
        return toolSuccess(
          `Crawled ${result.summary.crawled} URLs. ${result.summary.changed} changed vs previous run.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_index_watch',
    {
      description:
        'Inspect URLs with GSC URL Inspection and alert on index status changes',
      inputSchema: {
        site: z.string(),
        urls: z.array(z.string().url()),
        languageCode: z.string().optional(),
      },
    },
    async ({ site, urls, languageCode }) => {
      try {
        const result = await indexWatch({ site, urls, languageCode })
        return toolSuccess(
          `Inspected ${result.summary.inspected} URLs. ${result.summary.alerts} alerts.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_audit_page',
    {
      description: 'Run a single-page technical and content audit',
      inputSchema: {
        url: z.string().url(),
        site: z.string().optional(),
        js: z.boolean().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ url, site, js, refresh }) => {
      try {
        const result = await auditPage({
          url,
          site,
          js: js ? true : 'auto',
          refresh,
        })
        return toolSuccess(
          `Audit complete for ${url}. Found ${result.issues.length} issues.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_second_page',
    {
      description:
        'Find page-two opportunities with evidence-grounded recommendations',
      inputSchema: {
        site: z.string(),
        range: z.number().optional(),
        minImpressions: z.number().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, range, minImpressions, limit, refresh }) => {
      try {
        const result = await secondPage({
          site,
          range,
          minImpressions,
          limit,
          refresh,
        })
        return toolSuccess(
          `${result.items.length} page-two opportunities found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_cannibal',
    {
      description: 'Detect keyword cannibalisation',
      inputSchema: {
        site: z.string(),
        minImpressions: z.number().optional(),
      },
    },
    async ({ site, minImpressions }) => {
      try {
        const result = await cannibalReport({ site, minImpressions })
        return toolSuccess(
          `${result.items.length} cannibalisation clusters found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_decaying',
    {
      description: 'Detect decaying query performance',
      inputSchema: {
        site: z.string(),
        minDropPct: z.number().optional(),
      },
    },
    async ({ site, minDropPct }) => {
      try {
        const result = await decayingReport({ site, minDropPct })
        return toolSuccess(
          `${result.items.length} decaying queries found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_quick_wins',
    {
      description: 'Find quick-win CTR/position opportunities',
      inputSchema: {
        site: z.string(),
        minImpressions: z.number().optional(),
      },
    },
    async ({ site, minImpressions }) => {
      try {
        const result = await quickWinsReport({ site, minImpressions })
        return toolSuccess(`${result.items.length} quick wins found.`, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_internal_links',
    {
      description: 'Find internal link opportunities for a target URL',
      inputSchema: {
        site: z.string(),
        targetUrl: z.string().url(),
        limit: z.number().optional(),
      },
    },
    async ({ site, targetUrl, limit }) => {
      try {
        const result = await internalLinksReport({ site, targetUrl, limit })
        return toolSuccess(
          `${result.items.length} internal link opportunities found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_ctr_underperformers',
    {
      description:
        'Find high-impression queries underperforming CTR expectations',
      inputSchema: {
        site: z.string(),
        minImpressions: z.number().optional(),
      },
    },
    async ({ site, minImpressions }) => {
      try {
        const result = await ctrUnderperformersReport({ site, minImpressions })
        return toolSuccess(
          `${result.items.length} CTR underperformers found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_query_cluster',
    {
      description: 'Cluster queries by token overlap',
      inputSchema: {
        site: z.string(),
        scope: z.string().optional(),
      },
    },
    async ({ site, scope }) => {
      try {
        const result = await queryClusterReport({ site, scope })
        return toolSuccess(
          `${result.clusters.length} clusters generated.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'gsc_query',
    {
      description: 'Raw Search Console searchAnalytics/query passthrough',
      inputSchema: {
        site: z.string(),
        body: z.record(z.string(), z.any()),
      },
    },
    async ({ site, body }) => {
      try {
        const result = await querySearchAnalytics(site, body as never)
        return toolSuccess(
          `Fetched ${result.rows.length} Search Console rows.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'gsc_url_inspect',
    {
      description:
        'Inspect Google index status for one URL through Search Console URL Inspection',
      inputSchema: {
        site: z.string(),
        url: z.string().url(),
        languageCode: z.string().optional(),
      },
    },
    async ({ site, url, languageCode }) => {
      try {
        const result = await inspectUrl({
          siteUrl: site,
          inspectionUrl: url,
          languageCode,
        })
        const status = result.inspectionResult?.indexStatusResult
        return toolSuccess(
          `Inspection complete. Coverage: ${status?.coverageState ?? 'unknown'}.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'ga4_run_report',
    {
      description:
        'Run a GA4 Data API report for a property the signed-in user can access',
      inputSchema: {
        propertyId: z.string(),
        body: z.record(z.string(), z.any()),
      },
    },
    async ({ propertyId, body }) => {
      try {
        const result = await runGa4Report(propertyId, body as never)
        return toolSuccess(
          `Fetched ${result.rowCount ?? result.rows?.length ?? 0} GA4 rows.`,
          {
            ...result,
            objects: ga4RowsToObjects(result),
          },
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'search_updates',
    {
      description: 'List official Google Search Status updates and incidents',
      inputSchema: {
        product: z.string().optional(),
        limit: z.number().optional(),
      },
    },
    async ({ product, limit }) => {
      try {
        const result = await listSearchUpdates({ product, limit })
        return toolSuccess(`${result.length} official Search updates found.`, {
          updates: result,
        })
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_traffic_anomaly',
    {
      description:
        'Detect statistically significant recent GSC traffic movement',
      inputSchema: {
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, days, recentDays, refresh }) => {
      try {
        const result = await trafficAnomaly({ site, days, recentDays, refresh })
        return toolSuccess(
          `${result.anomalies.filter((item) => item.significant).length} significant anomalies found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_update_correlate',
    {
      description:
        'Overlay recent traffic anomalies against official Google ranking update windows',
      inputSchema: {
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        paddingDays: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, days, recentDays, paddingDays, refresh }) => {
      try {
        const result = await updateCorrelation({
          site,
          days,
          recentDays,
          paddingDays,
          refresh,
        })
        return toolSuccess(`Classification: ${result.classification}.`, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'semrush_call',
    {
      description:
        'Raw-ish Semrush passthrough for supported keyword endpoints',
      inputSchema: {
        endpoint: z.enum(['phrase_this', 'phrase_related', 'phrase_questions']),
        phrase: z.string(),
      },
    },
    async ({ endpoint, phrase }) => {
      try {
        const provider = getKeywordProvider('authoritative')
        if (!provider) {
          throw new Error('No keyword provider configured.')
        }

        const result =
          endpoint === 'phrase_this'
            ? await provider.keywordOverview(phrase)
            : endpoint === 'phrase_related'
              ? await provider.relatedKeywords?.(phrase)
              : await provider.questions?.(phrase)

        if (!result) {
          throw new Error(
            `Endpoint ${endpoint} is not supported by the active provider.`,
          )
        }

        return toolSuccess(summarize(result.data), result)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'seo',
      version: '0.1.0',
    },
    { capabilities: { logging: {} } },
  )

  registerTools(server)
  registerResources(server)
  registerPrompts(server)
  return server
}

export async function startMcpServer(
  opts: { test?: boolean } = {},
): Promise<void> {
  if (opts.test) {
    process.stdout.write('seo MCP server constructed successfully.\n')
    return
  }

  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
