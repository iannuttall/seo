import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  ga4PropertyIdFromName,
  ga4RowsToObjects,
  inspectUrl,
  listGa4AccountSummaries,
  listSearchUpdates,
  querySearchAnalytics,
  runGa4Report,
} from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from './tool-result.js'

export function registerDataTools(server: McpServer): void {
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
}
